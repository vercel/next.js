/* global globalThis */

import { NextResponse } from 'next/server'

export async function middleware(request) {
  const url = request.nextUrl

  if (url.pathname.endsWith('/globalthis')) {
    return serializeData(JSON.stringify(Object.keys(globalThis)))
  }

  if (url.pathname.endsWith('/fetchURL')) {
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

  if (url.pathname.includes('/fetchUserAgentDefault')) {
    try {
      const apiRoute = new URL(url)
      apiRoute.pathname = '/api/headers'
      const res = await fetch(apiRoute)
      return serializeData(await res.text())
    } catch (err) {
      return serializeError(err)
    }
  }

  if (url.pathname.includes('/fetchUserAgentCustom')) {
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

  if (url.pathname.endsWith('/abort-controller')) {
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

  if (url.pathname.endsWith('/dynamic-replace')) {
    url.pathname = '/_interface/dynamic-path'
    return NextResponse.rewrite(url)
  }

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
