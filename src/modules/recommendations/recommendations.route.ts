import { Hono } from 'hono'

// Last.fm-powered similar-track recommendations (collaborative-filtering data),
// used to build a Spotify-like radio. The API key stays server-side. Playback
// still happens via JioSaavn — the client resolves these {name, artist} pairs
// against our own catalog.
//
// Set LASTFM_API_KEY in the server environment (free key from
// https://www.last.fm/api/account/create). Without it, this returns
// { success: false, reason: 'not_configured' } and the client falls back to its
// heuristic queue.

const recommendations = new Hono()

const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/'

const lastfmGet = async (params: Record<string, string>): Promise<any | null> => {
    const key = process.env.LASTFM_API_KEY
    if (!key) return null
    const url = new URL(LASTFM_BASE)
    url.searchParams.set('api_key', key)
    url.searchParams.set('format', 'json')
    url.searchParams.set('autocorrect', '1')
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    try {
        const res = await fetch(url.toString(), { headers: { 'User-Agent': 'NitroMusic/1.0' } })
        if (!res.ok) return null
        return await res.json()
    } catch {
        return null
    }
}

recommendations.get('/similar', async (c) => {
    const track = c.req.query('track') || ''
    const artist = c.req.query('artist') || ''
    const limit = Math.min(Number(c.req.query('limit') || 30), 50)

    if (!process.env.LASTFM_API_KEY) {
        return c.json({ success: false, reason: 'not_configured', data: { tracks: [], artists: [] } })
    }
    if (!track && !artist) {
        return c.json({ success: false, reason: 'missing_params', data: { tracks: [], artists: [] } }, 400)
    }

    const tracks: Array<{ name: string; artist: string }> = []
    const artists: string[] = []

    // 1) Similar tracks (best signal)
    if (track && artist) {
        const data = await lastfmGet({ method: 'track.getsimilar', track, artist, limit: String(limit) })
        const list = data?.similartracks?.track
        if (Array.isArray(list)) {
            for (const t of list) {
                if (t?.name) tracks.push({ name: t.name, artist: t.artist?.name || '' })
            }
        }
    }

    // 2) Similar artists (fallback / supplement so the radio always has variety)
    if (artist) {
        const data = await lastfmGet({ method: 'artist.getsimilar', artist, limit: '12' })
        const list = data?.similarartists?.artist
        if (Array.isArray(list)) {
            for (const a of list) {
                if (a?.name) artists.push(a.name)
            }
        }
    }

    return c.json({ success: true, data: { tracks, artists } })
})

export { recommendations }
