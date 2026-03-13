import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export default function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/home') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // `__filename` included in the bundle makes the NFT to trace it.
  // This will result creating "proxy.js" to be traced into the NFT file.
  // However, as Next.js renames "proxy.js" to "middleware.js" during build,
  // the files in NFT will differ from the actual outputs, which will fail for
  // the providers like Vercel that checks for the files in NFT.
  console.log(__filename)

  return NextResponse.next()
}
