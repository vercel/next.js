const express = require('express')
const next = require('next')
const LRUCache = require('lru-cache')

const app = next({ dir: '.', dev: true })
const handle = app.getRequestHandler()

// This is where we cache our rendered HTML pages
const ssrCache = new LRUCache({
  max: 100,
  maxAge: 1000 * 60 * 60 // 1hour
})

app.prepare()
.then(() => {
  const server = express()

  // Use the `renderAndCache` utility defined below to serve pages
  server.get('/', (req, res) => {
    renderAndCache(req, res, '/')
  })

  server.get('/blog/:id', (req, res) => {
    const queryParams = { id: req.paradms.id }
    renderAndCache(req, res, '/blog', queryParams)
  })

  server.get('*', (req, res) => {
    return handle(req, res)
  })

  server.listen(3000, (err) => {
    if (err) throw err
    console.log('> Ready on http://localhost:3000')
  })
})

function renderAndCache (req, res, pagePath, queryParams) {
  // If we have a page in the cache, let's serve it
  if (ssrCache.has(req.url)) {
    console.log(`CACHE HIT: ${req.url}`)
    res.send(ssrCache.get(req.url))
    return
  }

  // If not let's render the page into HTML
  app.renderToHTML(req, res, pagePath, queryParams)
    .then((html) => {
      // Let's cache this page
      console.log(`CACHE MISS: ${req.url}`)
      ssrCache.set(req.url, html)

      res.send(html)
    })
    .catch((err) => {
      app.renderError(err, req, res, pagePath, queryParams)
    })
}
