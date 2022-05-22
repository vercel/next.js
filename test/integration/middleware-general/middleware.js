/* global globalThis */
import { NextRequest, NextResponse } from 'next/server'
import magicValue from 'shared-package'

export async function middleware(request) {
  const url = request.nextUrl

  if (url.pathname.startsWith('/fetch-user-agent-default')) {
    try {
      const apiRoute = new URL(url)
      apiRoute.pathname = '/api/headers'
      const res = await fetch(apiRoute)
      return serializeData(await res.text())
    } catch (err) {
      return serializeError(err)
    }
  }

  if (url.pathname.startsWith('/fetch-user-agent-crypto')) {
    try {
      const apiRoute = new URL(url)
      apiRoute.pathname = '/api/headers'
      const res = await fetch(apiRoute, {
        headers: {
          'user-agent': 'custom-agent',
        },
      })
      return serializeData(await res.text())
    } catch (err) {
      return serializeError(err)
    }
  }

  if (url.pathname === '/global') {
    // The next line is required to allow to find the env variable
    // eslint-disable-next-line no-unused-expressions
    process.env.MIDDLEWARE_TEST
    return serializeData(JSON.stringify({ process: { env: process.env } }))
  }

  if (url.pathname.endsWith('/globalthis')) {
    return serializeData(JSON.stringify(Object.keys(globalThis)))
  }

  if (url.pathname.endsWith('/webcrypto')) {
    const response = {}
    try {
      const algorithm = {
        name: 'RSA-PSS',
        hash: 'SHA-256',
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        modulusLength: 2048,
      }
      const keyUsages = ['sign', 'verify']
      await crypto.subtle.generateKey(algorithm, false, keyUsages)
    } catch (err) {
      response.error = true
    } finally {
      return serializeData(JSON.stringify(response))
    }
  }

  if (url.pathname.endsWith('/fetch-url')) {
    const response = {}
    try {
      await fetch(new URL('http://localhost'))
    } catch (err) {
      response.error = {
        name: err.name,
        message: err.message,
      }
    } finally {
      return serializeData(JSON.stringify(response))
    }
  }

  if (url.pathname === '/abort-controller') {
    const controller = new AbortController()
    const signal = controller.signal

    controller.abort()
    const response = {}

    try {
      await fetch('https://example.com', { signal })
    } catch (err) {
      response.error = {
        name: err.name,
        message: err.message,
      }
    } finally {
      return serializeData(JSON.stringify(response))
    }
  }

  if (url.pathname.endsWith('/root-subrequest')) {
    const res = await fetch(url)
    res.headers.set('x-dynamic-path', 'true')
    return res
  }

  if (url.pathname === '/about') {
    if (magicValue !== 42) throw new Error('shared-package problem')
    return NextResponse.rewrite(new URL('/about/a', request.url))
  }

  if (url.pathname.startsWith('/url')) {
    try {
      if (request.nextUrl.pathname === '/url/relative-url') {
        new URL('/relative')
        return Response.next()
      }

      if (request.nextUrl.pathname === '/url/relative-request') {
        await fetch(new Request('/urls-b'))
        return Response.next()
      }

      if (request.nextUrl.pathname === '/url/relative-redirect') {
        return Response.redirect('/urls-b')
      }

      if (request.nextUrl.pathname === '/url/relative-next-redirect') {
        return NextResponse.redirect('/urls-b')
      }

      if (request.nextUrl.pathname === '/url/relative-next-rewrite') {
        return NextResponse.rewrite('/urls-b')
      }

      if (request.nextUrl.pathname === '/url/relative-next-request') {
        await fetch(new NextRequest('/urls-b'))
        return NextResponse.next()
      }
    } catch (error) {
      return new NextResponse(null, { headers: { error: error.message } })
    }
  }

  // Map metadata by default
  return new Response(null, {
    headers: {
      'req-url-basepath': request.nextUrl.basePath,
      'req-url-pathname': request.nextUrl.pathname,
      'req-url-params': JSON.stringify(request.page.params),
      'req-url-page': request.page.name,
      'req-url-query': request.nextUrl.searchParams.get('foo'),
      'req-url-locale': request.nextUrl.locale,
    },
  })
}

function serializeData(data) {
  return new NextResponse(null, { headers: { data } })
}

function serializeError(error) {
  return new NextResponse(null, { headers: { error: error.message } })
}
