const express = require('express')
const Next = require('next')
const https = require('https')
const fs = require('fs')
const app = express()
const port = 3000
const isDev = process.env.NODE_ENV !== 'production'
const next = Next({ dev: isDev })

// Set up next
next.prepare()

// Set up next handler
app.use(next.getRequestHandler())

// Set up https.Server options with SSL
const options = {
  key: fs.readFileSync('./localhost.key'),
  cert: fs.readFileSync('./localhost.cert')
}

// Create http server using express app as requestHandler
const server = https.createServer(options, app)

// Set up proxying for Next's onDemandEntries WebSocket to allow
// using our SSL
if (isDev) {
  const CreateProxyServer = require('http-proxy').createProxyServer
  const proxy = CreateProxyServer({
    target: {
      host: 'localhost',
      port: 3001
    }
  })

  server.on('upgrade', (req, socket, head) => {
    proxy.ws(req, socket, head)
  })
}

server.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`)
})
