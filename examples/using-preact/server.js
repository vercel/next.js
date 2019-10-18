const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'
const moduleAlias = require('module-alias')

moduleAlias.addAliases({
  react: 'preact/compat',
  'react-dom': 'preact/compat'
})

const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')

const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true)
    handle(req, res, parsedUrl)
  }).listen(port, err => {
    if (err) throw err
    console.log(`> Ready on http://localhost:${port}`)
  })
})
