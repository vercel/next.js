const nextHandlerWrapper = app => {
  const handler = app.getRequestHandler()
  return async ({ raw, url }, h) => {
    await handler(raw.req, raw.res, url)
    return h.close
  }
}
const defaultHandlerWrapper = app => async ({ raw: { req, res }, url }, h) => {
  const { pathname, query } = url
  const html = await app.renderToHTML(req, res, pathname, query)
  return h.response(html).code(res.statusCode)
}

const pathWrapper = (app, pathName, opts) => async (
  { raw, query, params },
  h
) => {
  const html = await app.renderToHTML(
    raw.req,
    raw.res,
    pathName,
    { ...query, ...params },
    opts
  )
  return h.response(html).code(raw.res.statusCode)
}

module.exports = { pathWrapper, defaultHandlerWrapper, nextHandlerWrapper }
