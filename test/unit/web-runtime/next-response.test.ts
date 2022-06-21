/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { NextResponse } from 'next/server/web/spec-extension/response'

it('can be cloned', async () => {
  const fetchResponse = await fetch('https://example.vercel.sh')
  const newResponse = new NextResponse(fetchResponse.body, fetchResponse)
  expect(await newResponse.text()).toContain('Example Domain')
  expect(Object.fromEntries(newResponse.headers)).toMatchObject({
    server: 'Vercel',
  })
})

it('can return JSON', async () => {
  const response = NextResponse.json({ hello: 'world' })
  expect(await response.json()).toEqual({ hello: 'world' })
})
