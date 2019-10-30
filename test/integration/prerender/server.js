const http = require('http')
const url = require('url')

const server = http.createServer((req, res) => {
  let { pathname } = url.parse(req.url)
  if (pathname.startsWith('/_next/data')) {
    pathname = pathname
      .replace(`/_next/data/${process.env.BUILD_ID}/`, '/')
      .replace(/\.json$/, '')
  }
  console.log('serving', pathname)
  require(`./.next/serverless/pages${pathname}`).render(req, res)
})

server.listen(process.env.PORT, () => {
  console.log('ready on', process.env.PORT)
})
