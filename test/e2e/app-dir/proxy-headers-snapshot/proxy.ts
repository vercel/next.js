import { headers } from 'next/headers'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

const HEADER_NAME = 'x-added-after-headers-call'

export async function proxy(request: NextRequest) {
  const firstHeadersView = await headers()
  const valueBeforeMutation = firstHeadersView.get(HEADER_NAME)

  request.headers.set(HEADER_NAME, 'set-on-next-request')

  const secondHeadersView = await headers()

  return NextResponse.json({
    valueBeforeMutation,
    valueOnNextRequest: request.headers.get(HEADER_NAME),
    valueFromFirstViewAfterMutation: firstHeadersView.get(HEADER_NAME),
    valueFromSecondViewAfterMutation: secondHeadersView.get(HEADER_NAME),
    sameHeadersObject: firstHeadersView === secondHeadersView,
  })
}
