const micro = require('micro')
const next = require('next')

const dev = process.env.NODE_ENV !== 'production'
const dir = __dirname
const port = process.env.PORT || 3000

const app = next({ dev, dir })
const handleNextRequests = app.getRequestHandler()

app.prepare().then(() => {
  const server = micro((req, res) => {
    if (/setAssetPrefix/.test(req.url)) {
      app.setAssetPrefix('https://cdn.com/myapp')
    } else {
      // This is to support multi-zones support in localhost
      // and may be in staging deployments
      app.setAssetPrefix('')
    }

    handleNextRequests(req, res)
  })

  server.listen(port, (err) => {
    if (err) {
      throw err
    }

    console.log(`> Ready on http://localhost:${port}`)
  })
})
