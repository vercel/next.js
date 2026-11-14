import { nextTestSetup } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'

describe('client-error-status-fallback', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // An app with only a catch-all route has no error page to render for these
  // statuses, so the response falls back to a plain body. That fallback must
  // keep the client-error status rather than reporting a server error.

  it('should respond with 400 for a pathname that cannot be decoded', async () => {
    const res = await fetchViaHTTP(next.url, '/%A0')

    expect(res.status).toBe(400)
    expect(await res.text()).toContain('Bad Request')
  })

  it('should respond with 400 for a malformed percent-encoding', async () => {
    const res = await fetchViaHTTP(next.url, '/%2')

    expect(res.status).toBe(400)
    expect(await res.text()).toContain('Bad Request')
  })

  it('should respond with 405 for a disallowed method on a static asset', async () => {
    const html = await next.render('/')
    const chunk = html.match(/\/_next\/static\/[^"']+\.js/)?.[0]
    expect(chunk).toBeDefined()

    for (const method of ['OPTIONS', 'POST']) {
      const res = await fetchViaHTTP(next.url, chunk, null, { method })

      expect(res.status).toBe(405)
      expect(res.headers.get('allow')).toContain('GET')
    }
  })

  it('should still serve a pathname with valid percent-encoding', async () => {
    const res = await fetchViaHTTP(next.url, '/this%20is%20fine')

    expect(res.status).toBe(200)
    expect(await res.text()).toContain('slug:')
  })
})
