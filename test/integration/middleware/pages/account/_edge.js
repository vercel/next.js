export function onEdgeRequest(req, res, next) {
  if (req.url.pathname === '/account') {
    res.redirect('/account/new-page')
    return
  }

  if (req.url.pathname === '/account/request-parse') {
    res.setHeaders({
      'req-url-basepath': req.url.basePath || '',
      'req-url-params': JSON.stringify(req.url.params || {}),
      'req-url-pathname': req.url.pathname,
    })
    res.rewrite('/account/new-page')
    return
  }

  next()
}
