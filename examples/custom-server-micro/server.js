const micro = require('micro')
const match = require('micro-route/match')
const { parse } = require('url')
const next = require('next')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

const server = micro(async (req, res) => {
  const parsedUrl = parse(req.url, true)
  const { query } = parsedUrl

  if (match(req, '/a')) {
    return app.render(req, res, '/b', query)
  } else if (match(req, '/b')) {
    return app.render(req, res, '/a', query)
  }

  return handle(req, res, parsedUrl)
})

app.prepare().then(() => {
  server.listen(3000, err => {
    if (err) throw err
    console.log('> Ready on http://localhost:3000')
  })
})
