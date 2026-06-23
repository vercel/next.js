/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    beforeDevRequest: async (req, res) => {
      if (req.url === '/intercepted') {
        res.statusCode = 418
        res.setHeader('content-type', 'text/plain')
        res.setHeader('x-before-dev-request', 'hit')
        // Prove we received the real Node req: echo the url and a request header.
        res.setHeader('x-seen-url', req.url)
        res.setHeader('x-seen-custom', req.headers['x-custom'] ?? '')
        res.end('intercepted by beforeDevRequest')
        return // response sent -> Next.js short-circuits
      }

      if (req.url === '/intercepted-async') {
        // Exercise the Promise<void> return path: await before responding.
        await new Promise((resolve) => setTimeout(resolve, 10))
        res.statusCode = 418
        res.end('intercepted by beforeDevRequest (async)')
        return
      }

      // Otherwise fall through to normal Next.js handling.
    },
  },
}

module.exports = nextConfig
