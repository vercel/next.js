import type { NextRequest } from 'next/server'

import { getSentinelValue } from '../../../../getSentinelValue'

export const runtime = 'edge'

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ dyn: string }> }
) {
  const { dyn } = await props.params
  return new Response(
    JSON.stringify({
      value: getSentinelValue(),
      type: 'dynamic params',
      param: dyn,
    })
  )
}
