/* global globalThis */
import { NextRequest, NextResponse } from 'next/server'
import magicValue from 'shared-package'

export const config = {
  regions: 'auto',
  runtime: 'nodejs',
}

const PATTERNS = []

const params = (url) => {
  const input = url.split('?')[0]
  let result = {}

  for (const [pattern, handler] of PATTERNS) {
    const patternResult = pattern.exec(input)
    if (patternResult !== null && 'pathname' in patternResult) {
      result = handler(patternResult)
      break
    }
  }
  return result
}

export async function middleware(request) {
  const url = request.nextUrl

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (url.pathname.startsWith('/test-node-fs')) {
      const fs = await import('fs')
      const path = await import('path')
      const pkgPath = path.join(process.cwd(), 'package.json')
      const pkgData = JSON.parse(await fs.promises.readFile(pkgPath, 'utf8'))
      return NextResponse.json(pkgData)
    }
  }

  if (request.headers.get('x-prerender-revalidate')) {
    return NextResponse.next({
      headers: { 'x-middleware': 'hi' },
    })
  }

  // this is needed for tests to get the BUILD_ID
  if (url.pathname.startsWith('/_next/static/__BUILD_ID')) {
    return NextResponse.next()
  }

  if (
    url.pathname.includes('/_next/static/chunks/pages/_app-non-existent.js')
  ) {
    return NextResponse.rewrite('https://example.vercel.sh')
  }

  if (url.pathname === '/api/edge-search-params') {
    const newUrl = url.clone()
    newUrl.searchParams.set('foo', 'bar')
    return NextResponse.rewrite(newUrl)
  }

  if (url.pathname === '/') {
    url.pathname = '/ssg/first'
    return NextResponse.rewrite(url)
  }

  if (url.pathname === '/to-ssg') {
    url.pathname = '/ssg/hello'
    url.searchParams.set('from', 'middleware')
    return NextResponse.rewrite(url)
  }

  if (url.pathname === '/sha') {
    url.pathname = '/shallow'
    return NextResponse.rewrite(url)
  }

  if (url.pathname.startsWith('/fetch-user-agent-default')) {
    try {
      const apiRoute = new URL(url)
      apiRoute.pathname = '/api/headers'
      const res = await fetch(withLocalIp(apiRoute))
      return serializeData(await res.text())
    } catch (err) {
      return serializeError(err)
    }
  }

  if (url.pathname === '/rewrite-to-dynamic') {
    url.pathname = '/blog/from-middleware'
    url.searchParams.set('some', 'middleware')
    return NextResponse.rewrite(url)
  }

  if (url.pathname === '/rewrite-to-config-rewrite') {
    url.pathname = '/rewrite-3'
    url.searchParams.set('some', 'middleware')
    return NextResponse.rewrite(url)
  }

  if (url.pathname.startsWith('/fetch-user-agent-crypto')) {
    try {
      const apiRoute = new URL(url)
      apiRoute.pathname = '/api/headers'
      const res = await fetch(withLocalIp(apiRoute), {
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
    return serializeData(
      JSON.stringify({
        process: {
          env: {
            ANOTHER_MIDDLEWARE_TEST: process.env.ANOTHER_MIDDLEWARE_TEST,
            STRING_ENV_VAR: process.env.STRING_ENV_VAR,
            MIDDLEWARE_TEST: process.env.MIDDLEWARE_TEST,
            NEXT_RUNTIME: process.env.NEXT_RUNTIME,
          },
        },
      })
    )
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
      await fetch('https://example.vercel.sh', { signal })
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

  if (url.pathname === '/redirect-to-somewhere') {
    url.pathname = '/somewhere'
    return NextResponse.redirect(url, {
      headers: {
        'x-redirect-header': 'hi',
      },
    })
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

  if (url.pathname === '/ssr-page') {
    url.pathname = '/ssr-page-2'
    return NextResponse.rewrite(url)
  }

  if (url.pathname === '/error-throw' && request.__isData) {
    throw new Error('test error')
  }

  const original = new URL(request.url)
  return NextResponse.next({
    headers: {
      'req-url-path': `${original.pathname}${original.search}`,
      'req-url-basepath': request.nextUrl.basePath,
      'req-url-pathname': request.nextUrl.pathname,
      'req-url-query': request.nextUrl.searchParams.get('foo'),
      'req-url-locale': request.nextUrl.locale,
      'req-url-params':
        url.pathname !== '/static' ? JSON.stringify(params(request.url)) : '{}',
    },
  })
}

function serializeData(data) {
  return new NextResponse(null, { headers: { data } })
}

function serializeError(error) {
  return new NextResponse(null, { headers: { error: error.message } })
}

function withLocalIp(url) {
  return String(url).replace('localhost', '127.0.0.1')
}
