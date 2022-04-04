import { NextResponse } from 'next/server'

export async function middleware(request) {
  const response = NextResponse.next()
  response.headers.set('req-url-basepath', request.nextUrl.basePath)
  response.headers.set('req-url-pathname', request.nextUrl.pathname)
  response.headers.set(
    'req-url-query',
    JSON.stringify(Object.fromEntries(request.nextUrl.searchParams.entries()))
  )
  response.headers.set('req-url-locale', request.nextUrl.locale)
  if (request.page.name) {
    response.headers.set('req-url-page', request.page.name)
  }
  if (request.page.params) {
    response.headers.set('req-url-params', JSON.stringify(request.page.params))
  }
  return response
}
