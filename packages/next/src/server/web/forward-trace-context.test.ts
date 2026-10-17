import {
  forwardTraceContextToRequest,
  getSharedParentTraceContext,
} from './forward-trace-context'
import { NextResponse } from './spec-extension/response'

const TRACEPARENT = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'
const TRACESTATE = 'vendor=value'
const RECEIVED_TRACEPARENT =
  '00-11111111111111111111111111111111-2222222222222222-01'

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

describe('getSharedParentTraceContext', () => {
  it('uses the received trace headers verbatim when they are the active context', () => {
    const received = new Headers({
      traceparent: RECEIVED_TRACEPARENT,
      // Not normalized by the propagator.
      tracestate: 'a=1 ,b=2',
    })
    expect(
      getSharedParentTraceContext(received, {
        traceparent: RECEIVED_TRACEPARENT,
        tracestate: 'a=1,b=2',
      })
    ).toEqual({ traceparent: RECEIVED_TRACEPARENT, tracestate: 'a=1 ,b=2' })
  })

  it('uses the active context when the request carries none', () => {
    expect(
      getSharedParentTraceContext(new Headers(), {
        traceparent: TRACEPARENT,
        tracestate: TRACESTATE,
      })
    ).toEqual({ traceparent: TRACEPARENT, tracestate: TRACESTATE })
  })

  it('uses the active context when the received traceparent is not the active parent', () => {
    // e.g. a malformed traceparent the propagator couldn't extract.
    const received = new Headers({ traceparent: 'invalid' })
    expect(
      getSharedParentTraceContext(received, { traceparent: TRACEPARENT })
    ).toEqual({ traceparent: TRACEPARENT })
  })

  it('returns undefined without an active context', () => {
    expect(
      getSharedParentTraceContext(
        new Headers({ traceparent: RECEIVED_TRACEPARENT }),
        undefined
      )
    ).toBeUndefined()
  })
})

describe('forwardTraceContextToRequest', () => {
  const requestHeaders = () =>
    new Headers({ accept: 'text/html', cookie: 'a=b', 'x-custom': 'custom' })

  it('adds nothing when the request already carries the trace context', () => {
    const received = requestHeaders()
    received.set('traceparent', RECEIVED_TRACEPARENT)
    received.set('tracestate', 'received=1')
    const response = NextResponse.next()
    forwardTraceContextToRequest(response.headers, received, {
      traceparent: RECEIVED_TRACEPARENT,
      tracestate: 'received=1',
    })

    expect([...response.headers.keys()]).toEqual(['x-middleware-next'])
  })

  it('lists every request header plus the trace context when the request carries none', () => {
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

  it('replaces a received traceparent that is not the shared parent', () => {
    const received = requestHeaders()
    received.set('traceparent', 'invalid')
    const response = NextResponse.next()
    forwardTraceContextToRequest(response.headers, received, {
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

  it('appends the trace context to user overrides that omit it', () => {
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

  it('keeps the received trace context in user overrides that omit it', () => {
    const received = requestHeaders()
    received.set('traceparent', RECEIVED_TRACEPARENT)
    const userHeaders = new Headers({ 'x-user': 'user' })
    const response = NextResponse.next({ request: { headers: userHeaders } })
    forwardTraceContextToRequest(response.headers, received, {
      traceparent: RECEIVED_TRACEPARENT,
    })

    expect(requestOverrides(response.headers)).toEqual({
      'x-user': 'user',
      traceparent: RECEIVED_TRACEPARENT,
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

  it('keeps trace context headers copied unchanged into user overrides', () => {
    const received = requestHeaders()
    received.set('traceparent', RECEIVED_TRACEPARENT)
    received.set('tracestate', 'received=1')
    // The common `new Headers(request.headers)` pattern copies the received
    // trace context into the overrides.
    const userHeaders = new Headers(received)
    userHeaders.set('x-user', 'user')
    const response = NextResponse.next({ request: { headers: userHeaders } })
    forwardTraceContextToRequest(response.headers, received, {
      traceparent: RECEIVED_TRACEPARENT,
      tracestate: 'received=1',
    })

    const overrides = requestOverrides(response.headers)!
    expect(overrides.traceparent).toBe(RECEIVED_TRACEPARENT)
    expect(overrides.tracestate).toBe('received=1')
    expect(overrides['x-user']).toBe('user')
    expect(
      response.headers
        .get('x-middleware-override-headers')!
        .split(',')
        .filter((key) => key === 'traceparent' || key === 'tracestate')
    ).toEqual(['traceparent', 'tracestate'])
  })

  it('adds the trace context to copied user overrides when the request carries none', () => {
    const userHeaders = new Headers(requestHeaders())
    userHeaders.set('x-user', 'user')
    const response = NextResponse.next({ request: { headers: userHeaders } })
    forwardTraceContextToRequest(response.headers, requestHeaders(), {
      traceparent: TRACEPARENT,
    })

    expect(requestOverrides(response.headers)).toEqual({
      accept: 'text/html',
      cookie: 'a=b',
      'x-custom': 'custom',
      'x-user': 'user',
      traceparent: TRACEPARENT,
    })
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
