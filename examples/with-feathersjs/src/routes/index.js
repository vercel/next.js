module.exports = function () {
  const server = this
  const app = server.get('next')
  const handle = app.getRequestHandler()

  server
    .use('/posted-pictures', function (req, res, next) {
      return app.render(req, res, '/view', req.params)
    })
    .use(function (req, res, next) {
      return handle(req, res)
    })
}
