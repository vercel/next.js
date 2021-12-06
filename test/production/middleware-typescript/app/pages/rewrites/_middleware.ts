import { NextMiddleware, NextResponse } from 'next/server'

export const middleware: NextMiddleware = async function (request) {
  const url = request.nextUrl

  if (url.pathname === '/') {
    let bucket = request.cookies.bucket
    if (!bucket) {
      bucket = Math.random() >= 0.5 ? 'a' : 'b'
      const response = NextResponse.rewrite(`/rewrites/${bucket}`)
      response.cookie('bucket', bucket, { maxAge: 10000 })
      return response
    }

    return NextResponse.rewrite(`/rewrites/${bucket}`)
  }

  return null
}
