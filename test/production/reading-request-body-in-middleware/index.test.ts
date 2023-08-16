import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'

describe('reading request body in middleware', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'middleware.js': `
          const { NextResponse } = require('next/server');

          export default async function middleware(request) {
            if (!request.body) {
              return new Response(null, { status: 400 });
            }

            let json;

            if (!request.nextUrl.searchParams.has("no_reading")) {
              json = await request.json();
            }

            if (request.nextUrl.searchParams.has("next")) {
              const res = NextResponse.next();
              res.headers.set('x-from-root-middleware', '1');
              return res;
            }

            return new Response(null, {
              status: 200,
              headers: {
                data: JSON.stringify({ root: true, ...json }),
              },
            })
          }
        `,

        'pages/api/hi.js': `
          export default function hi(req, res) {
            res.json({
              ...req.body,
              api: true,
            })
          }
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('rejects with 400 for get requests', async () => {
    const response = await fetchViaHTTP(next.url, '/')
    expect(response.status).toEqual(400)
  })

  it('returns root: true for root calls', async () => {
    const response = await fetchViaHTTP(
      next.url,
      '/',
      {},
      {
        method: 'POST',
        body: JSON.stringify({
          foo: 'bar',
        }),
      }
    )
    expect(response.status).toEqual(200)
    expect(JSON.parse(response.headers.get('data'))).toEqual({
      foo: 'bar',
      root: true,
    })
  })

  it('passes the body to the api endpoint', async () => {
    const response = await fetchViaHTTP(
      next.url,
      '/api/hi',
      {
        next: '1',
      },
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          foo: 'bar',
        }),
      }
    )
    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({
      foo: 'bar',
      api: true,
    })
    expect(response.headers.get('x-from-root-middleware')).toEqual('1')
    expect(response.headers.has('data')).toBe(false)
  })

  it('passes the body greater than 64KiB to the api endpoint', async () => {
    const response = await fetchViaHTTP(
      next.url,
      '/api/hi',
      {
        next: '1',
      },
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          foo: 'bar'.repeat(22 * 1024),
        }),
      }
    )
    const data = await response.json()
    expect(response.status).toEqual(200)
    expect(data.foo.length).toBe(22 * 1024 * 3)
    expect(data.foo.split('bar').length).toBe(22 * 1024 + 1)
    expect(data.api).toBeTrue()
    expect(response.headers.get('x-from-root-middleware')).toEqual('1')
    expect(response.headers.has('data')).toBe(false)
  })

  it('passes the body to the api endpoint when no body is consumed on middleware', async () => {
    const response = await fetchViaHTTP(
      next.url,
      '/api/hi',
      {
        next: '1',
        no_reading: '1',
      },
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          foo: 'bar',
        }),
      }
    )
    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({
      foo: 'bar',
      api: true,
    })
    expect(response.headers.get('x-from-root-middleware')).toEqual('1')
    expect(response.headers.has('data')).toBe(false)
  })

  it('passes the body greater than 64KiB to the api endpoint when no body is consumed on middleware', async () => {
    const response = await fetchViaHTTP(
      next.url,
      '/api/hi',
      {
        next: '1',
        no_reading: '1',
      },
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          foo: 'bar'.repeat(22 * 1024),
        }),
      }
    )
    const data = await response.json()
    expect(response.status).toEqual(200)
    expect(data.foo.length).toBe(22 * 1024 * 3)
    expect(data.foo.split('bar').length).toBe(22 * 1024 + 1)
    expect(data.api).toBeTrue()
    expect(response.headers.get('x-from-root-middleware')).toEqual('1')
    expect(response.headers.has('data')).toBe(false)
  })
})
