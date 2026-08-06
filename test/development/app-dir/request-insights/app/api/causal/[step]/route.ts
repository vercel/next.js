import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

const CAUSAL_COOKIE = '__next_request_insights_causal='
const dedupeRequestCounts = new Map<string, number>()

export async function GET(
  request: Request,
  { params }: { params: Promise<{ step: string }> }
) {
  const { step } = await params
  if (step === 'redirect') {
    const destination = new URL(request.url).searchParams.get('to')
    return destination
      ? NextResponse.redirect(destination)
      : new Response(null, { status: 400 })
  }

  const causalCookieVisible = (request.headers.get('cookie') ?? '')
    .split(';')
    .some((cookie) => cookie.trim().startsWith(CAUSAL_COOKIE))

  if (step === 'one') {
    const dedupeKey = new URL(request.url).searchParams.get('dedupe')
    const requestCount = dedupeKey
      ? (dedupeRequestCounts.get(dedupeKey) ?? 0) + 1
      : undefined
    if (dedupeKey && requestCount !== undefined) {
      dedupeRequestCounts.set(dedupeKey, requestCount)
    }
    const requestHeaders = await headers()
    const target = new URL(
      '/api/causal/two',
      `${requestHeaders.get('x-forwarded-proto') ?? 'http'}://${requestHeaders.get('host')}`
    )
    const response = await fetch(target, {
      cache: 'no-store',
    })
    return Response.json({
      causalCookieVisible,
      nested: await response.json(),
      requestCount,
    })
  }

  return Response.json({ causalCookieVisible, step })
}
