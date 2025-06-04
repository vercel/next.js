/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { NextResponse } from 'next/dist/server/web/spec-extension/response'

it('reflect .set into `set-cookie`', async () => {
  const response = new NextResponse()
  expect(response.cookies.get('foo')?.value).toBe(undefined)
  expect(response.cookies.get('foo')).toEqual(undefined)

  response.cookies
    .set('foo', 'bar', { path: '/test' })
    .set('fooz', 'barz', { path: '/test2' })

  expect(response.cookies.get('foo')?.value).toBe('bar')
  expect(response.cookies.get('fooz')?.value).toBe('barz')

  expect(response.cookies.get('foo')).toEqual({
    name: 'foo',
    path: '/test',
    value: 'bar',
  })
  expect(response.cookies.get('fooz')).toEqual({
    name: 'fooz',
    path: '/test2',
    value: 'barz',
  })

  expect(response.headers.get('set-cookie')).toBe(
    'foo=bar; Path=/test, fooz=barz; Path=/test2'
  )
  expect(
    Array.from(response.headers.entries()).filter((entry) => {
      return entry[0] === 'set-cookie'
    })
  ).toEqual([
    ['set-cookie', 'foo=bar; Path=/test'],
    ['set-cookie', 'fooz=barz; Path=/test2'],
  ])
})

it('reflect .delete into `set-cookie`', async () => {
  const { NextResponse } = await import(
    'next/dist/server/web/spec-extension/response'
  )

  const response = new NextResponse()

  response.cookies.set('foo', 'bar')
  expect(Object.fromEntries(response.headers.entries())['set-cookie']).toBe(
    'foo=bar; Path=/'
  )

  expect(response.cookies.get('foo')?.value).toBe('bar')
  expect(response.cookies.get('foo')).toEqual({
    name: 'foo',
    path: '/',
    value: 'bar',
  })

  response.cookies.set('fooz', 'barz')
  expect(response.headers.get('set-cookie')).toBe(
    'foo=bar; Path=/, fooz=barz; Path=/'
  )
  expect(
    Array.from(response.headers.entries()).filter((entry) => {
      return entry[0] === 'set-cookie'
    })
  ).toEqual([
    ['set-cookie', 'foo=bar; Path=/'],
    ['set-cookie', 'fooz=barz; Path=/'],
  ])

  expect(response.cookies.get('fooz')?.value).toBe('barz')
  expect(response.cookies.get('fooz')).toEqual({
    name: 'fooz',
    path: '/',
    value: 'barz',
  })

  response.cookies.delete('foo')
  expect(response.headers.get('set-cookie')).toBe(
    'foo=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT, fooz=barz; Path=/'
  )

  expect(response.cookies.get('foo')?.value).toBe('')
  expect(response.cookies.get('foo')).toEqual({
    expires: new Date(0),
    name: 'foo',
    value: '',
    path: '/',
  })

  response.cookies.delete('fooz')

  expect(response.headers.get('set-cookie')).toBe(
    'foo=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT, fooz=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  )

  expect(response.cookies.get('fooz')?.value).toBe('')
  expect(response.cookies.get('fooz')).toEqual({
    expires: new Date(0),
    name: 'fooz',
    value: '',
    path: '/',
  })
})

it('response.cookie does not modify options', async () => {
  const { NextResponse } = await import(
    'next/dist/server/web/spec-extension/response'
  )

  const options = { maxAge: 10000 }
  const response = new NextResponse(null, {
    headers: { 'content-type': 'application/json' },
  })
  response.cookies.set('cookieName', 'cookieValue', options)
  expect(options).toEqual({ maxAge: 10000 })
})
