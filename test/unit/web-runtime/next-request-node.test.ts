// this file must not use the edge-runtime env setup
// so that we test node runtime properly
import { expectTypeOf } from 'expect-type'
import { NextRequest } from 'next/dist/server/web/spec-extension/request'

it('should have 1 required parameter for constructor', () => {
  expect(NextRequest.length).toBe(1)
})

it('should allow the 2nd parameter to be undefined', () => {
  const request = new NextRequest('https://vercel.com')
  expectTypeOf(request).toMatchTypeOf<NextRequest>()

  expect(new NextRequest('https://vercel.com')).toHaveProperty(
    'nextUrl.pathname',
    '/'
  )
})

it('should clone Request with headers', () => {
  const request = new Request('https://example.com', {
    headers: { 'x-foo': 'bar' },
  })

  const nextRequest = new NextRequest(request)

  expect(Object.fromEntries(nextRequest.headers)).toEqual(
    Object.fromEntries(request.headers)
  )

  // Second argument should override headers
  const headers = new Headers({ 'x-header': 'some header' })
  const nextRequest2 = new NextRequest(request, { headers })

  expect(Object.fromEntries(nextRequest2.headers)).toEqual(
    Object.fromEntries(headers)
  )
})

it('should handle Request with body', () => {
  let nextRequest = new NextRequest('https://example.com', {
    body: new ReadableStream(),
    method: 'POST',
  })
  expect(nextRequest.body).toBeTruthy()
  expect(nextRequest.method).toBe('POST')

  const request = new Request('https://example.com', {
    body: new ReadableStream(),
    method: 'POST',
    // @ts-expect-error this exists but not in type
    duplex: 'half',
  })

  nextRequest = new NextRequest(request)

  expect(nextRequest.body).toBeTruthy()
  expect(nextRequest.method).toBe('POST')
})
