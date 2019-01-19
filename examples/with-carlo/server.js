const { createServer } = require('http')
const next = require('next')
const carlo = require('./carlo')

const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(async () => {
  const url = `http://localhost:${port}`

  app.setAssetPrefix(url)
  createServer(handle).listen(port, err => {
    if (err) throw err
    console.log(`> Ready on ${url}`)
  })

  await carlo(url)
})
