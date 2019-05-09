const express = require('express')
const { promisify } = require('util')
const http = require('http')
const path = require('path')
const fs = require('fs')

const readFile = promisify(fs.readFile)
const render = async (req, res, pagePath) => {
  pagePath = path.join(__dirname, pagePath)
  if (pagePath.endsWith('.html')) {
    return res.send(await readFile(pagePath, 'utf8'))
  }
  require(pagePath).render(req, res)
}

module.exports = function start (port = 0) {
  return new Promise((resolve, reject) => {
    const app = express()
    const nextStaticDir = path.join(__dirname, '.next', 'static')
    app.use('/_next/static', express.static(nextStaticDir))
    app.get('/', (req, res) => {
      render(req, res, './.next/serverless/pages/index.html')
    })
    app.get('/abc', (req, res) => {
      render(req, res, './.next/serverless/pages/abc.html')
    })
    app.get('/fetch', (req, res) => {
      render(req, res, './.next/serverless/pages/fetch.js')
    })
    app.get('/dynamic', (req, res) => {
      render(req, res, './.next/serverless/pages/dynamic.html')
    })
    app.get('/dynamic-two', (req, res) => {
      render(req, res, './.next/serverless/pages/dynamic-two.html')
    })
    app.get('/amp', (req, res) => {
      if (req.query.amp && req.query.amp.toString() === '1') {
        return render(req, res, './.next/serverless/pages/some-amp.amp.html')
      }
      render(req, res, './.next/serverless/pages/some-amp.html')
    })
    app.get('/404', (req, res) => {
      render(req, res, './.next/serverless/pages/_error.js')
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
