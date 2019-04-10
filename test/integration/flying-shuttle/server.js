const express = require('express')
const http = require('http')
const path = require('path')

module.exports = function start (
  port = 0,
  directory = path.join(__dirname, '.next')
) {
  return new Promise((resolve, reject) => {
    const app = express()

    const nextStaticDir = path.join(directory, 'static')
    app.use('/_next/static', express.static(nextStaticDir))

    app.get('/', (req, res) => {
      require(path.join(directory, 'serverless/pages/index.js')).render(
        req,
        res
      )
    })
    try {
      const o = require(path.join(directory, 'serverless/pages/other.js'))
      app.get('/other', (req, res) => {
        o.render(req, res)
      })
    } catch (_) {
      // ignored
    }
    app.get('/about', (req, res) => {
      require(path.join(directory, 'serverless/pages/about.js')).render(
        req,
        res
      )
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
