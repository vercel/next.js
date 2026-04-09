import type { NextRequest } from 'next/server'

import { getSentinelValue } from '../../getSentinelValue'

export async function generateStaticParams() {
  return [
    {
      dyn: '1',
    },
  ]
}

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
