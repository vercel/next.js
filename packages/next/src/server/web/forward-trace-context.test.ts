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
})
