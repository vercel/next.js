const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

module.exports = createServer((req, res) => {
  const parsedUrl = parse(req.url, true)
  const { pathname, query } = parsedUrl

  if (pathname === '/a') {
    app.render(req, res, '/a', query)
  } else if (pathname === '/b') {
    app.render(req, res, '/b', query)
  } else {
    handle(req, res, parsedUrl)
  }
})
