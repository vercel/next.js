import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'

describe('Middleware fetches with any HTTP method', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/api/ping.js': `
          export default (req, res) => {
            res.send(JSON.stringify({
              method: req.method,
              headers: {...req.headers},
            }))
          }
        `,
        'middleware.js': `
          import { NextResponse } from 'next/server';

          const HTTP_ECHO_URL = 'https://http-echo-kou029w.vercel.app/';

          export default async (req) => {
            const kind = req.nextUrl.searchParams.get('kind')
            const handler = handlers[kind] ?? handlers['normal-fetch'];

            const response = await handler({url: HTTP_ECHO_URL, method: req.method});
            const json = await response.text()

            const res = NextResponse.next();
            res.headers.set('x-resolved', json ?? '{}');
            return res
          }

          const handlers = {
            'new-request': ({url, method}) =>
              fetch(new Request(url, { method, headers: { 'x-kind': 'new-request' } })),

            'normal-fetch': ({url, method}) =>
              fetch(url, { method, headers: { 'x-kind': 'normal-fetch' } })
          }
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('passes the method on a direct fetch request', async () => {
    const response = await fetchViaHTTP(
      next.url,
      '/api/ping',
      {},
      { method: 'POST' }
    )
    const json = await response.json()
    expect(json).toMatchObject({
      method: 'POST',
    })

    const headerJson = JSON.parse(response.headers.get('x-resolved'))
    expect(headerJson).toMatchObject({
      method: 'POST',
      headers: {
        'x-kind': 'normal-fetch',
      },
    })
  })

  it('passes the method when providing a Request object', async () => {
    const response = await fetchViaHTTP(
      next.url,
      '/api/ping',
      { kind: 'new-request' },
      { method: 'POST' }
    )
    const json = await response.json()
    expect(json).toMatchObject({
      method: 'POST',
    })

    const headerJson = JSON.parse(response.headers.get('x-resolved'))
    expect(headerJson).toMatchObject({
      method: 'POST',
      headers: {
        'x-kind': 'new-request',
      },
    })
  })
})
