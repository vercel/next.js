/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { expectTypeOf } from 'expect-type'
import { NextRequest } from 'next/src/server/web/spec-extension/request'

it('should have 1 required parameter for constructor', () => {
  expect(NextRequest.length).toBe(1)
})

it('should allow the 2nd parameter to be undefined', () => {
  const request = new NextRequest('https://vercel.com')
  expectTypeOf(request).toMatchTypeOf<NextRequest>()

  expect(
    new NextRequest('https://vercel.com', { geo: { city: 'Mars' } })
  ).toHaveProperty('geo.city', 'Mars')
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
