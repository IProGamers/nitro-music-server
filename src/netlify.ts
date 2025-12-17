import serverless from 'serverless-http'
import { getRequestListener } from '@hono/node-server'
import app from './server'

// Convert Hono app to a Node.js request listener
const requestListener = getRequestListener(app.fetch)

// Wrap with serverless-http to handle Netlify/Lambda events
export const handler = serverless(requestListener)
