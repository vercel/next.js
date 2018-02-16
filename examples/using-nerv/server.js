const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'
const moduleAlias = require('module-alias')

// For the development version, we'll use React.
// Because, it support react hot loading and so on.
if (!dev) {
  moduleAlias.addAlias('react', 'nervjs')
  moduleAlias.addAlias('react-dom', 'nervjs')
}

const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')

const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare()
.then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true)
    handle(req, res, parsedUrl)
  })
  .listen(port, (err) => {
    if (err) throw err
    console.log(`> Ready on http://localhost:${port}`)
  })
})
