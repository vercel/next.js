// This is not the correct way to implement the Next.js serverless target for production traffic
// It is only used for testing cases of rendering specific pages in the integration test suite

const path = require('path')
const http = require('http')
const send = require('send')

const server = http.createServer((req, res) => {
  if (req.url === '/ssr') {
    return require('./.next/serverless/pages/ssr.js').render(req, res)
  }

  if (req.url === '/getinitialprops') {
    return require('./.next/serverless/pages/getinitialprops.js').render(
      req,
      res
    )
  }

  if (req.url === '/api/api-route') {
    return require('./.next/serverless/pages/api/api-route.js').default(
      req,
      res
    )
  }

  if (req.url === '/user/a') {
    return send(
      req,
      path.join(__dirname, '.next/serverless/pages/user/a.html')
    ).pipe(res)
  }

  if (req.url === '/user/b') {
    return send(
      req,
      path.join(__dirname, '.next/serverless/pages/user/b.html')
    ).pipe(res)
  }

  if (req.url === '/static') {
    return send(
      req,
      path.join(__dirname, '.next/serverless/pages/static.html')
    ).pipe(res)
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
