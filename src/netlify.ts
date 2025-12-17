import { Hono } from 'hono'
import { handle } from 'hono/netlify'
import app from './server'

const proxy = new Hono()

// Netlify Functions often route to /.netlify/functions/api
// We mount the app there to ensure paths match
proxy.route('/.netlify/functions/api', app)
proxy.route('/', app)

export const handler = handle(proxy)
