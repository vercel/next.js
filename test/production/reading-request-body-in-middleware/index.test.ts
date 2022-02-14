import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'

describe('reading request body in middleware', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/_middleware.js': `
          const { NextResponse } = require('next/server');

          export default async function middleware(request) {
            if (!request.body) {
              return new Response('No body', { status: 400 });
            }

            const json = await request.json();

            if (request.nextUrl.searchParams.has("next")) {
              return NextResponse.next();
            }

            return new Response(JSON.stringify({
              root: true,
              ...json,
            }), {
              status: 200,
              headers: {
                'content-type': 'application/json',
              },
            })
          }
        `,

        'pages/nested/_middleware.js': `
          const { NextResponse } = require('next/server');

          export default async function middleware(request) {
            if (!request.body) {
              return new Response('No body', { status: 400 });
            }

            const json = await request.json();

            return new Response(JSON.stringify({
              root: false,
              ...json,
            }), {
              status: 200,
              headers: {
                'content-type': 'application/json',
              },
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
    expect(await response.json()).toEqual({
      foo: 'bar',
      root: true,
    })
  })

  it('reads the same body on both middlewares', async () => {
    const response = await fetchViaHTTP(
      next.url,
      '/nested/hello',
      {
        next: '1',
      },
      {
        method: 'POST',
        body: JSON.stringify({
          foo: 'bar',
        }),
      }
    )
    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({
      foo: 'bar',
      root: false,
    })
  })
})
