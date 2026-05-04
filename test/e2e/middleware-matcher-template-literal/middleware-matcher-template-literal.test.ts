import { nextTestSetup } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'

describe('middleware-matcher-template-literal', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('applies middleware on root path', async () => {
    const response = await fetchViaHTTP(next.url, '/')
    expect(response.headers.get('X-From-Middleware')).toBe('true')
  })

  it('applies middleware on matched template literal path', async () => {
    const response = await fetchViaHTTP(next.url, '/dashboard')
    expect(response.headers.get('X-From-Middleware')).toBe('true')
  })

  it('applies middleware on another matched path', async () => {
    const response = await fetchViaHTTP(next.url, '/settings')
    expect(response.headers.get('X-From-Middleware')).toBe('true')
  })

  it('does not apply middleware on unmatched path', async () => {
    const response = await fetchViaHTTP(next.url, '/unmatched')
    expect(response.headers.get('X-From-Middleware')).toBeFalsy()
  })
})
