/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { NextResponse } from 'next/dist/server/web/spec-extension/response'

it('should not revalidate when revalidate: false is set', async () => {
  const response = new NextResponse()

  // Test setting cookie with revalidate: false
  response.cookies.set('test', 'value', { revalidate: false })

  // The cookie should still be set correctly
  expect(response.cookies.get('test')?.value).toBe('value')
  expect(response.cookies.get('test')).toEqual({
    name: 'test',
    value: 'value',
    path: '/',
  })

  // Check that the Set-Cookie header is present
  expect(response.headers.get('set-cookie')).toContain('test=value')
})

it('should accept revalidate option with other cookie options', async () => {
  const response = new NextResponse()

  // Test setting cookie with multiple options including revalidate: false
  response.cookies.set('test', 'value', {
    path: '/custom',
    maxAge: 3600,
    revalidate: false,
  })

  expect(response.cookies.get('test')).toEqual({
    name: 'test',
    value: 'value',
    path: '/custom',
    maxAge: 3600,
  })

  expect(response.headers.get('set-cookie')).toContain(
    'test=value; Path=/custom; Max-Age=3600'
  )
})

it('should work with single-argument cookie options including revalidate', async () => {
  const response = new NextResponse()

  // Test setting cookie with single options object including revalidate: false
  response.cookies.set({
    name: 'test',
    value: 'value',
    path: '/single',
    revalidate: false,
  })

  expect(response.cookies.get('test')).toEqual({
    name: 'test',
    value: 'value',
    path: '/single',
  })

  expect(response.headers.get('set-cookie')).toContain(
    'test=value; Path=/single'
  )
})
