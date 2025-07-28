const next = require('next')
const express = require('express')
const { parse } = require('url')

const dev = process.env.NODE_ENV !== 'production'
const dir = __dirname
const port = process.env.PORT || 3000

const app = next({ dev, dir })
const handleNextRequests = app.getRequestHandler()

app.prepare().then(() => {
  const server = express()
  server.all('/{*splat}', (req, res) => {
    const parsedUrl = parse(req.url, true)
    handleNextRequests(req, res, parsedUrl)
  })

  server.listen(port, (err) => {
    if (err) {
      throw err
    }
    console.log(`> Ready on http://localhost:${port}`)
  })
})
