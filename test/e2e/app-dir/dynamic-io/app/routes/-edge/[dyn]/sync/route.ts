import type { NextRequest, UnsafeUnwrappedParams } from 'next/server'

import { getSentinelValue } from '../../../../getSentinelValue'

export const runtime = 'edge'

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ dyn: string }> }
) {
  const dyn = (
    props.params as unknown as UnsafeUnwrappedParams<typeof props.params>
  ).dyn
  return new Response(
    JSON.stringify({
      value: getSentinelValue(),
      type: 'dynamic params',
      param: dyn,
    })
  )
}
