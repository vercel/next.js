const http = require('http')
const url = require('url')
const fs = require('fs')
const path = require('path')
const server = http.createServer((req, res) => {
  let { pathname } = url.parse(req.url)
  if (pathname.startsWith('/_next/data')) {
    pathname = pathname
      .replace(`/_next/data/${process.env.BUILD_ID}/`, '/')
      .replace(/\.json$/, '')
  }
  console.log('serving', pathname)

  if (pathname === '/favicon.ico') {
    res.statusCode = 404
    return res.end()
  }

  if (pathname.startsWith('/_next/static/')) {
    res.write(
      fs.readFileSync(
        path.join(
          __dirname,
          './.next/static/',
          pathname.slice('/_next/static/'.length)
        ),
        'utf8'
      )
    )
    return res.end()
  } else {
    const re = require(`./.next/serverless/pages${pathname}`)
    return typeof re.render === 'function'
      ? re.render(req, res)
      : re.default(req, res)
  }
})

server.listen(process.env.PORT, () => {
  console.log('ready on', process.env.PORT)
})
