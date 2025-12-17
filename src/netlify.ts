import { Hono } from 'hono'
import { handle } from 'hono/netlify'
import app from './server'

const netlifyApp = new Hono()

// Mount the application
netlifyApp.route('/', app)

export const handler = handle(netlifyApp)
