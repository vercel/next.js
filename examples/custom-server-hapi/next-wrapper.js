const pathWrapper = (app, pathName, opts) => ({ raw, query }, hapiReply) =>
app.renderToHTML(raw.req, raw.res, pathName, query, opts)
.then(hapiReply)

const defaultHandlerWrapper = app => ({ raw, url }, hapiReply) =>
app.run(raw.req, raw.res, url)

module.exports = { pathWrapper, defaultHandlerWrapper }
