import { NextResponse } from 'next/server'

/**
 * @param {import('next/server').NextRequest} request
 */
export async function middleware(request) {
  const headers = new Headers(request.headers)
  headers.set('x-from-middleware', 'hello-from-middleware')

  const removeHeaders = request.nextUrl.searchParams.get('remove-headers')
  if (removeHeaders) {
    for (const key of removeHeaders.split(',')) {
      headers.delete(key)
    }
  }

  const updateHeader = request.nextUrl.searchParams.get('update-headers')
  if (updateHeader) {
    for (const kv of updateHeader.split(',')) {
      const [key, value] = kv.split('=')
      headers.set(key, value)
    }
  }

  return NextResponse.next({
    request: {
      headers,
    },
  })
}
