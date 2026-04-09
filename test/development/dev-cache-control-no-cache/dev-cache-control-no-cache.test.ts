import { nextTestSetup } from 'e2e-utils'

describe('dev Cache-Control header', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should use no-cache for pages router', async () => {
    const res = await next.fetch('/pages-route')
    expect(res.headers.get('Cache-Control')).toBe('no-cache, must-revalidate')
  })

  it('should use no-cache for app router', async () => {
    const res = await next.fetch('/app-route')
    expect(res.headers.get('Cache-Control')).toBe('no-cache, must-revalidate')
  })
})
