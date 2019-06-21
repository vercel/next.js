import express from 'express'
import i18nextMiddleware from 'i18next-express-middleware'
import next from 'next'

import i18n from '../i18n/client'

const port = parseInt(process.env.PORT || '3000', 10)
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = express()

  // Register i18n middleware
  server.use(
    i18nextMiddleware.handle(i18n, {
      removeLngFromUrl: false,
    })
  )

  server.get('*', (req, res) => handle(req, res))

  server.listen(port, err => {
    if (err) throw err
    console.log(`> Ready on http://localhost:${port}`)
  })
})
