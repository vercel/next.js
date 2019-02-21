const cacheableResponse = require('cacheable-response')
const express = require('express')
const next = require('next')

const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })

const handle = app.getRequestHandler()

const ssrCache = cacheableResponse({
  get: async ({ req, res, pagePath, queryParams }) => {
    const html = await app.renderToHTML(req, res, pagePath, queryParams)
    return {
      data: html,
      ttl: 1000 * 60 * 60 // 1hour
    }
  },
  send: ({ data, res }) => res.send(data)
})

app.prepare().then(() => {
  const server = express()

  server.get('/', (req, res) => ssrCache({ req, res, pagePath: '/' }))

  server.get('/blog/:id', (req, res) => {
    const queryParams = { id: req.params.id }
    const pagePath = '/blog'
    return ssrCache({ req, res, pagePath, queryParams })
  })

  server.get('*', (req, res) => handle(req, res))

  server.listen(port, err => {
    if (err) throw err
    console.log(`> Ready on http://localhost:${port}`)
  })
})
