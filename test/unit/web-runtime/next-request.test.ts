/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { NextRequest } from 'next/src/server/web/spec-extension/request'

describe('NextRequest', () => {
  const urlStr = 'http://localhost:3000/'
  const url = new URL(urlStr)
  const body = JSON.stringify('test')
  const requestInstance = new Request(urlStr, {
    method: 'POST',
    body,
  })

  const cases: readonly [RequestInfo | URL, RequestInit][] = [
    [requestInstance, {}],
    [url, { method: 'POST', body }],
    [urlStr, { method: 'POST', body }],
  ]

  it.each(cases)('creates request from %o', async (input, init) => {
    const actual = new NextRequest(input, init)

    expect(actual.method).toBe('POST')
    expect(actual.url).toBe(urlStr)
    expect(await actual.json()).toBe('test')
  })

  it('throws if provider url is invalid', () => {
    const wrongUrl = 'wrong_url'
    expect(() => new NextRequest(wrongUrl)).toThrow(
      new Error(
        `URL is malformed "${wrongUrl}". Please use only absolute URLs - https://nextjs.org/docs/messages/middleware-relative-urls`,
        { cause: expect.any(Error) }
      )
    )
  })
})
