const path = require('path')
const http = require('http')

const server = http.createServer(async (req, res) => {
  const render = async (page) => {
    const mod = require(`./${path.join('.next/serverless/pages/', page)}`)
    try {
      return await (mod.render || mod.default || mod)(req, res)
    } catch (err) {
      res.statusCode = 500
      return res.end('internal error')
    }
  }

  try {
    await render('/[[...slug]].js')
  } catch (err) {
    console.error('failed to render', err)
    res.statusCode = 500
    res.end('Internal Error')
  }
})

const port = process.env.PORT || 3000
server.listen(port, () => {
  console.log('ready on', port)
})
