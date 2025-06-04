import type { NextRequest } from 'next/server'

import { cookies } from 'next/headers'

import { getSentinelValue } from '../../getSentinelValue'

export async function GET(request: NextRequest) {
  const sentinel = (await cookies()).get('x-sentinel')
  return new Response(
    JSON.stringify({
      value: getSentinelValue(),
      type: 'cookies',
      'x-sentinel': sentinel,
    })
  )
}
