const path = require('path')
const http = require('http')

const server = http.createServer((req, res) => {
  const pagePath = (page) => path.join('.next/serverless/pages/', page)
  const render = (page) => {
    require(`./${pagePath(page)}`).render(req, res)
  }

  switch (req.url) {
    case '/docs/gssp': {
      return render('/gssp.js')
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
