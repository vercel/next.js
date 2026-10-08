import { nextTestSetup } from 'e2e-utils'

describe('proxy redirect of an RSC request', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('preserves the incoming cache key and the destination query', async () => {
    const response = await next.fetch('/redirect?_rsc=abc123', {
      headers: { RSC: '1' },
      redirect: 'manual',
    })
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/target?foo=bar&_rsc=abc123')
  })

  it('does not overwrite a cache key already on the destination', async () => {
    const response = await next.fetch('/redirect-with-rsc?_rsc=abc123', {
      headers: { RSC: '1' },
      redirect: 'manual',
    })
    expect(response.headers.get('location')).toBe('/target?_rsc=destination')
  })

  it('does not leak the cache key to a different origin', async () => {
    const response = await next.fetch('/external?_rsc=abc123', {
      headers: { RSC: '1' },
      redirect: 'manual',
    })
    expect(response.headers.get('location')).toBe('https://example.com/target')
  })

  it('does not add an RSC cache key to a document redirect', async () => {
    const response = await next.fetch('/redirect?_rsc=abc123', {
      redirect: 'manual',
    })
    expect(response.headers.get('location')).toBe('/target?foo=bar')
  })
})
