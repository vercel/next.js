export function middleware(req, res, next) {
  if (req.url.pathname === '/redirect-with-basepath' && !req.url.basePath) {
    res.redirect({ ...req.url, basePath: '/root' })
    return
  }

  if (req.url.pathname === '/redirect-with-basepath') {
    res.rewrite('/about')
    return
  }

  next()
}
