import { serve } from '@hono/node-server'
import { createServer, IncomingMessage, ServerResponse } from 'http'
import app from './server'
import { initializeSocketIO } from './socket-rooms'

const port = 3000

console.log(`
  🚀 Server is running locally!
  📡 API Base: http://localhost:${port}/api
  📖 Docs:     http://localhost:${port}/docs
  🎧 Socket.io: ws://localhost:${port}
`)

// Create HTTP server for both Hono and Socket.io
const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  try {
    // Build request body for POST/PUT/PATCH
    let body = '';
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      for await (const chunk of req) {
        body += chunk;
      }
    }

    // Create Fetch API Request from Node.js request
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers[key] = value;
      } else if (Array.isArray(value)) {
        headers[key] = value.join(', ');
      }
    }

    const request = new Request(`http://localhost:${port}${req.url || '/'}`, {
      method: req.method || 'GET',
      headers,
      body: body || undefined
    });

    // Let Hono handle HTTP requests
    const response = await app.fetch(request);

    // Convert Fetch API Response to Node.js response
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    res.writeHead(response.status, responseHeaders);
    const responseBody = await response.text();
    res.end(responseBody);
  } catch (err: unknown) {
    console.error('Request error:', err);
    res.writeHead(500);
    res.end('Internal Server Error');
  }
})

// Initialize Socket.io for Listen Together rooms
initializeSocketIO(httpServer)

// Start server
httpServer.listen(port, () => {
  console.log(`[Server] Running on port ${port}`)
})
