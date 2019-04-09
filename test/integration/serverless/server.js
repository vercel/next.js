const express = require('express')
const http = require('http')
const path = require('path')

module.exports = function start (port = 0) {
  return new Promise((resolve, reject) => {
    const app = express()
    const nextStaticDir = path.join(__dirname, '.next', 'static')
    app.use('/_next/static', express.static(nextStaticDir))
    app.get('/', (req, res) => {
      require('./.next/serverless/pages/index.js').render(req, res)
    })
    app.get('/abc', (req, res) => {
      require('./.next/serverless/pages/abc.js').render(req, res)
    })
    app.get('/fetch', (req, res) => {
      require('./.next/serverless/pages/fetch.js').render(req, res)
    })
    app.get('/dynamic', (req, res) => {
      require('./.next/serverless/pages/dynamic.js').render(req, res)
    })
    app.get('/dynamic-two', (req, res) => {
      require('./.next/serverless/pages/dynamic-two.js').render(req, res)
    })
    app.get('/amp', (req, res) => {
      require('./.next/serverless/pages/some.amp.js').render(req, res)
    })
    app.get('/404', (req, res) => {
      require('./.next/serverless/pages/_error.js').render(req, res)
    })
    const server = new http.Server(app)

    server.listen(port, (err) => {
      if (err) {
        return reject(err)
      }

      resolve(server)
    })
  })
}
