const next = require('next')
const express = require('express')

const dev = process.env.NODE_ENV !== 'production'
const dir = __dirname
const port = parseInt(process.env.PORT || '3000', 10)

const app = next({ dev, dir })
const handleNextRequests = app.getRequestHandler()

app.prepare().then(() => {
  const server = express()

  server.use(express.json({ limit: '5mb' }))

  server.all('*', (req, res) => {
    req.fromCustomServer = true
    handleNextRequests(req, res)
  })

  const httpServer = server.listen(port, (err) => {
    if (err) {
      throw err
    }

    const address = httpServer.address()
    const actualPort =
      typeof address === 'object' && address ? address.port : port
    console.log(`- Local: http://localhost:${actualPort}`)
  })
})
