const http = require('http')
const mod = require('./.next/serverless/pages/another')

const server = http.createServer(async (req, res) => {
  try {
    await mod.render(req, res)
  } catch (err) {
    console.error(err)
    res.statusCode = 500
    res.end('internal error')
  }
})

server.listen(3000, () => console.log('listening'))
