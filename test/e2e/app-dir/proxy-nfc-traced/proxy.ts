import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export default function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/home') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // `__filename` included in the bundle makes the NFT to trace it.
  // As the build outputs the bundle as "middleware.js", the NFT file has to
  // list it under that name. Otherwise it will fail for the providers like
  // Vercel that checks for the files in NFT.
  console.log(__filename)

  return NextResponse.next()
}
