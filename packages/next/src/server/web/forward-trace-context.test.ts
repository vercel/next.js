import {
  continuesToSameOrigin,
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

  it('keeps the tracestate key when the received trace headers have none', () => {
    const received = new Headers({ traceparent: RECEIVED_TRACEPARENT })
    expect(
      getSharedParentTraceContext(received, {
        traceparent: RECEIVED_TRACEPARENT,
        tracestate: undefined,
      })
    ).toStrictEqual({
      traceparent: RECEIVED_TRACEPARENT,
      tracestate: undefined,
    })
  })

  it('uses the active context when the request carries none', () => {
    expect(
      getSharedParentTraceContext(new Headers(), {
        traceparent: TRACEPARENT,
        tracestate: TRACESTATE,
      })
    ).toEqual({ traceparent: TRACEPARENT, tracestate: TRACESTATE })
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

  it('drops a received tracestate when the trace context has none', () => {
    const received = requestHeaders()
    received.set('tracestate', 'received=1')
    const response = NextResponse.next()
    forwardTraceContextToRequest(response.headers, received, {
      traceparent: TRACEPARENT,
    })

    expect(requestOverrides(response.headers)).toEqual({
      accept: 'text/html',
      cookie: 'a=b',
      'x-custom': 'custom',
      traceparent: TRACEPARENT,
    })
  })

  it('drops a tracestate copied into user overrides when the trace context has none', () => {
    const received = requestHeaders()
    received.set('traceparent', RECEIVED_TRACEPARENT)
    received.set('tracestate', 'received=1')
    const response = NextResponse.next({
      request: { headers: new Headers(received) },
    })
    forwardTraceContextToRequest(response.headers, received, {
      traceparent: TRACEPARENT,
    })

    expect(requestOverrides(response.headers)).toEqual({
      accept: 'text/html',
      cookie: 'a=b',
      'x-custom': 'custom',
      traceparent: TRACEPARENT,
    })
  })

  it('replaces a tracestate set by the user when the traceparent is forwarded', () => {
    const response = NextResponse.next({
      request: { headers: new Headers({ tracestate: 'user=1' }) },
    })
    forwardTraceContextToRequest(response.headers, requestHeaders(), {
      traceparent: TRACEPARENT,
      tracestate: TRACESTATE,
    })

    expect(requestOverrides(response.headers)).toEqual({
      traceparent: TRACEPARENT,
      tracestate: TRACESTATE,
    })
  })

  it('keeps a traceparent explicitly set by the user without a forwarded tracestate', () => {
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
    })
  })

  it('keeps the trace headers explicitly set by the user', () => {
    const userTraceparent =
      '00-33333333333333333333333333333333-4444444444444444-01'
    const received = requestHeaders()
    received.set('tracestate', 'received=1')
    const response = NextResponse.next({
      request: {
        headers: new Headers({
          traceparent: userTraceparent,
          tracestate: 'user=1',
        }),
      },
    })
    forwardTraceContextToRequest(response.headers, received, {
      traceparent: TRACEPARENT,
      tracestate: TRACESTATE,
    })

    expect(requestOverrides(response.headers)).toEqual({
      traceparent: userTraceparent,
      tracestate: 'user=1',
    })
  })

  it('returns whether the downstream request carries the trace context', () => {
    const traceContext = { traceparent: TRACEPARENT, tracestate: TRACESTATE }
    const forward = (response: NextResponse) =>
      forwardTraceContextToRequest(
        response.headers,
        requestHeaders(),
        traceContext
      )
    expect(forward(NextResponse.next())).toBe(true)
    expect(forward(NextResponse.rewrite('https://example.com/page'))).toBe(true)
    // No downstream request.
    expect(forward(NextResponse.redirect('https://example.com/page'))).toBe(
      false
    )
    expect(forward(new NextResponse('direct'))).toBe(false)
    // The render continues the trace context the user set.
    expect(
      forward(
        NextResponse.next({
          request: {
            headers: new Headers({
              traceparent:
                '00-33333333333333333333333333333333-4444444444444444-01',
            }),
          },
        })
      )
    ).toBe(false)
    expect(
      forwardTraceContextToRequest(
        NextResponse.next().headers,
        requestHeaders(),
        undefined
      )
    ).toBe(false)
  })
})

describe('continuesToSameOrigin', () => {
  const url = new URL('https://app.example.com/a')
  it.each([
    ['NextResponse.next()', NextResponse.next(), true],
    [
      'a rewrite to the same origin',
      NextResponse.rewrite('https://app.example.com/b'),
      true,
    ],
    [
      'a rewrite to another origin',
      NextResponse.rewrite('https://other.example.com/b'),
      false,
    ],
    ['a redirect', NextResponse.redirect('https://app.example.com/b'), false],
    ['a direct response', new NextResponse('direct'), false],
  ])('%s', (_, response, expected) => {
    expect(continuesToSameOrigin(response.headers, url)).toBe(expected)
  })

  it('is false for an invalid rewrite', () => {
    const headers = new Headers({ 'x-middleware-rewrite': 'http://[' })
    expect(continuesToSameOrigin(headers, url)).toBe(false)
  })
})
