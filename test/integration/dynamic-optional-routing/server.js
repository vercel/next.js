const path = require('path')
const http = require('http')
const url = require('url')

const server = http.createServer((req, res) => {
  const render = async (page) => {
    const mod = require(`./${path.join('.next/serverless/pages/', page)}`)
    try {
      return await (mod.render || mod.default || mod)(req, res)
    } catch (err) {
      res.statusCode = 500
      return res.end('internal error')
    }
  }

  const { pathname } = url.parse(req.url)

  switch (pathname) {
    case '/about':
      return render('/about.js')
    case '/api/post':
    case '/api/post/hello':
    case '/api/post/hello/world': {
      return render('/api/post/[[...slug]].js')
    }
    case '/nested':
    case '/nested/hello':
    case '/nested/hello/world': {
      return render('/nested/[[...optionalName]].js')
    }
    case '/':
    case '/hello':
    case '/hello/world': {
      return render('/[[...optionalName]].js')
    }
    default: {
      res.statusCode = 404
      return res.end('404')
    }
  }
})

const port = process.env.PORT || 3000
server.listen(port, () => {
  console.log('ready on', port)
})
