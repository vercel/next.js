import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'

describe('middleware redirects merge the query params', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/_middleware.js': `
          import { NextResponse } from 'next/server';

          export default function middleware({ nextUrl }) {
            nextUrl.searchParams.delete('foo');
            nextUrl.searchParams.set('overridden', 'middleware');
            nextUrl.searchParams.set('getsEmpty', '');
            return NextResponse.redirect(nextUrl);
          }
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('merges the params for redirects and matches rewrites', async () => {
    const response = await fetchViaHTTP(
      next.url,
      '/',
      { foo: 'bar', overridden: 'overridden', getsEmpty: 'getsEmpty' },
      {
        redirect: 'manual',
      }
    )
    const newLocation = new URL(response.headers.get('location'))
    const query = Object.fromEntries([...newLocation.searchParams])
    expect(query).toEqual({
      foo: 'bar',
      overridden: 'middleware',
    })
  })
})
