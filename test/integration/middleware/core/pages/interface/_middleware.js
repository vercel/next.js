/* global globalThis */

import { NextResponse } from 'next/server'

export async function middleware(request) {
  const url = request.nextUrl

  if (url.pathname.endsWith('/globalthis')) {
    return new NextResponse(JSON.stringify(Object.keys(globalThis)), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
    })
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
      return new NextResponse(JSON.stringify(response), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
      })
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
      return new NextResponse(JSON.stringify(response), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
      })
    }
  }

  if (url.pathname.endsWith('/root-subrequest')) {
    return fetch(
      `http://${request.headers.get('host')}/interface/root-subrequest`
    )
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
