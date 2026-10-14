import { forwardTraceContextToRequest } from './forward-trace-context'
import { NextResponse } from './spec-extension/response'

const TRACEPARENT = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'
const TRACESTATE = 'vendor=value'

function requestOverrides(headers: Headers) {
  const list = headers.get('x-middleware-override-headers')
  if (list === null) return undefined
  return Object.fromEntries(
    list
      .split(',')
      .filter(Boolean)
      .map((key) => [key, headers.get(`x-middleware-request-${key}`)])
  )
}

describe('forwardTraceContextToRequest', () => {
  const requestHeaders = () =>
    new Headers({ accept: 'text/html', cookie: 'a=b', 'x-custom': 'custom' })

  it('lists every request header plus the trace context without user overrides', () => {
    const response = NextResponse.next()
    forwardTraceContextToRequest(response.headers, requestHeaders(), {
      traceparent: TRACEPARENT,
      tracestate: TRACESTATE,
    })

    expect(requestOverrides(response.headers)).toEqual({
      accept: 'text/html',
      cookie: 'a=b',
      'x-custom': 'custom',
      traceparent: TRACEPARENT,
      tracestate: TRACESTATE,
    })
  })

  it('replaces a traceparent the middleware received when there are no user overrides', () => {
    const headers = requestHeaders()
    headers.set(
      'traceparent',
      '00-11111111111111111111111111111111-2222222222222222-01'
    )
    const response = NextResponse.next()
    forwardTraceContextToRequest(response.headers, headers, {
      traceparent: TRACEPARENT,
    })

    const overrides = requestOverrides(response.headers)!
    expect(overrides.traceparent).toBe(TRACEPARENT)
    expect(
      response.headers
        .get('x-middleware-override-headers')!
        .split(',')
        .filter((key) => key === 'traceparent')
    ).toHaveLength(1)
  })

  it('works for rewrites', () => {
    const response = NextResponse.rewrite(new URL('https://example.com/other'))
    forwardTraceContextToRequest(response.headers, requestHeaders(), {
      traceparent: TRACEPARENT,
    })

    expect(requestOverrides(response.headers)?.traceparent).toBe(TRACEPARENT)
  })

  it('only appends the trace context to existing user overrides', () => {
    const userHeaders = new Headers({ 'x-user': 'user' })
    const response = NextResponse.next({ request: { headers: userHeaders } })
    forwardTraceContextToRequest(response.headers, requestHeaders(), {
      traceparent: TRACEPARENT,
      tracestate: TRACESTATE,
    })

    expect(requestOverrides(response.headers)).toEqual({
      'x-user': 'user',
      traceparent: TRACEPARENT,
      tracestate: TRACESTATE,
    })
  })

  it('keeps a traceparent explicitly set by the user', () => {
    const userTraceparent =
      '00-33333333333333333333333333333333-4444444444444444-01'
    const response = NextResponse.next({
      request: { headers: new Headers({ traceparent: userTraceparent }) },
    })
    forwardTraceContextToRequest(response.headers, requestHeaders(), {
      traceparent: TRACEPARENT,
      tracestate: TRACESTATE,
    })

    expect(requestOverrides(response.headers)).toEqual({
      traceparent: userTraceparent,
      tracestate: TRACESTATE,
    })
  })

  it('replaces trace context headers copied unchanged into user overrides', () => {
    const receivedTraceparent =
      '00-11111111111111111111111111111111-2222222222222222-01'
    const received = requestHeaders()
    received.set('traceparent', receivedTraceparent)
    received.set('tracestate', 'received=1')
    // The common `new Headers(request.headers)` pattern copies the received
    // trace context into the overrides without choosing it.
    const userHeaders = new Headers(received)
    userHeaders.set('x-user', 'user')
    const response = NextResponse.next({ request: { headers: userHeaders } })
    forwardTraceContextToRequest(response.headers, received, {
      traceparent: TRACEPARENT,
      tracestate: TRACESTATE,
    })

    const overrides = requestOverrides(response.headers)!
    expect(overrides.traceparent).toBe(TRACEPARENT)
    expect(overrides.tracestate).toBe(TRACESTATE)
    expect(overrides['x-user']).toBe('user')
    expect(
      response.headers
        .get('x-middleware-override-headers')!
        .split(',')
        .filter((key) => key === 'traceparent' || key === 'tracestate')
    ).toEqual(['traceparent', 'tracestate'])
  })

  it('treats an empty user override list like no overrides', () => {
    const response = NextResponse.next({ request: { headers: new Headers() } })
    expect(response.headers.get('x-middleware-override-headers')).toBe('')
    forwardTraceContextToRequest(response.headers, requestHeaders(), {
      traceparent: TRACEPARENT,
    })

    expect(requestOverrides(response.headers)).toEqual({
      accept: 'text/html',
      cookie: 'a=b',
      'x-custom': 'custom',
      traceparent: TRACEPARENT,
    })
  })

  it('does nothing without a trace context', () => {
    const response = NextResponse.next()
    forwardTraceContextToRequest(response.headers, requestHeaders(), undefined)

    expect(requestOverrides(response.headers)).toBeUndefined()
    expect([...response.headers.keys()]).toEqual(['x-middleware-next'])
  })

  it.each([
    ['a redirect', () => NextResponse.redirect('https://example.com/')],
    ['a direct response', () => new NextResponse('hello')],
  ])('does nothing for %s', (_, createResponse) => {
    const response = createResponse()
    const before = [...response.headers.entries()]
    forwardTraceContextToRequest(response.headers, requestHeaders(), {
      traceparent: TRACEPARENT,
    })

    expect([...response.headers.entries()]).toEqual(before)
  })
})
