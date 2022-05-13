import { NextMiddleware, NextResponse } from 'next/server'

export const middleware: NextMiddleware = async function (request) {
  const url = request.nextUrl

  if (url.pathname === '/') {
    let bucket = request.cookies.get('bucket')
    if (!bucket) {
      bucket = Math.random() >= 0.5 ? 'a' : 'b'
      const response = NextResponse.rewrite(`/rewrites/${bucket}`)
      response.cookies.set('bucket', bucket, { maxAge: 10 })
      return response
    } else {
      // check that `bucket` is type "string", not "any"
      bucket.toUpperCase()
    }

    return NextResponse.rewrite(`/rewrites/${bucket}`)
  }

  return null
}
