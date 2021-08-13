export function middleware(
  req,
  res,
  next = () => {
    return
  }
) {
  // Redirect cleanly with url params
  if (req.url.query['foo'] === 'bar') {
    res.redirect('/redirects/new-home')
    next()
  }

  // Redirects to new home
  if (req.url.pathname === '/redirects/old-home') {
    res.redirect('/redirects/new-home')
    next()
  }

  // Redirect and then send a body
  if (req.url.pathname === '/redirects/redirect-to-google') {
    res.redirect('https://google.com')
    res.send('whoops!')
    res.end()
    next()
  }

  // Redirect and then stream a response
  if (req.url.pathname === '/redirects/redirect-to-google-stream') {
    res.redirect('https://google.com')
    res.write('whoops!')
    res.end()
    next()
  }

  // Chained redirects
  if (req.url.pathname === '/redirects/redirect-me-alot') {
    res.redirect('/redirects/redirect-me-alot-2')
    next()
  }

  if (req.url.pathname === '/redirects/redirect-me-alot-2') {
    res.redirect('/redirects/redirect-me-alot-3')
    next()
  }
  if (req.url.pathname === '/redirects/redirect-me-alot-3') {
    res.redirect('/redirects/redirect-me-alot-4')
    next()
  }

  if (req.url.pathname === '/redirects/redirect-me-alot-4') {
    res.redirect('/redirects/redirect-me-alot-5')
    next()
  }

  if (req.url.pathname === '/redirects/redirect-me-alot-5') {
    res.redirect('/redirects/redirect-me-alot-6')
    next()
  }
  if (req.url.pathname === '/redirects/redirect-me-alot-6') {
    res.redirect('/redirects/redirect-me-alot-7')
    next()
  }
  if (req.url.pathname === '/redirects/redirect-me-alot-7') {
    res.redirect('/redirects/new-home')
    next()
  }

  // Infinite loop
  if (req.url.pathname === '/redirects/infinite-loop') {
    res.redirect('/redirects/infinite-loop-1')
    next()
  }
  if (req.url.pathname === '/redirects/infinite-loop-1') {
    res.redirect('/redirects/infinite-loop')
    next()
  }

  next()
}
