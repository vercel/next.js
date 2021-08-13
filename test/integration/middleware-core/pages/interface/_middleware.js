export function middleware(
  req,
  res,
  next = () => {
    return
  }
) {
  res.setHeaders({
    'req-url-basepath': req.url.basePath,
    'req-url-pathname': req.url.pathname,
    'req-url-params': JSON.stringify(req.url.params),
    'req-url-page': req.url.page,
    'req-url-query': req.url.query['foo'],
    'req-url-locale': req.url.locale.locale,
  })
  next()
}
