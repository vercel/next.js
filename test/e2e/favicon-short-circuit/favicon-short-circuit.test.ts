import { nextTestSetup } from 'e2e-utils'

describe('favicon-short-circuit', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it('should short circuit the favicon in development', async () => {
      const res = await next.fetch('/favicon.ico')

      // Expect we got the right status and headers.
      expect(res.status).toBe(404)
      expect(res.headers.get('content-type')).toBeNull()

      // Expect we got no body.
      const text = await res.text()
      expect(text).toBeEmpty()

      // Expect we didn't compile the not found route.
      expect(next.cliOutput).not.toContain('compiling /not-found')
    })
  } else {
    it('should not short circuit the favicon in production', async () => {
      const res = await next.fetch('/favicon.ico')

      // Expect we got the right status and headers.
      expect(res.status).toBe(404)
      expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')

      // Expect we got the right body.
      const html = await res.text()
      expect(html).toContain('<html>')
    })
  }
})
