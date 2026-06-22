import { serve } from '@hono/node-server'
import app from './server'

/**
 * Node entrypoint for the HF Space.
 *
 * We run the API on Node (not Bun) because Bun's TLS on the Space image can't
 * verify Google Trust Services certs — which breaks youtubei.js search/metadata
 * and the googlevideo audio proxy ("unknown certificate verification error"),
 * while jiosaavn (a CA already in Bun's bundle) works. Node's TLS handles Google
 * fine, and youtubei.js is natively supported on Node.
 *
 * This is the API only — Listen-Together sockets run in the separate nitrosocket Space.
 */
const port = Number(process.env.PORT) || 3000

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Nitro API (node) listening on :${info.port}`)
})
