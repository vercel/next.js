const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const accepts = require('accepts')

const app = next('.', { dev: true })
const handle = app.getRequestHandler()

app.prepare()
.then(() => {
  createServer((req, res) => {
    const accept = accepts(req)
    const type = accept.type(['json', 'html'])
    if (type === 'json') {
      handle(req, res)
      return
    }

    const { pathname, query } = parse(req.url, true)

    if (pathname === '/a') {
      app.render(req, res, '/b', query)
    } else if (pathname === '/b') {
      app.render(req, res, '/a', query)
    } else {
      handle(req, res)
    }
  })
  .listen(3000, (err) => {
    if (err) throw err
    console.log('> Ready on http://localhost:3000')
  })
})
