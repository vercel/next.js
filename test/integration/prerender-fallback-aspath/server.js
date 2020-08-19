const http = require('http')
const url = require('url')

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = url.parse(req.url)

    switch (pathname) {
      case '/blog/[post]':
      case '/web-app/blog/[post]':
        return require('./.next/serverless/pages/blog/[post].js').render(
          req,
          res
        )
      case '/blog/[post]/[comment]':
      case '/web-app/blog/[post]/[comment]':
        return require('./.next/serverless/pages/blog/[post]/[comment].js').render(
          req,
          res
        )
      default:
        return res.end('404')
    }
  } catch (err) {
    console.error('error rendering', err)
  }
})

server.listen(process.env.PORT, () => {
  console.log('ready on', process.env.PORT)
})
