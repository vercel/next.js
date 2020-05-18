const http = require('http')
const port = process.env.PORT || 3000

const server = new http.Server(async (req, res) => {
  if (req.url === '/usernames') {
    return res.end(
      JSON.stringify({
        usernames: ['a', 'b'],
      })
    )
  }

  if (req.url === '/usernames/a') {
    return res.end(
      JSON.stringify({
        from: 'a',
      })
    )
  }

  if (req.url === '/usernames/b') {
    return res.end(
      JSON.stringify({
        from: 'b',
      })
    )
  }

  res.end(JSON.stringify({ foo: 'bar' }))
})

server.listen(port, (err) => {
  if (err) {
    throw err
  }

  console.log(`> Ready on http://localhost:${port}`)
})
