export function onEdgeRequest(req, res, next) {
  if (req.url.pathname === '/home') {
    let bucket = req.cookies.bucket
    if (!bucket) {
      bucket = Math.random() >= 0.5 ? 'a' : 'b'
      res.cookie('bucket', bucket)
    }

    res.rewrite(`/home/${bucket}`)
    next()
  }

  next()
}
