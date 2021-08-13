import { createElement } from 'react'
import { renderToString } from 'react-dom/server.browser'

function sleep(time) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, time)
  })
}

export async function middleware(
  req,
  res,
  next = () => {
    return
  }
) {
  // Streams a basic response
  if (req.url.pathname === '/responses/stream-a-response') {
    res.write('this is a streamed ')
    res.write('response')
    res.end()
    next()
  }

  if (req.url.pathname === '/responses/bad-status') {
    res.status(401)
    res.setHeaders({ 'WWW-Authenticate': 'Basic realm="Secure Area"' })
    res.end('Auth required')
  }

  // Streams, ends the stream, streams again
  if (req.url.pathname === '/responses/stream-end-stream') {
    res.write('first stream')
    res.end()
    res.write('second stream')
    next()
  }
  // Streams some body, sets the header, ends the response and attempts to send another header
  if (req.url.pathname === '/responses/stream-header-end') {
    res.setHeaders({ 'x-pre-header': '1' })
    res.write('hello world')
    res.end()
    res.setHeaders({ 'x-machina': 'hello' })
    next()
  }

  if (req.url.pathname === '/responses/stream-long') {
    res.write('this is a streamed '.repeat(10))
    await sleep(2000)
    res.write('after 2 seconds '.repeat(10))
    await sleep(2000)
    res.write('after 4 seconds '.repeat(10))
    await sleep(2000)
    res.end()
    return
  }

  // Redirect and then stream a response
  if (req.url.pathname === '/responses/redirect-stream') {
    res.redirect('https://google.com')
    res.write('whoops!')
    res.end()
    next()
  }

  // Sends a header
  if (req.url.pathname === '/responses/header') {
    res.setHeaders({ 'x-first-header': 'valid' })
    next()
  }

  // Header based on query param
  if (req.url.query['nested-header'] === 'true') {
    res.setHeaders({ 'x-nested-header': 'valid' })
    next()
  }

  // Sends response
  if (req.url.pathname === '/responses/send-response') {
    res.send({ message: 'hi!' })
    res.end()
    next()
  }

  // Ends response, adds header
  if (req.url.pathname === '/responses/body-end-header') {
    res.send('hello world')
    res.end()
    res.setHeaders({ 'x-late': 'valid' })
    next()
  }

  // Ends response, adds header
  if (req.url.pathname === '/responses/body-end-body') {
    res.send('hello world')
    res.end()
    res.send('the second hello world')
    next()
  }
  // Redirect and then send a body
  if (req.url.pathname === '/responses/redirect-body') {
    res.redirect('https://google.com')
    res.send('whoops!')
    res.end()
    next()
  }

  // Render React component
  if (req.url.pathname === '/responses/react') {
    res.send(
      renderToString(
        createElement(
          'h1',
          {},
          'SSR with React on the edge! Hello, ' + req.url.query.name
        )
      )
    )
  }

  // Stream React component
  if (req.url.pathname === '/responses/react-stream') {
    res.write(renderToString(createElement('h1', {}, 'I am a stream')))
    await sleep(500)
    res.write(renderToString(createElement('p', {}, 'I am another stream')))
    res.end()
  }

  next()
}
