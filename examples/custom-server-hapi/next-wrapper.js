const { parse } = require('url')

const nextHandlerWrapper = app => {
  const handler = app.getRequestHandler()
  return async ({ raw, url }, h) => {
    await handler(raw.req, raw.res, url)
    return h.close
  }
}
const defaultHandlerWrapper = app => async ({ raw: { req, res }, url }) => {
  const { pathname, query } = parse(url, true)
  return app.renderToHTML(req, res, pathname, query)
}

const pathWrapper = (app, pathName, opts) => async ({ raw, query, params }) => {
  return app.renderToHTML(raw.req, raw.res, pathName, { ...query, ...params }, opts)
}

module.exports = { pathWrapper, defaultHandlerWrapper, nextHandlerWrapper }
