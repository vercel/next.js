import { headers } from 'next/headers'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

const ADDED_HEADER = 'x-added-during-proxy'
const INTERNAL_HEADER = 'x-nextjs-request-id'

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname !== '/probe') {
    return NextResponse.next()
  }

  const firstView = await headers()
  const valueBeforeMutation = firstView.get(ADDED_HEADER)

  request.headers.set(ADDED_HEADER, 'set-during-proxy')
  request.headers.set(INTERNAL_HEADER, 'set-during-proxy')

  const secondView = await headers()

  return NextResponse.json({
    valueBeforeMutation,
    valueOnRequest: request.headers.get(ADDED_HEADER),
    valueOnFirstView: firstView.get(ADDED_HEADER),
    valueOnSecondView: secondView.get(ADDED_HEADER),
    sameView: firstView === secondView,
    internalHeaderOnRequest: request.headers.get(INTERNAL_HEADER),
    internalHeaderOnView: secondView.get(INTERNAL_HEADER),
    internalHeaderIsIterated: [...secondView.keys()].includes(INTERNAL_HEADER),
  })
}
