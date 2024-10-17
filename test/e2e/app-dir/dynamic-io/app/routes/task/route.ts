import type { NextRequest } from 'next/server'

import { getSentinelValue } from '../../getSentinelValue'

export async function GET(request: NextRequest) {
  await new Promise((r) => setTimeout(r, 10))
  const response = JSON.stringify({
    value: getSentinelValue(),
    message: 'task',
  })
  return new Response(response)
}
