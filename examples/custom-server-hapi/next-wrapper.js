const pathWrapper = (app, pathName, opts) => ({ raw, query }, hapiReply) =>
app.renderToHTML(raw.req, raw.res, pathName, query, opts)
.then(hapiReply)

const defaultHandlerWrapper = app => ({ raw }, hapiReply) =>
app.run(raw.req, raw.res)

module.exports = { pathWrapper, defaultHandlerWrapper }
