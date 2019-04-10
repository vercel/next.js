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
    app.get('/other', (req, res) => {
      require('./.next/serverless/pages/other.js').render(req, res)
    })
    app.get('/about', (req, res) => {
      require('./.next/serverless/pages/about.js').render(req, res)
    })

    const server = new http.Server(app)
    server.listen(port, err => {
      if (err) {
        return reject(err)
      }
      resolve(server)
    })
  })
}
