export function middleware(
  req,
  res,
  next = () => {
    return
  }
) {
  if (req.url.pathname === '/rewrites/rewrite-me-without-hard-navigation') {
    res.rewrite({
      ...req.url,
      pathname: '/rewrites/about',
      query: {
        ...req.url.query,
        middleware: 'foo',
      },
    })
    return
  }

  // Adds a cookie and rewrites to AB test
  if (req.url.pathname === '/rewrites/rewrite-to-ab-test') {
    let bucket = req.cookies.bucket
    if (!bucket) {
      bucket = Math.random() >= 0.5 ? 'a' : 'b'
      res.cookie('bucket', bucket)
    }
    res.rewrite(`/rewrites/${bucket}`)
    next()
  }

  // Redirects users to another page
  if (req.url.pathname === '/rewrites/rewrite-me-to-about') {
    res.rewrite('/rewrites/about')
  }

  // Rewrites a user to an external domain
  if (req.url.pathname === '/rewrites/rewrite-me-to-vercel') {
    res.rewrite('https://vercel.com')
  }

  // Rewrite twice
  if (req.url.pathname === '/rewrites/rewrite-me-external-twice') {
    res.rewrite('https://vercel.com')
    res.rewrite('https://github.com')

    res.end()
  }

  next()
}
