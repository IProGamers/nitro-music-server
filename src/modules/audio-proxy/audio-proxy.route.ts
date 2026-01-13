import { Hono } from 'hono'
import { stream } from 'hono/streaming'

const audioProxy = new Hono()

// Proxy route for downloading audio files to bypass CORS
// Usage: /api/audio-proxy?url=<encoded_audio_url>
audioProxy.get('/proxy', async (c) => {
    try {
        const audioUrl = c.req.query('url')

        if (!audioUrl) {
            return c.json({ success: false, error: 'Missing url parameter' }, 400)
        }

        // Decode the URL
        const decodedUrl = decodeURIComponent(audioUrl)

        // Validate URL is from allowed domains (JioSaavn CDN)
        const allowedDomains = [
            'aac.saavncdn.com',
            'sdlhc2.saavncdn.com',
            'snp.saavncdn.com',
            'c.saavncdn.com',
            'media.saavncdn.com'
        ]

        const urlObj = new URL(decodedUrl)
        const isAllowed = allowedDomains.some(domain => urlObj.hostname.endsWith(domain))

        if (!isAllowed) {
            return c.json({
                success: false,
                error: 'URL domain not allowed. Only JioSaavn CDN URLs are permitted.'
            }, 403)
        }

        // Fetch the audio from the original URL
        const response = await fetch(decodedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'audio/*,*/*',
                'Accept-Encoding': 'identity',
            }
        })

        if (!response.ok) {
            return c.json({
                success: false,
                error: `Failed to fetch audio: ${response.status} ${response.statusText}`
            }, 502) // Bad Gateway - upstream server returned an error
        }

        // Get content type and length
        const contentType = response.headers.get('Content-Type') || 'audio/mpeg'
        const contentLength = response.headers.get('Content-Length')

        // Set response headers for streaming audio
        c.header('Content-Type', contentType)
        if (contentLength) {
            c.header('Content-Length', contentLength)
        }
        c.header('Accept-Ranges', 'bytes')
        c.header('Cache-Control', 'public, max-age=31536000') // Cache for 1 year

        // Stream the response
        return stream(c, async (stream) => {
            const reader = response.body?.getReader()
            if (!reader) {
                throw new Error('No response body')
            }

            try {
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break
                    await stream.write(value)
                }
            } finally {
                reader.releaseLock()
            }
        })

    } catch (error) {
        console.error('[AudioProxy] Error:', error)
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to proxy audio'
        }, 500)
    }
})

// Health check for the proxy
audioProxy.get('/health', (c) => {
    return c.json({ success: true, message: 'Audio proxy is running' })
})

export { audioProxy }
