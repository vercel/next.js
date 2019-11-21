const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const pathMatch = require('path-match')

const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()
const route = pathMatch()
const match = route('/about/:name')

app.prepare().then(() => {
  createServer((req, res) => {
    const { pathname } = parse(req.url)
    const params = match(pathname)
    if (params === false) {
      handle(req, res)
      return
    }

    app.render(req, res, '/about', params)
  }).listen(port, err => {
    if (err) throw err
    console.log(`> Ready on http://localhost:${port}`)
  })
})
