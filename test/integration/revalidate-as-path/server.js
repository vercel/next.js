const http = require('http')
const url = require('url')

const render = (pagePath, req, res) => {
  const mod = require(`./.next/serverless/pages/${pagePath}`)
  return (mod.render || mod.default || mod)(req, res)
}

const { BUILD_ID } = process.env

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = url.parse(req.url)

    switch (pathname) {
      case '/index':
      case '/':
      case `/_next/data/${BUILD_ID}/index.json`:
        return render('index.js', req, res)
      case '/another/index':
      case '/another':
      case `/_next/data/${BUILD_ID}/another/index.json`:
        return render('another/index.js', req, res)
      default: {
        res.statusCode = 404
        res.end('not found')
      }
    }
  } catch (err) {
    console.error('failed to render', err)
    res.statusCode = 500
    res.end(err.message)
  }
})

server.listen(process.env.PORT, () => {
  console.log('ready on', process.env.PORT)
})
