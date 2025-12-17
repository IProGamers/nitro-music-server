import { handle } from 'hono/netlify'
import app from './server'

export const handler = handle(app)
