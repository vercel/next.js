import { strict as assert } from 'node:assert'
import { NEXT_RSC_UNION_QUERY } from 'next/dist/client/components/app-router-headers'

export function GET(request) {
  assert(request.nextUrl.searchParams.get(NEXT_RSC_UNION_QUERY) === null)
  return new Response('no rsc query route')
}
