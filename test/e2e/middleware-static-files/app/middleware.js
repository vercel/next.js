import { NextResponse } from 'next/server'

export const config = {
  matcher: [
    '/file.svg',
    '/vercel copy.svg',
    '/another/file.svg',
    '/another/hello',
    '/dynamic/:path*',
    '/glob/:path*',
    '/pages-another/hello',
    '/pages-dynamic/:path*',
    '/pages-glob/:path*',
    '/_next/static/css/:path*',
  ],
}

export default function middleware() {
  return NextResponse.json({ middleware: true })
}
