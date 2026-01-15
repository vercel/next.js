const http = require('http')

const port = process.env.PORT || 3456

let requestCount = 0

const server = http.createServer((req, res) => {
  requestCount++
  res.setHeader('Content-Type', 'application/json')

  // Generate ~10MB of JSON data per request
  const items = Array.from({ length: 1000 }, (_, i) => ({
    id: i,
    data: 'x'.repeat(10000), // ~10KB per item = ~10MB total
    timestamp: Date.now(),
    requestNumber: requestCount,
  }))

  res.end(JSON.stringify({ items }))
})

server.listen(port, () => {
  console.log(`Server listening on port ${port}`)
})
