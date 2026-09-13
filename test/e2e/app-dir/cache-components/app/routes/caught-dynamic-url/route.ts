import type { NextRequest } from 'next/server'

import { getSentinelValue } from '../../getSentinelValue'

export async function GET(request: NextRequest) {
  let search = ''

  try {
    search = request.nextUrl.search
  } catch {
    console.log('caught dynamic URL access')
  }

  return new Response(
    JSON.stringify({
      value: getSentinelValue(),
      search,
    })
  )
}
