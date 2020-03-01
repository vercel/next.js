const { parse } = require('url')
const match = require('micro-route/match')
const next = require('next')

const dev = process.env.NODE_ENV !== 'production'

const app = next({ dev })
const handle = app.getRequestHandler()

const isA = req => match(req, '/a')
const isB = req => match(req, '/b')

async function main(req, res) {
  const parsedUrl = parse(req.url, true)
  const { query } = parsedUrl

  if (isA(req)) {
    return app.render(req, res, '/b', query)
  } else if (isB(req)) {
    return app.render(req, res, '/a', query)
  }

  return handle(req, res, parsedUrl)
}

async function setup(handler) {
  await app.prepare()
  return handler
}

module.exports = setup(main)
