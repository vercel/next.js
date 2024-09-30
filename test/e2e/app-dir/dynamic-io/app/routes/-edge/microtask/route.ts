import type { NextRequest } from 'next/server'

import { getSentinelValue } from '../../../getSentinelValue'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  await Promise.resolve()
  const response = JSON.stringify({
    value: getSentinelValue(),
    message: 'microtask',
  })
  return new Response(response)
}
