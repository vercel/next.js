import express from 'express'
import next from 'next'
import { path, serveFragment } from 'react-esi/lib/server'

const dev = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT, 10) || (dev ? 3000 : 80)
const app = next({ dev, dir: dev ? 'src/' : 'dist/' })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = express()

  server.use((req, res, next) => {
    // Send the Surrogate-Control header to announce ESI support to proxies (optional with Varnish)
    res.set('Surrogate-Control', 'content="ESI/1.0"')
    next()
  })

  server.get(path, (req, res) =>
    serveFragment(
      req,
      res,
      fragmentID => require(`./components/${fragmentID}`).default
    )
  )
  server.get('*', handle)

  server.listen(port, err => {
    if (err) throw err
    console.log(`> Ready on http://localhost:${port}`)
  })
})
