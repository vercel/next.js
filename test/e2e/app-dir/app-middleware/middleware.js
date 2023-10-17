import { NextResponse } from 'next/server'

import { headers as nextHeaders, draftMode } from 'next/headers'

/**
 * @param {import('next/server').NextRequest} request
 */
export async function middleware(request) {
  const headersFromRequest = new Headers(request.headers)
  // It should be able to import and use `headers` inside middleware
  const headersFromNext = nextHeaders()
  headersFromRequest.set('x-from-middleware', 'hello-from-middleware')

  // make sure headers() from `next/headers` is behaving properly
  if (
    headersFromRequest.get('x-from-client') &&
    headersFromNext.get('x-from-client') !==
      headersFromRequest.get('x-from-client')
  ) {
    throw new Error('Expected headers from client to match')
  }

  if (request.nextUrl.searchParams.get('draft')) {
    draftMode().enable()
  }

  const removeHeaders = request.nextUrl.searchParams.get('remove-headers')
  if (removeHeaders) {
    for (const key of removeHeaders.split(',')) {
      headersFromRequest.delete(key)
    }
  }

  const updateHeader = request.nextUrl.searchParams.get('update-headers')
  if (updateHeader) {
    for (const kv of updateHeader.split(',')) {
      const [key, value] = kv.split('=')
      headersFromRequest.set(key, value)
    }
  }

  if (request.nextUrl.pathname.includes('/rewrite-to-app')) {
    request.nextUrl.pathname = '/headers'
    return NextResponse.rewrite(request.nextUrl)
  }

  return NextResponse.next({
    request: {
      headers: headersFromRequest,
    },
  })
}
