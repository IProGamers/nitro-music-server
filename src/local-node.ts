import { serve } from '@hono/node-server'
import app from './server'

const port = 3000

console.log(`
  🚀 Server is running locally!
  📡 API Base: http://localhost:${port}/api
  📖 Docs:     http://localhost:${port}/docs
`)

serve({
  fetch: app.fetch,
  port
})
