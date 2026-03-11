import { NextResponse } from 'next/server'

export function proxy(req: Request) {
  return NextResponse.rewrite(new URL('/', req.url))
}
