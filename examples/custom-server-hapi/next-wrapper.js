const pathWrapper = (app, pathName, opts) => ({ raw, query }, hapiReply) =>
app.renderToHTML(raw.req, raw.res, pathName, query, opts)
.then(hapiReply)

const defaultHandlerWrapper = app => {
  const handler = app.getRequestHandler()
  return ({ raw, url }, hapiReply) =>
    handler(raw.req, raw.res, url)
      .then(() => {
        hapiReply.close(false)
      })
}
module.exports = { pathWrapper, defaultHandlerWrapper }
