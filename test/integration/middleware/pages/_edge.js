export async function onEdgeRequest(req, res, next) {
  // Redirects users to another page
  if (req.url.pathname === '/rewrite-me-to-about') {
    res.rewrite({
      ...req.url,
      pathname: '/about',
      query: {
        ...req.url.query,
        middleware: 'foo',
      },
    })
    return
  }

  // Rewrites user to a page that then streams a response
  if (req.url.pathname === '/rewrite-me-to-about-with-chained-sequence') {
    res.rewrite('/about-with-chained-sequence')
    return
  }

  if (req.url.pathname === '/about-with-chained-sequence') {
    res.write('this is a chained response')
    res.end()
    return
  }

  if (req.url.pathname === '/stream-response') {
    res.write('this is a streamed response')
    res.end()
    return
  }

  // Rewrites a user to an external domain
  if (req.url.pathname === '/rewrite-me-to-vercel') {
    res.rewrite('https://vercel.com')
    return
  }

  // Streams, ends the stream, streams again
  if (req.url.pathname === '/stream-end-stream') {
    res.write('first stream')
    res.end()
    res.write('second stream')
    return
  }

  // Ends response, adds header
  if (req.url.pathname === '/end-headers') {
    res.send('hello world')
    res.end()
    res.setHeaders({ 'x-machina': 'hello' })
    return
  }

  // Streams some body and then sets the header
  if (req.url.pathname === '/stream-header-end') {
    res.setHeaders({ 'x-pre-header': '1' })
    res.write('hello world')
    res.end()
    res.setHeaders({ 'x-machina': 'hello' })
    return
  }

  // Sends some body and then sends another body
  if (req.url.pathname === '/body-end') {
    res.send('hello world')
    res.end()
    res.send('the second hello world')
    return
  }

  // Rewrite twice
  if (req.url.pathname === '/rewrite-header') {
    res.rewrite('https://github.com')
    res.rewrite('https://vercel.com')
    res.end()
    return
  }

  // Redirect and then send a body
  if (req.url.pathname === '/redirect-body') {
    res.redirect('https://google.com')
    res.send('whoops!')
    res.end()
    return
  }

  // Redirect and then stream a response
  if (req.url.pathname === '/redirect-stream') {
    res.redirect('https://google.com')
    res.write('whoops!')
    res.end()
    return
  }

  next()
}
