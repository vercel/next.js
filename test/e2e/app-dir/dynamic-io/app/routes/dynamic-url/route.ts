import type { NextRequest } from 'next/server'

import { getSentinelValue } from '../../getSentinelValue'

export async function GET(request: NextRequest, { params }: { params: {} }) {
  const search = request.nextUrl.search
  return new Response(
    JSON.stringify({
      value: getSentinelValue(),
      search,
    })
  )
}
