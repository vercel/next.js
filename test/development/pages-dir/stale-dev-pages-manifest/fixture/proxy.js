import { access } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'

const PUBLIC_ROUTE = '/docs/example'
const REWRITTEN_ROUTE = '/docs/_handlers/example'
const GENERATED_HANDLER_PATH = path.join(
  process.cwd(),
  'pages',
  'docs',
  '_handlers',
  'example.js'
)

async function doesGeneratedHandlerExist() {
  try {
    await access(GENERATED_HANDLER_PATH)
    return true
  } catch {
    return false
  }
}

export async function proxy(request) {
  const { pathname } = request.nextUrl

  if (pathname === REWRITTEN_ROUTE) {
    return NextResponse.next()
  }

  if (pathname !== PUBLIC_ROUTE) {
    return NextResponse.next()
  }

  // Only rewrite once the handler page has actually been materialized.
  if (!(await doesGeneratedHandlerExist())) {
    return NextResponse.next()
  }

  const rewriteUrl = request.nextUrl.clone()
  rewriteUrl.pathname = REWRITTEN_ROUTE

  return NextResponse.rewrite(rewriteUrl)
}

export const config = {
  matcher: ['/docs/:path*'],
}
