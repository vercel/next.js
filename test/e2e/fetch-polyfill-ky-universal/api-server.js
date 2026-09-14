const http = require('http')
const port = process.env.PORT || 3000

const server = new http.Server(async (req, res) => {
  res.end(JSON.stringify({ foo: 'bar' }))
})

server.listen(port, (err) => {
  if (err) {
    throw err
  }

  console.log(`> Ready on http://localhost:${port}`)
})
