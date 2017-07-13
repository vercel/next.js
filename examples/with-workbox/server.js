const express = require('express')
const next = require('next')
const path = require('path')
const { createServer } = require('http')
const { parse } = require('url')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()



const serve = (subpath, cache) => express.static(
  path.resolve(__dirname, subpath),
  {maxAge: cache && !dev ? 1000 * 60 * 60 * 24 * 30 : 0}
)

app.prepare()
.then(() => {

  createServer((req, res) => {
    const parsedUrl = parse(req.url, true)
    handle(req, res, parsedUrl)
  })

  const server = express()

    server.use('/static', serve('./static', true))
    server.use('/service-worker.js', serve('./.next/service-worker.js', true))
    server.use('/manifest.json', serve('./static/manifest.json', true))

  server.get('*', (req, res) => {
    return handle(req, res)
  })

  server.listen(3000, (err) => {
    if (err) throw err
    console.log('> Ready on http://localhost:3000')
  })
})
