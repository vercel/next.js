import { NextResponse } from 'next/server'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server.browser'
import { getText } from './lib/utils'

export async function middleware(request, ev) {
  // eslint-disable-next-line no-undef
  const { readable, writable } = new TransformStream()
  const url = request.nextUrl
  const writer = writable.getWriter()
  const encoder = new TextEncoder()
  const next = NextResponse.next()

  // Header based on query param
  if (url.searchParams.get('nested-header') === 'true') {
    next.headers.set('x-nested-header', 'valid')
  }

  // Ensure deep can append to this value
  if (url.searchParams.get('append-me') === 'true') {
    next.headers.append('x-append-me', 'top')
  }

  // Ensure deep can append to this value
  if (url.searchParams.get('cookie-me') === 'true') {
    next.headers.append('set-cookie', 'bar=chocochip')
  }

  // Sends a header
  if (url.pathname === '/header') {
    next.headers.set('x-first-header', 'valid')
    return next
  }

  if (url.pathname === '/two-cookies') {
    const headers = new Headers()
    headers.append('set-cookie', 'foo=chocochip')
    headers.append('set-cookie', 'bar=chocochip')
    return new Response('cookies set', {
      headers,
    })
  }

  // Streams a basic response
  if (url.pathname === '/stream-a-response') {
    ev.waitUntil(
      (async () => {
        writer.write(encoder.encode('this is a streamed '))
        writer.write(encoder.encode('response '))
        writer.write(encoder.encode(getText()))
        writer.close()
      })()
    )

    return new Response(readable)
  }

  if (url.pathname === '/bad-status') {
    return new Response('Auth required', {
      headers: { 'WWW-Authenticate': 'Basic realm="Secure Area"' },
      status: 401,
    })
  }

  if (url.pathname === '/stream-long') {
    ev.waitUntil(
      (async () => {
        writer.write(encoder.encode('this is a streamed '.repeat(10)))
        await sleep(200)
        writer.write(encoder.encode('after 2 seconds '.repeat(10)))
        await sleep(200)
        writer.write(encoder.encode('after 4 seconds '.repeat(10)))
        await sleep(200)
        writer.close()
      })()
    )

    return new Response(readable)
  }

  // Sends response
  if (url.pathname === '/send-response') {
    return new Response(JSON.stringify({ message: 'hi!' }))
  }

  // Render React component
  if (url.pathname === '/react') {
    return new Response(
      renderToString(
        createElement(
          'h1',
          {},
          'SSR with React! Hello, ' + url.searchParams.get('name')
        )
      )
    )
  }

  // Stream React component
  if (url.pathname === '/react-stream') {
    ev.waitUntil(
      (async () => {
        writer.write(
          encoder.encode(
            renderToString(createElement('h1', {}, 'I am a stream'))
          )
        )
        await sleep(500)
        writer.write(
          encoder.encode(
            renderToString(createElement('p', {}, 'I am another stream'))
          )
        )
        writer.close()
      })()
    )

    return new Response(readable)
  }

  return next
}

function sleep(time) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, time)
  })
}
