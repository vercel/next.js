import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const res = await fetch(`${origin}/api/endpoint`);
  const json = await res.json();
  return NextResponse.json(json);
}

export const config = {
  matcher: '/fetch-endpoint',
}
