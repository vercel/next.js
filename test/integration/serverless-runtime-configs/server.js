const path = require('path')
const http = require('http')
const send = require('send')

const server = http.createServer((req, res) => {
  if (req.url === '/config') {
    return require('./.next/serverless/pages/config.js').render(req, res)
  }

  if (req.url === '/') {
    return send(
      req,
      path.join(__dirname, '.next/serverless/pages/index.html')
    ).pipe(res)
  }

  if (req.url === '/api/config') {
    return require('./.next/serverless/pages/api/config.js').default(req, res)
  }

  if (req.url.startsWith('/_next')) {
    send(
      req,
      path.join(__dirname, '.next', req.url.split('/_next').pop())
    ).pipe(res)
  }
})

server.listen(process.env.PORT, () => {
  console.log('ready on', process.env.PORT)
})
