import { nextTestSetup } from 'e2e-utils'
import { expectVaryHeaderToContain } from 'next-test-utils'

describe('user-vary-header', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should keep a Vary header set by the application', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)

    const vary = res.headers.get('vary')

    // The router's own fields still have to be advertised...
    expectVaryHeaderToContain(vary, ['RSC', 'Next-Router-State-Tree'])
    // ...without dropping the one the application asked for, which a CDN
    // needs in order to key its cache on it.
    expectVaryHeaderToContain(vary, ['X-Foo'])
    expect(res.headers.get('x-foo')).toBe('bar')
  })

  it('should not repeat a field that is already advertised', async () => {
    const res = await next.fetch('/')
    const fields = (res.headers.get('vary') ?? '')
      .split(',')
      .map((field) => field.trim().toLowerCase())
      .filter(Boolean)

    expect(fields.length).toBe(new Set(fields).size)
  })
})
