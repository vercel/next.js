const path = require('path')
const http = require('http')

const server = http.createServer((req, res) => {
  const pagePath = (page) => path.join('.next/serverless/pages/', page)
  const render = (page) => {
    require(`./${pagePath(page)}`).render(req, res)
  }
  const apiCall = (page) => {
    require(`./${pagePath(page)}`).default(req, res)
  }

  switch (req.url) {
    case '/blog/post-1': {
      return render('/blog/[post]')
    }
    case '/query-rewrite/first/second': {
      return render('/with-params')
    }
    case '/api-hello-param/first': {
      return apiCall('/api/hello')
    }
    case '/api-dynamic-param/first': {
      return apiCall('/api/dynamic/[slug]')
    }
    default: {
      res.statusCode(404)
      return res.end('404')
    }
  }
})

const port = process.env.PORT || 3000
server.listen(port, () => {
  console.log('ready on', port)
})
