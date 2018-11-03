'use strict'

const next = require('next')

module.exports = app => {
  app.beforeStart(async () => {
    const nextServer = next(app.config.next)
    await nextServer.prepare()

    const requestHandler = nextServer.getRequestHandler()

    const renderjsx = async function({ pathname, query = {}, options = {} }) {
      const ctx = this
      ctx.renderNext = true
      const html = await nextServer.renderToHTML(ctx.req, ctx.res, pathname, query, options)
      ctx.body = html
      return html
    }

    Object.defineProperty(app.context, 'requestHandler', {
      writable: false,
      configurable: false,
      value: requestHandler
    })

    // inject `renderjsx` method in egg `context` object
    Object.defineProperty(app.context, 'renderjsx', {
      writable: false,
      configurable: false,
      value: renderjsx
    })
  })
}
