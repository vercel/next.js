const path = require('path')
const http = require('http')

const server = http.createServer((req, res) => {
  const pagePath = (page) => path.join('.next/serverless/pages/', page)
  const render = (page) => {
    require(`./${pagePath(page)}`).render(req, res)
  }

  switch (req.url) {
    case '/revalidate': {
      return render('/revalidate')
    }
    default: {
      return res.end('404')
    }
  }
})
server.listen(process.env.PORT, () => {
  console.log('ready on', process.env.PORT)
})
