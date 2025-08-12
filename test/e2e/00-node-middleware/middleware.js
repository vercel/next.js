import { NextResponse } from 'next/server'

const ALLOWED = ['allowed']

export const config = {
  runtime: 'nodejs',
  matcher: [
    '/dynamic/:path*',
    '/_sites/:path*',
    '/:teamId/:slug',
    '/:path*',
    '/',
  ],
}

export function middleware(request) {
  const url = request.nextUrl
  const pathname = url.pathname

  if (pathname.includes('/next-runtime')) {
    return NextResponse.json({ runtime: process.env.NEXT_RUNTIME })
  }

  if (process.env.FOO) {
    console.log(`Includes env variable ${process.env.FOO}`)
  }

  if (url.pathname === '/redirect-me') {
    url.pathname = '/from-middleware'
    return NextResponse.redirect(url, 307)
  }

  if (url.pathname === '/next') {
    return NextResponse.next()
  }

  if (url.pathname === '/version') {
    return NextResponse.json({
      enumerable: Object.keys(self).includes('VercelRuntime'),
      version: self.VercelRuntime.version,
    })
  }

  if (url.pathname === '/globals') {
    const globalThisKeys = Object.keys(globalThis)
    const globalKeys = globalThisKeys.reduce((acc, globalName) => {
      const key = globalName.toString()
      if (global[key]) acc.push(key)
      return acc
    }, [])

    const res = NextResponse.next()
    res.headers.set(
      'data',
      JSON.stringify({ globals: globalKeys, globalThis: globalThisKeys })
    )
    return res
  }

  if (url.pathname === '/log') {
    console.log('hi there')
    return
  }

  if (url.pathname === '/somewhere') {
    url.pathname = '/from-middleware'
    return NextResponse.redirect(url)
  }

  if (url.pathname === '/logs') {
    console.clear()
    for (let i = 0; i < 3; i++) console.count()
    console.count('test')
    console.count('test')
    console.dir({ hello: 'world' })
    console.log('hello')
    console.log('world')
    return
  }

  if (url.pathname === '/greetings') {
    const data = { message: 'hello world!' }
    const res = NextResponse.next()
    res.headers.set('x-example', 'edge')
    res.headers.set('data', JSON.stringify(data))
    return res
  }

  if (url.pathname === '/rewrite-me-to-about') {
    url.pathname = '/about'
    url.searchParams.set('middleware', 'foo')
    return NextResponse.rewrite(url)
  }

  if (url.pathname === '/rewrite-to-site') {
    const customUrl = new URL(url)
    customUrl.pathname = '/_sites/subdomain-1/'
    console.log('rewriting to', customUrl.pathname, customUrl.href)
    return NextResponse.rewrite(customUrl)
  }

  if (url.pathname === '/rewrite-to-another-site') {
    const customUrl = new URL(url)
    customUrl.pathname = '/_sites/test-revalidate'
    console.log('rewriting to', customUrl.pathname, customUrl.href)
    return NextResponse.rewrite(customUrl)
  }

  if (url.pathname === '/redirect-me-to-about') {
    url.pathname = '/about'
    url.searchParams.set('middleware', 'foo')
    return Response.redirect(url)
  }

  if (url.pathname === '/rewrite-absolute') {
    return NextResponse.rewrite('https://example.vercel.sh/foo?foo=bar')
  }

  if (url.pathname === '/rewrite-relative') {
    url.pathname = '/foo'
    url.searchParams.set('foo', 'bar')
    return NextResponse.rewrite(url)
  }

  if (url.pathname === '/redirect-absolute') {
    return Response.redirect('https://vercel.com')
  }

  if (url.pathname === '/redirect-301') {
    url.pathname = '/greetings'
    return NextResponse.redirect(url, 301)
  }

  if (url.pathname === '/reflect') {
    const res = NextResponse.next()
    res.headers.set(
      'data',
      JSON.stringify({
        geo: request.geo,
        headers: Object.fromEntries(request.headers),
        ip: request.ip,
        method: request.method,
        nextUrl: {
          hash: request.nextUrl.hash,
          hostname: request.nextUrl.hostname,
          pathname: request.nextUrl.pathname,
          port: request.nextUrl.port,
          protocol: request.nextUrl.protocol,
          search: request.nextUrl.search,
        },
        url: request.url,
      })
    )
    return res
  }

  if (url.pathname === '/stream-response') {
    const { writable } = new TransformStream()
    const waitUntil = (async () => {
      const enc = new TextEncoder()
      const writer = writable.getWriter()
      writer.write(enc.encode('this is a streamed '))
      writer.write(enc.encode('response '))
      return writer.close()
    })()

    return {
      waitUntil,
      response: NextResponse.next(),
    }
  }

  if (url.pathname === '/throw-error') {
    const error = new Error('oh no!')
    console.log('This is not worker.js')
    console.error(error)
    return new Promise((_, reject) => reject(error))
  }

  if (url.pathname === '/throw-error-internal') {
    function myFunctionName() {
      throw new Error('Oh no!')
    }

    function anotherFunction() {
      return myFunctionName()
    }

    try {
      anotherFunction()
    } catch (err) {
      console.error(err)
    }

    return new Promise((_, reject) => reject(new Error('oh no!')))
  }

  if (url.pathname === '/unhandledrejection') {
    Promise.reject(new TypeError('captured unhandledrejection error.'))
    return NextResponse.next()
  }

  if (pathname.startsWith('/query-params')) {
    if (pathname.endsWith('/clear')) {
      const strategy =
        url.searchParams.get('strategy') === 'rewrite' ? 'rewrite' : 'redirect'

      for (const key of [...url.searchParams.keys()]) {
        if (!ALLOWED.includes(key)) {
          url.searchParams.delete(key)
        }
      }

      const newPath = url.pathname.replace(/\/clear$/, '')
      url.pathname = newPath

      if (strategy === 'redirect') {
        return NextResponse.redirect(url)
      } else {
        return NextResponse.rewrite(url)
      }
    }

    const obj = Object.fromEntries([...url.searchParams.entries()])

    const res = NextResponse.next()
    res.headers.set('data', JSON.stringify(obj))
    return res
  }

  if (pathname.startsWith('/home')) {
    if (!request.cookies.get('bucket')) {
      const bucket = Math.random() >= 0.5 ? 'a' : 'b'
      url.pathname = `/home/${bucket}`
      const response = NextResponse.rewrite(url)
      response.cookies.set('bucket', bucket)
      return response
    }

    url.pathname = `/home/${request.cookies.get('bucket')}`
    return NextResponse.rewrite(url)
  }

  if (pathname.startsWith('/fetch-subrequest')) {
    const destinationUrl =
      url.searchParams.get('url') || 'https://example.vercel.sh'
    return fetch(destinationUrl, { headers: request.headers })
  }

  if (url.pathname === '/dynamic/greet') {
    const res = NextResponse.next()
    res.headers.set(
      'data',
      JSON.stringify({
        message: url.searchParams.get('greeting') || 'Hi friend',
      })
    )
    return res
  }
}
