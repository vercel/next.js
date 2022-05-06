import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'

describe.each([
  {
    title: 'return a text body',
    middlewareCode: `
  export default function middleware(request) {
    return new Response('this is not allowed');
  }
`,
  },
  {
    title: 'return JSON content',
    middlewareCode: `
  export default function middleware(request) {
    return new Response(JSON.stringify({ foo: 'bar' }), { headers: {'content-type': 'application/json'} });
  }
`,
  },
  {
    title: 'use NextResponse.json()',
    middlewareCode: `
  import { NextResponse } from 'next/server';
  export default function middleware(request) {
    return NextResponse.json({ foo: 'bar' });
  }
`,
  },
])('middleware cannot $title', ({ middlewareCode }) => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/_middleware.js': middlewareCode,
      },
    })
  })
  afterAll(() => next.destroy())

  it('returns a 500 error', async () => {
    const response = await fetchViaHTTP(next.url, '/')
    expect(await response.json()).toEqual({
      message: `A middleware can not alter response's body. Learn more: https://nextjs.org/docs/messages/returning-response-body-in-_middleware`,
    })
  })
})
