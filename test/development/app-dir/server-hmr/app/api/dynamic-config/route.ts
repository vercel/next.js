import type { NextRequest } from 'next/server'

export const dynamic = 'force-static'

export async function GET(req: NextRequest) {
  return Response.json({ search: req.nextUrl.search })
}
