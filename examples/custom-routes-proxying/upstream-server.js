const http = require('http')
const PORT = process.env.UPSTREAM_PORT

const server = http.createServer((req, res) => {
  console.log(`Upstream server got request for ${req.url}`)
  res.end(`hi from upstream server, requested: ${req.url}`)
})

server.listen(PORT, () => {
  console.log(`Upstream server listening at ::${PORT}`)
})
