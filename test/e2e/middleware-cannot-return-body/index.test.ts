import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'

describe.each([
  {
    title: 'return a text body',
    middlewareCode: `
  export default function middleware(request) {
    const body = 'this is not allowed'
    return new Response(body);
  }
`,
  },
  {
    title: 'return JSON content',
    middlewareCode: `
    function buildBody() {
      return JSON.stringify({ foo: 'bar' })
    }
    export default function middleware(request) {
      return new Response(buildBody(), { headers: {'content-type': 'application/json'} });
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
