// Hand-rolled SSR server for dev and prod. Maintaining this file is the main
// reason we are moving to Next.js.
import fs from 'node:fs'
import http from 'node:http'

const isProd = process.env.NODE_ENV === 'production'
const port = process.env.PORT || 5173

async function main() {
  let vite
  let template
  let render

  if (!isProd) {
    const { createServer } = await import('vite')
    vite = await createServer({
      server: { middlewareMode: true },
      appType: 'custom',
    })
  } else {
    template = fs.readFileSync('./dist/client/index.html', 'utf-8')
    render = (await import('./dist/server/entry-server.js')).render
  }

  http
    .createServer(async (req, res) => {
      try {
        if (!isProd) {
          // Let vite handle assets, HMR, and module requests.
          const handled = await new Promise((resolve) => {
            vite.middlewares(req, res, () => resolve(false))
            res.on('finish', () => resolve(true))
          })
          if (handled) return
          template = await vite.transformIndexHtml(
            req.url,
            fs.readFileSync('./index.html', 'utf-8')
          )
          render = (await vite.ssrLoadModule('/src/entry-server.tsx')).render
        }
        const html = template.replace('<!--ssr-outlet-->', render())
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(html)
      } catch (e) {
        vite?.ssrFixStacktrace(e)
        res.writeHead(500)
        res.end(String(e))
      }
    })
    .listen(port, () => {
      console.log(`recipe box listening on http://localhost:${port}`)
    })
}

main()
