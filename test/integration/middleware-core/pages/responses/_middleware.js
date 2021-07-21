import { createElement } from 'react'
import { renderToString } from 'react-dom/server.browser'
import { NextResponse } from 'next/server'

export async function middleware(event) {
  // eslint-disable-next-line no-undef
  const { readable, writable } = new TransformStream()
  const url = event.request.nextUrl
  const writer = writable.getWriter()
  const encoder = new TextEncoder()
  const next = NextResponse.next()

  // Sends a header
  if (url.pathname === '/responses/header') {
    next.headers.set('x-first-header', 'valid')
    event.respondWith(next)
  }

  // Header based on query param
  if (url.searchParams.get('nested-header') === 'true') {
    next.headers.set('x-nested-header', 'valid')
    event.respondWith(next)
  }

  // Streams a basic response
  if (url.pathname === '/responses/stream-a-response') {
    event.respondWith(new Response(readable))
    writer.write(encoder.encode('this is a streamed '))
    writer.write(encoder.encode('response'))
    writer.close()
    return
  }

  if (url.pathname === '/responses/bad-status') {
    event.respondWith(
      new Response('Auth required', {
        headers: { 'WWW-Authenticate': 'Basic realm="Secure Area"' },
        status: 401,
      })
    )
  }

  if (url.pathname === '/responses/stream-long') {
    event.respondWith(new Response(readable))
    writer.write(encoder.encode('this is a streamed '.repeat(10)))
    await sleep(2000)
    writer.write(encoder.encode('after 2 seconds '.repeat(10)))
    await sleep(2000)
    writer.write(encoder.encode('after 4 seconds '.repeat(10)))
    await sleep(2000)
    writer.close()
    return
  }

  // Sends response
  if (url.pathname === '/responses/send-response') {
    return event.respondWith(new Response(JSON.stringify({ message: 'hi!' })))
  }

  // Render React component
  if (url.pathname === '/responses/react') {
    return event.respondWith(
      new Response(
        renderToString(
          createElement(
            'h1',
            {},
            'SSR with React! Hello, ' + url.searchParams.get('name')
          )
        )
      )
    )
  }

  // Stream React component
  if (url.pathname === '/responses/react-stream') {
    event.respondWith(new Response(readable))
    writer.write(
      encoder.encode(renderToString(createElement('h1', {}, 'I am a stream')))
    )
    await sleep(500)
    writer.write(
      encoder.encode(
        renderToString(createElement('p', {}, 'I am another stream'))
      )
    )
    writer.close()
    return
  }

  event.respondWith(next)
}

function sleep(time) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, time)
  })
}
