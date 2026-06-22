import { Hono } from 'hono'
import net from 'node:net'
import { promises as dnsp } from 'node:dns'
import vm from 'node:vm'
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import { Innertube, UniversalCache, Platform } from 'youtubei.js'

/**
 * YouTube Music source — mirrors the JioSaavn API contract so the client can
 * treat both sources identically. Returns the same canonical song shape
 * (id, name, artists, album, image[], downloadUrl[], duration) tagged with
 * `source: 'youtube'`. Audio is NOT a static CDN link (YouTube URLs expire and
 * are IP-locked); instead each song's downloadUrl points back at our own
 * /api/youtube/stream endpoint, which resolves a fresh stream per play and
 * proxies the bytes (with HTTP range support for seeking).
 */

const youtube = new Hono()

// Public origin used to build ABSOLUTE image-proxy URLs the browser can load.
// Cover-art URLs are consumed directly as <img src>, so (unlike downloadUrl,
// which the client rebuilds) they must point at THIS backend. Prefer an
// explicit env (correct behind an HTTPS reverse proxy like an HF Space);
// otherwise derive it from the incoming request (right for local dev).
let SELF_ORIGIN = process.env.PUBLIC_BASE_URL || ''
youtube.use('*', async (c, next) => {
  if (process.env.PUBLIC_BASE_URL) {
    SELF_ORIGIN = process.env.PUBLIC_BASE_URL
  } else {
    try {
      const u = new URL(c.req.url)
      // Behind a reverse proxy (e.g. an HF Space) the request URL is the internal
      // http://…:7860 origin. Trust the forwarded headers so proxied image URLs use
      // the PUBLIC https origin and don't trip mixed-content on an https client.
      const proto = (c.req.header('x-forwarded-proto') || u.protocol.replace(/:$/, '')).split(',')[0].trim()
      const host = (c.req.header('x-forwarded-host') || c.req.header('host') || u.host).split(',')[0].trim()
      SELF_ORIGIN = `${proto}://${host}`
    } catch { /* keep last good value */ }
  }
  await next()
})

// ---- Decipher evaluator --------------------------------------------------
// youtubei.js v17 ships no JS evaluator for signature/n-param deciphering, so
// we provide one. data.output is a JS function body that ends in `return {...}`,
// so we run it in a locked-down node:vm context with only the globals the
// player script needs. Set once on the Platform shim.
let evaluatorInstalled = false
function installEvaluator() {
  if (evaluatorInstalled) return
  const shim = Platform.shim
  Platform.load({
    ...shim,
    eval: (data: any) => {
      const sandbox = {
        URL, URLSearchParams, encodeURIComponent, decodeURIComponent,
        Object, Array, String, Number, Boolean, Math, JSON, RegExp,
        Map, Set, Symbol, Date, isNaN, parseInt, parseFloat,
        TypeError, Error, escape, unescape
      }
      const ctx = vm.createContext(sandbox)
      return vm.runInContext(`(function(){\n${data.output}\n})()`, ctx, { timeout: 5000 })
    }
  })
  evaluatorInstalled = true
}

// ---- yt-dlp stream resolver ----------------------------------------------
// youtubei.js can't get an unthrottled audio URL (googlevideo 403s past the
// first ~1 MB without a PO token). yt-dlp's android/ios player_client returns a
// FULL, seekable, unthrottled URL — so we shell out to it just for the audio
// URL, cache it, and proxy the bytes ourselves.
const YT_URL_TTL = 60 * 60 * 1000 // 1h (the googlevideo URL's own expiry window)
const streamUrlCache = new Map<string, { url: string; at: number }>()

// Candidate ways to invoke yt-dlp (binary first, then python module). The first
// that succeeds is remembered. Override the binary with env YTDLP_PATH.
const YTDLP_CANDIDATES: Array<{ cmd: string; pre: string[] }> = [
  { cmd: process.env.YTDLP_PATH || 'yt-dlp', pre: [] },
  { cmd: 'python', pre: ['-m', 'yt_dlp'] },
  { cmd: 'python3', pre: ['-m', 'yt_dlp'] }
]
let ytdlpResolved: { cmd: string; pre: string[] } | null = null

function runYtdlp(args: string[]): Promise<string> {
  const tryOne = (c: { cmd: string; pre: string[] }) =>
    new Promise<string>((resolve, reject) => {
      execFile(c.cmd, [...c.pre, ...args], { timeout: 25000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
        if (err) reject(err)
        else resolve(String(stdout || '').trim())
      })
    })
  if (ytdlpResolved) return tryOne(ytdlpResolved)
  // Probe candidates in order, lock in the first that works.
  return (async () => {
    let lastErr: any
    for (const cand of YTDLP_CANDIDATES) {
      try {
        const out = await tryOne(cand)
        ytdlpResolved = cand
        return out
      } catch (e) { lastErr = e }
    }
    throw lastErr
  })()
}

// ---- Persistent resolver (warm yt_dlp) -----------------------------------
// A long-lived Python process keeps ONE warm YoutubeDL instance, so resolves
// after the first avoid process/startup cost and reuse the cached player JS
// (~0.5-1s instead of ~2-5s). Falls back to the one-shot CLI if it can't start.
const RESOLVER_SCRIPT = process.env.YTDLP_RESOLVER || path.resolve(process.cwd(), 'ytdlp_resolver.py')
const PY_CANDIDATES = [process.env.PYTHON_PATH || 'python', 'python3']

// A POOL of warm resolver processes (each is single-threaded). Resolves run in
// parallel across workers, so the search-page prefetch flood can't serialize
// behind the user's actual play (which previously caused ~8-9s waits).
const POOL_SIZE = Number(process.env.YTDLP_POOL || 3)
type ResolverWorker = { proc: ChildProcessWithoutNullStreams; buf: string; ready: boolean; cmd: string }

class ResolverPool {
  private workers: ResolverWorker[] = []
  private pending = new Map<string, { resolve: (u: string | null) => void; timer: NodeJS.Timeout }>()
  private rr = 0
  private disabled = false
  private starting: Promise<boolean> | null = null

  private makeWorker(cmd: string): ResolverWorker {
    const w: ResolverWorker = { proc: spawn(cmd, [RESOLVER_SCRIPT], { stdio: ['pipe', 'pipe', 'pipe'] }), buf: '', ready: false, cmd }
    w.proc.stdout.setEncoding('utf8')
    w.proc.stdout.on('data', (chunk: string) => {
      w.buf += chunk
      let nl: number
      while ((nl = w.buf.indexOf('\n')) >= 0) {
        const line = w.buf.slice(0, nl).trim()
        w.buf = w.buf.slice(nl + 1)
        if (!line) continue
        let msg: any
        try { msg = JSON.parse(line) } catch { continue }
        if (msg.ready) { w.ready = true; continue }
        if (msg.id) {
          const p = this.pending.get(msg.id)
          if (p) { clearTimeout(p.timer); this.pending.delete(msg.id); p.resolve(msg.url || null) }
        }
      }
    })
    w.proc.on('error', () => { w.ready = false })
    // Self-heal: respawn a crashed worker after a short delay.
    w.proc.on('exit', () => {
      w.ready = false
      if (!this.disabled) setTimeout(() => {
        const i = this.workers.indexOf(w)
        const nw = this.makeWorker(w.cmd)
        if (i >= 0) this.workers[i] = nw; else this.workers.push(nw)
      }, 1500)
    })
    return w
  }

  private async start(): Promise<boolean> {
    if (this.workers.some(w => w.ready)) return true
    if (this.disabled) return false
    if (this.starting) return this.starting
    this.starting = (async () => {
      for (const cmd of PY_CANDIDATES) {
        const probe = this.makeWorker(cmd)
        const ok = await new Promise<boolean>((res) => {
          const t = setTimeout(() => res(probe.ready), 9000)
          const iv = setInterval(() => { if (probe.ready) { clearInterval(iv); clearTimeout(t); res(true) } }, 100)
        })
        if (ok) {
          this.workers.push(probe)
          for (let k = 1; k < POOL_SIZE; k++) this.workers.push(this.makeWorker(cmd))
          return true
        }
        try { probe.proc.kill() } catch { /* noop */ }
      }
      this.disabled = true
      return false
    })().finally(() => { this.starting = null })
    return this.starting
  }

  async resolve(videoId: string): Promise<string | null> {
    if (!(await this.start())) return null
    const ready = this.workers.filter(w => w.ready)
    if (!ready.length) return null
    const w = ready[this.rr++ % ready.length] // round-robin across workers
    return new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => { this.pending.delete(videoId); resolve(null) }, 20000)
      this.pending.set(videoId, { resolve, timer })
      try { w.proc.stdin.write(videoId + '\n') }
      catch { clearTimeout(timer); this.pending.delete(videoId); resolve(null) }
    })
  }
}
const persistentResolver = new ResolverPool()

const inFlight = new Map<string, Promise<string | null>>()

async function resolveStreamUrl(videoId: string): Promise<string | null> {
  const cached = streamUrlCache.get(videoId)
  if (cached && Date.now() - cached.at < YT_URL_TTL) return cached.url
  // De-dupe concurrent resolves (e.g. a prefetch racing the actual play).
  const existing = inFlight.get(videoId)
  if (existing) return existing
  const p = doResolve(videoId).finally(() => inFlight.delete(videoId))
  inFlight.set(videoId, p)
  return p
}

async function doResolve(videoId: string): Promise<string | null> {
  // Fast path: warm persistent resolver.
  let url = await persistentResolver.resolve(videoId)
  // Fallback: one-shot CLI (covers a dead/failed persistent process).
  if (!url) {
    try {
      const out = await runYtdlp([
        '-f', 'bestaudio[ext=m4a]/bestaudio/best',
        '--extractor-args', 'youtube:player_client=android',
        '--no-playlist', '--no-warnings', '-g',
        `https://www.youtube.com/watch?v=${videoId}`
      ])
      url = out.split('\n').map(s => s.trim()).filter(Boolean)[0] || ''
    } catch { /* give up below */ }
  }
  if (url) streamUrlCache.set(videoId, { url, at: Date.now() })
  return url || null
}

// ---- Innertube singleton -------------------------------------------------
let innertube: Innertube | null = null
// Thin passthrough to the platform fetch. (Kept as a single seam so the YouTube/
// stream/image calls can be adjusted in one place once we know the real HF cause.)
const insecureFetch = (input: any, init?: any): Promise<Response> => fetch(input, init)

let innertubePromise: Promise<Innertube> | null = null

async function getInnertube(): Promise<Innertube> {
  if (innertube) return innertube
  if (!innertubePromise) {
    installEvaluator()
    innertubePromise = Innertube.create({
      cache: new UniversalCache(false),
      generate_session_locally: true,
      fetch: insecureFetch as any
    }).then((it) => {
      innertube = it
      return it
    })
  }
  return innertubePromise
}

// ---- Mappers (YouTube -> canonical song shape) ---------------------------
const thumbUrl = (item: any): string => {
  const thumbs = item?.thumbnail?.contents || item?.thumbnails || item?.thumbnail || []
  const arr = Array.isArray(thumbs) ? thumbs : []
  if (!arr.length) return ''
  // largest last
  const best = arr[arr.length - 1]
  return best?.url || ''
}

// YouTube serves cover art from googleusercontent/ggpht/ytimg. Browsers and
// ad/tracking blockers routinely block these hosts, so the art silently fails
// to load (falls back to the app logo). Route it through our own /image proxy
// so it's served same-origin from this backend and can't be blocked.
const PROXY_IMG_HOSTS = /(^|\.)(googleusercontent\.com|ggpht\.com|ytimg\.com)$/i
const proxyImage = (u: string): string => {
  if (!u || !/^https:\/\//i.test(u)) return u
  try {
    if (!PROXY_IMG_HOSTS.test(new URL(u).hostname)) return u
  } catch { return u }
  return `${SELF_ORIGIN}/api/youtube/image?u=${encodeURIComponent(u)}`
}

const imageArray = (url: string) => {
  if (!url) return []
  // Upgrade common YT thumb sizes to a larger square when possible.
  const big = url.replace(/w\d+-h\d+/, 'w544-h544').replace(/=w\d+-h\d+/, '=w544-h544')
  return [
    { quality: '150x150', url: proxyImage(url) },
    { quality: '500x500', url: proxyImage(big) }
  ]
}

const artistsOf = (item: any) => {
  const list: any[] = item?.artists || item?.author?.contents || []
  const primary = (Array.isArray(list) ? list : [])
    .filter((a: any) => a?.name && a.name !== '•')
    .map((a: any) => ({
      id: String(a?.channel_id || a?.id || ''),
      name: String(a?.name || ''),
      role: 'primary',
      type: 'artist',
      image: [],
      url: ''
    }))
  if (!primary.length && item?.author?.name) {
    primary.push({ id: String(item.author.id || ''), name: String(item.author.name), role: 'primary', type: 'artist', image: [], url: '' })
  }
  return primary
}

const durationSeconds = (item: any): number => {
  const d = item?.duration
  if (typeof d === 'number') return d
  if (d?.seconds) return Number(d.seconds)
  if (item?.duration_seconds) return Number(item.duration_seconds)
  return 0
}

const toSongPayload = (item: any) => {
  const id = String(item?.id || item?.video_id || '')
  const name = String(item?.title?.text || item?.title || item?.name || '')
  const artists = artistsOf(item)
  const img = thumbUrl(item)
  const albumName = item?.album?.name || item?.album?.text || null
  return {
    id,
    name,
    type: 'song',
    source: 'youtube',
    year: null,
    releaseDate: null,
    duration: durationSeconds(item),
    label: null,
    explicitContent: !!item?.badges?.length,
    playCount: null,
    language: '',
    hasLyrics: false,
    lyricsId: null,
    url: id ? `https://music.youtube.com/watch?v=${id}` : '',
    copyright: null,
    album: { id: String(item?.album?.id || ''), name: albumName, url: null },
    artists: { primary: artists, featured: [], all: artists },
    image: imageArray(img),
    // Points back at our own proxy; resolved fresh on each play.
    downloadUrl: id ? [{ quality: 'auto', url: `/api/youtube/stream?id=${id}` }] : []
  }
}

// ---- GET /api/youtube/search/songs ---------------------------------------
youtube.get('/search/songs', async (c) => {
  const query = c.req.query('query') || c.req.query('q') || ''
  const limit = Number(c.req.query('limit') || 30)
  if (!query.trim()) {
    return c.json({ success: false, message: 'query is required' }, 400)
  }
  try {
    const it = await getInnertube()
    const res: any = await it.music.search(query, { type: 'song' })
    // youtubei.js groups results; songs live in .songs?.contents or .contents
    const items: any[] =
      res?.songs?.contents ||
      (Array.isArray(res?.contents)
        ? res.contents.flatMap((sec: any) => sec?.contents || [])
        : []) ||
      []
    const results = items
      .filter((x: any) => x && (x.id || x.video_id) && (x.title?.text || x.title))
      .slice(0, limit)
      .map(toSongPayload)
      .filter((s: any) => s.id && s.name)

    return c.json({ success: true, data: { total: results.length, start: 0, results } })
  } catch (err: any) {
    console.error('[youtube] search failed:', err?.message || err)
    return c.json({ success: false, message: 'youtube search failed', error: String(err?.message || err) }, 502)
  }
})

// ---- helpers: extract song lists & card mappers --------------------------
const extractSongItems = (res: any): any[] => {
  if (!res) return []
  if (Array.isArray(res?.songs?.contents)) return res.songs.contents
  if (Array.isArray(res?.contents)) return res.contents.flatMap((sec: any) => sec?.contents || sec?.items || [])
  if (Array.isArray(res?.items)) return res.items
  return []
}

const albumCard = (item: any) => ({
  id: String(item?.id || item?.album_id || ''),
  name: String(item?.title?.text || item?.title || item?.name || ''),
  type: 'album',
  source: 'youtube',
  image: imageArray(thumbUrl(item)),
  artists: { primary: artistsOf(item) },
  url: ''
})

const artistCard = (item: any) => ({
  id: String(item?.id || item?.channel_id || ''),
  name: String(item?.name || item?.title?.text || item?.title || ''),
  type: 'artist',
  source: 'youtube',
  image: imageArray(thumbUrl(item)),
  url: ''
})

const playlistCard = (item: any) => ({
  id: String(item?.id || item?.playlist_id || ''),
  name: String(item?.title?.text || item?.title || item?.name || ''),
  type: 'playlist',
  source: 'youtube',
  image: imageArray(thumbUrl(item)),
  songCount: item?.song_count || item?.item_count || null,
  url: ''
})

// ---- GET /api/youtube/songs/:id  (details) -------------------------------
youtube.get('/songs/:id', async (c) => {
  const id = c.req.param('id')
  try {
    const it = await getInnertube()
    const info: any = await it.music.getInfo(id)
    const bi = info?.basic_info || {}
    const payload = toSongPayload({
      id: bi.id || id,
      title: bi.title,
      duration: bi.duration,
      thumbnail: bi.thumbnail,
      author: { name: bi.author, id: bi.channel_id }
    })
    return c.json({ success: true, data: [payload] })
  } catch (err: any) {
    console.error('[youtube] getInfo failed:', err?.message || err)
    return c.json({ success: false, message: 'youtube song details failed' }, 502)
  }
})

// ---- GET /api/youtube/songs/:id/suggestions  (autoplay/radio) ------------
youtube.get('/songs/:id/suggestions', async (c) => {
  const id = c.req.param('id')
  const limit = Number(c.req.query('limit') || 20)
  try {
    const it = await getInnertube()
    let items: any[] = []
    try {
      const up: any = await it.music.getUpNext(id)
      items = up?.contents || up?.items || []
    } catch { /* fall through */ }
    if (!items.length) {
      try {
        const rel: any = await it.music.getRelated(id)
        items = extractSongItems(rel)
      } catch { /* ignore */ }
    }
    const results = items
      .filter((x: any) => x && (x.id || x.video_id) && (x.title?.text || x.title) && String(x.id || x.video_id) !== id)
      .slice(0, limit)
      .map(toSongPayload)
      .filter((s: any) => s.id && s.name)
    return c.json({ success: true, data: results })
  } catch (err: any) {
    console.error('[youtube] suggestions failed:', err?.message || err)
    return c.json({ success: false, message: 'youtube suggestions failed', data: [] }, 502)
  }
})

// ---- GET /api/youtube/search/{albums,artists,playlists} ------------------
const searchTypeHandler = (type: 'album' | 'artist' | 'playlist', mapper: (x: any) => any) =>
  async (c: any) => {
    const query = c.req.query('query') || c.req.query('q') || ''
    const limit = Number(c.req.query('limit') || 20)
    if (!query.trim()) return c.json({ success: false, message: 'query is required' }, 400)
    try {
      const it = await getInnertube()
      const res: any = await it.music.search(query, { type })
      const items = extractSongItems(res).concat(res?.[`${type}s`]?.contents || [])
      const results = items
        .filter((x: any) => x && (x.id || x.channel_id || x.playlist_id || x.album_id))
        .slice(0, limit)
        .map(mapper)
        .filter((x: any) => x.id && x.name)
      return c.json({ success: true, data: { total: results.length, start: 0, results } })
    } catch (err: any) {
      console.error(`[youtube] search ${type} failed:`, err?.message || err)
      return c.json({ success: false, message: `youtube search ${type} failed`, data: { results: [] } }, 502)
    }
  }
youtube.get('/search/albums', searchTypeHandler('album', albumCard))
youtube.get('/search/artists', searchTypeHandler('artist', artistCard))
youtube.get('/search/playlists', searchTypeHandler('playlist', playlistCard))

// ---- GET /api/youtube/modules  (home browse) -----------------------------
// Built from a few reliable YT Music searches (mirrors how the JioSaavn home
// is assembled) — robust vs. traversing the deeply-nested home feed.
youtube.get('/modules', async (c) => {
  try {
    const it = await getInnertube()
    const grab = async (q: string, n: number) => {
      try {
        const r: any = await it.music.search(q, { type: 'song' })
        return extractSongItems(r)
          .filter((x: any) => x && (x.id || x.video_id) && (x.title?.text || x.title))
          .slice(0, n).map(toSongPayload).filter((s: any) => s.id && s.name)
      } catch { return [] }
    }
    const grabAlbums = async (q: string, n: number) => {
      try {
        const r: any = await it.music.search(q, { type: 'album' })
        return (r?.albums?.contents || extractSongItems(r))
          .filter((x: any) => x && (x.id || x.album_id))
          .slice(0, n).map(albumCard).filter((a: any) => a.id && a.name)
      } catch { return [] }
    }
    const [trending, albums] = await Promise.all([
      grab('trending songs', 20),
      grabAlbums('new album releases', 12)
    ])
    return c.json({
      success: true,
      data: {
        trending: { songs: trending, albums: [] },
        albums,
        charts: [],
        playlists: []
      }
    })
  } catch (err: any) {
    console.error('[youtube] modules failed:', err?.message || err)
    return c.json({ success: false, message: 'youtube modules failed' }, 502)
  }
})

// ---- GET /api/youtube/artists/:id ----------------------------------------
youtube.get('/artists/:id', async (c) => {
  const id = c.req.param('id')
  try {
    const it = await getInnertube()
    const a: any = await it.music.getArtist(id)
    // Artist data is a list of shelves keyed by header title.
    const sections: any[] = Array.isArray(a?.sections) ? a.sections : []
    const sectionByTitle = (re: RegExp) =>
      sections.find((s: any) => re.test(String(s?.header?.title?.text || s?.title?.text || '')))?.contents || []

    const topSongs = sectionByTitle(/top songs/i)
      .filter((x: any) => x && (x.id || x.video_id))
      .map(toSongPayload).filter((s: any) => s.id && s.name)
    const topAlbums = sectionByTitle(/^albums/i)
      .filter((x: any) => x && (x.id || x.album_id))
      .map(albumCard).filter((x: any) => x.id && x.name)
    const singles = sectionByTitle(/singles/i)
      .filter((x: any) => x && (x.id || x.album_id))
      .map(albumCard).filter((x: any) => x.id && x.name)
    const similarArtists = sectionByTitle(/might also like|similar/i)
      .filter((x: any) => x && (x.id || x.channel_id))
      .map(artistCard).filter((x: any) => x.id && x.name)

    return c.json({
      success: true,
      data: {
        id,
        name: String(a?.header?.title?.text || a?.name || ''),
        type: 'artist',
        source: 'youtube',
        image: imageArray(thumbUrl(a?.header || a)),
        followerCount: null,
        isVerified: false,
        topSongs,
        topAlbums,
        singles,
        similarArtists
      }
    })
  } catch (err: any) {
    console.error('[youtube] getArtist failed:', err?.message || err)
    return c.json({ success: false, message: 'youtube artist failed' }, 502)
  }
})

// ---- GET /api/youtube/albums?id= -----------------------------------------
youtube.get('/albums', async (c) => {
  const id = c.req.query('id') || ''
  if (!id) return c.json({ success: false, message: 'id is required' }, 400)
  try {
    const it = await getInnertube()
    const al: any = await it.music.getAlbum(id)
    const songs = (al?.contents || al?.items || [])
      .filter((x: any) => x && (x.id || x.video_id))
      .map(toSongPayload).filter((s: any) => s.id && s.name)
    return c.json({
      success: true,
      data: {
        id,
        name: String(al?.header?.title?.text || al?.title || ''),
        type: 'album',
        source: 'youtube',
        image: imageArray(thumbUrl(al?.header || al)),
        songCount: songs.length,
        songs
      }
    })
  } catch (err: any) {
    console.error('[youtube] getAlbum failed:', err?.message || err)
    return c.json({ success: false, message: 'youtube album failed' }, 502)
  }
})

// ---- GET /api/youtube/playlists?id= --------------------------------------
youtube.get('/playlists', async (c) => {
  const id = c.req.query('id') || ''
  if (!id) return c.json({ success: false, message: 'id is required' }, 400)
  try {
    const it = await getInnertube()
    const pl: any = await it.music.getPlaylist(id)
    const songs = (pl?.items || pl?.contents || [])
      .filter((x: any) => x && (x.id || x.video_id))
      .map(toSongPayload).filter((s: any) => s.id && s.name)
    return c.json({
      success: true,
      data: {
        id,
        name: String(pl?.header?.title?.text || pl?.title || ''),
        type: 'playlist',
        source: 'youtube',
        image: imageArray(thumbUrl(pl?.header || pl)),
        songCount: songs.length,
        songs,
        artists: []
      }
    })
  } catch (err: any) {
    console.error('[youtube] getPlaylist failed:', err?.message || err)
    return c.json({ success: false, message: 'youtube playlist failed' }, 502)
  }
})

// ---- GET /api/youtube/stream?id=<videoId> --------------------------------
// Resolves the best audio format fresh and proxies the bytes (range-aware).
youtube.get('/stream', async (c) => {
  const id = c.req.query('id') || ''
  // Strict YouTube video-id charset — blocks newline/control chars that could
  // confuse the resolver's line protocol or alter the resolved URL.
  if (!/^[A-Za-z0-9_-]{1,24}$/.test(id)) return c.json({ success: false, message: 'invalid id' }, 400)

  try {
    let mediaUrl = await resolveStreamUrl(id)
    if (!mediaUrl) return c.json({ success: false, message: 'could not resolve stream' }, 502)

    const clientRange = c.req.header('range')
    let upstream = await insecureFetch(mediaUrl, { headers: clientRange ? { range: clientRange } : {} })

    // A cached URL can expire (403/410) — re-resolve once, bypassing the cache.
    if (upstream.status === 403 || upstream.status === 410) {
      streamUrlCache.delete(id)
      mediaUrl = await resolveStreamUrl(id)
      if (mediaUrl) upstream = await insecureFetch(mediaUrl, { headers: clientRange ? { range: clientRange } : {} })
    }

    if (!upstream.ok && upstream.status !== 206) {
      return c.json({ success: false, message: `upstream ${upstream.status}` }, 502)
    }

    // The android/ios URL is unthrottled and seekable, so we pass ranges straight
    // through (echoing the upstream status + range headers).
    const headers = new Headers()
    for (const h of ['content-length', 'content-range', 'accept-ranges']) {
      const v = upstream.headers.get(h)
      if (v) headers.set(h, v)
    }
    // We request audio-only, but YouTube labels m4a as "video/mp4" — coerce to an
    // audio/* type so the browser's <audio> element accepts it.
    const upType = upstream.headers.get('content-type') || ''
    headers.set('content-type', upType.includes('webm') ? 'audio/webm' : 'audio/mp4')
    if (!headers.has('accept-ranges')) headers.set('accept-ranges', 'bytes')
    headers.set('cache-control', 'no-store')

    return new Response(upstream.body, { status: upstream.status, headers })
  } catch (err: any) {
    console.error('[youtube] stream failed:', err?.message || err)
    return c.json({ success: false, message: 'youtube stream failed', error: String(err?.message || err) }, 502)
  }
})

// ---- GET /api/youtube/resolve?id=  (prefetch/warm the stream URL) --------
// Lets the client pre-resolve a song's stream URL (into cache) BEFORE it plays,
// so the actual /stream request is instant instead of waiting ~2s for yt-dlp.
youtube.get('/resolve', async (c) => {
  const id = c.req.query('id') || ''
  if (!/^[A-Za-z0-9_-]{1,24}$/.test(id)) return c.json({ success: false, message: 'invalid id' }, 400)
  try {
    const url = await resolveStreamUrl(id)
    return c.json({ success: !!url, ready: !!url })
  } catch {
    return c.json({ success: false, ready: false }, 502)
  }
})

// ---- GET /api/youtube/image?u=<encoded YT thumbnail url> -----------------
// Fetches a YouTube cover image server-side (always reachable) and re-serves it
// same-origin, so browser/ad-blocker host blocks can't break cover art. SSRF
// guard: only known YouTube image hosts over HTTPS are ever fetched.
youtube.get('/image', async (c) => {
  const u = c.req.query('u') || ''
  let target: URL
  try { target = new URL(u) } catch { return c.json({ success: false, message: 'bad url' }, 400) }
  if (target.protocol !== 'https:' || !PROXY_IMG_HOSTS.test(target.hostname)) {
    return c.json({ success: false, message: 'forbidden host' }, 403)
  }
  try {
    const upstream = await insecureFetch(target.toString(), {
      headers: { 'user-agent': 'Mozilla/5.0', accept: 'image/*,*/*' }
    })
    if (!upstream.ok || !upstream.body) {
      return c.json({ success: false, message: `upstream ${upstream.status}` }, 502)
    }
    const ct = upstream.headers.get('content-type') || ''
    const headers = new Headers()
    headers.set('content-type', ct.startsWith('image/') ? ct : 'image/jpeg')
    headers.set('cache-control', 'public, max-age=604800, immutable')
    headers.set('access-control-allow-origin', '*')
    return new Response(upstream.body, { status: 200, headers })
  } catch (err: any) {
    return c.json({ success: false, message: 'image fetch failed', error: String(err?.message || err) }, 502)
  }
})

// ---- GET /api/youtube/netcheck — diagnose HF↔YouTube connectivity --------
// Tells us whether IPv4 to YouTube actually works (→ fixable in code) or is
// reset/blocked (→ a proxy is genuinely required). No secrets, safe to expose.
youtube.get('/netcheck', async (c) => {
  const out: Record<string, any> = {}
  const host = 'www.youtube.com'
  try { out.ipv4 = (await dnsp.resolve4(host)).slice(0, 2) } catch (e: any) { out.ipv4 = 'err:' + e?.code }
  try { out.ipv6 = (await dnsp.resolve6(host)).slice(0, 2) } catch (e: any) { out.ipv6 = 'err:' + e?.code }

  // Raw TCP connect to the first IPv4 on :443 (pure network reachability).
  out.tcp4 = await new Promise((resolve) => {
    const ip = Array.isArray(out.ipv4) ? out.ipv4[0] : null
    if (!ip) return resolve('no-ipv4')
    const s = net.connect({ host: ip, port: 443, family: 4 })
    const t = setTimeout(() => { s.destroy(); resolve('timeout') }, 8000)
    s.on('connect', () => { clearTimeout(t); s.destroy(); resolve('connected') })
    s.on('error', (e: any) => { clearTimeout(t); resolve('err:' + (e?.code || e?.message)) })
  })

  // HTTPS fetch over a FORCED-IPv4 undici dispatcher (the candidate real fix).
  try {
    const { fetch: uf, Agent } = await import('undici')
    const r: any = await uf('https://www.youtube.com/', {
      dispatcher: new Agent({ connect: { family: 4, rejectUnauthorized: false, timeout: 8000 } })
    } as any)
    out.fetch4 = 'ok ' + r.status
  } catch (e: any) { out.fetch4 = 'err:' + (e?.cause?.code || e?.cause?.message || e?.message) }

  return c.json(out)
})

// ---- GET /api/youtube/health ---------------------------------------------
youtube.get('/health', async (c) => {
  try {
    await getInnertube()
    return c.json({ success: true, ready: true })
  } catch (err: any) {
    // Surface the underlying cause so we can tell a TLS/cert failure apart from a
    // connection reset (datacenter-IP block) vs DNS, etc.
    const cause = err?.cause
    return c.json({
      success: false,
      ready: false,
      error: String(err?.message || err),
      causeCode: String(cause?.code || ''),
      causeMessage: String(cause?.message || cause || ''),
      causeOfCause: String(cause?.cause?.code || cause?.cause?.message || '')
    }, 502)
  }
})

export { youtube }
