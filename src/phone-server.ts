import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import dns from 'node:dns'
import { youtube } from './modules/youtube/youtube.route'

/**
 * Minimal YouTube-only backend for a HOME device (e.g. an old Android phone via
 * Termux). The phone's RESIDENTIAL IP is not blocked by YouTube, so youtubei.js
 * search + yt-dlp streaming work here even though datacenter hosts (HF/Vercel)
 * are blocked. No Prisma/DB and no JioSaavn — JioSaavn stays on Vercel; this box
 * serves ONLY /api/youtube/* and is reached via a Cloudflare tunnel.
 *
 * Run on the phone with:  npx tsx src/phone-server.ts
 */
dns.setDefaultResultOrder('ipv4first')

const app = new Hono()
app.use(cors())
app.get('/', (c) => c.json({ ok: true, service: 'nitro-yt-phone' }))
app.route('/api/youtube', youtube)

const port = Number(process.env.PORT) || 3000
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Nitro YouTube box (phone) listening on :${info.port}`)
})
