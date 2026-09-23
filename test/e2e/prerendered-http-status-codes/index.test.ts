import { nextTestSetup } from 'e2e-utils'

describe('prerendered-http-status-codes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('returns 200 and shows the dynamic not-found UI', async () => {
    const { browser, response } = await next.browserWithResponse(
      '/with-suspense/dynamic-not-found'
    )
    try {
      expect(response.status()).toBe(200)
      expect(await browser.elementByCss('#not-found').text()).toBe(
        'This page could not be found.'
      )
    } finally {
      await browser.close()
    }
  })

  describe.each(['with-suspense', 'without-suspense'])('%s', (variant) => {
    it.each([
      { route: 'unauthorized', status: 401 },
      { route: 'forbidden', status: 403 },
      { route: 'not-found', status: 404 },
    ])(
      'returns $status for the $route HTML response',
      async ({ route, status }) => {
        const response = await next.fetch(`/${variant}/${route}`, {
          headers: { Accept: 'text/html' },
        })

        expect(response.headers.get('content-type')).toContain('text/html')
        expect(response.status).toBe(status)
      }
    )

    it('shows the custom not-found UI in the browser', async () => {
      const browser = await next.browser(`/${variant}/not-found`)
      try {
        expect(await browser.elementByCss('#not-found').text()).toBe(
          'This page could not be found.'
        )
      } finally {
        await browser.close()
      }
    })

    it.each([
      { route: 'redirect', status: 307 },
      { route: 'permanent-redirect', status: 308 },
    ])('returns $status and location for $route', async ({ route, status }) => {
      const response = await next.fetch(`/${variant}/${route}`, {
        headers: { Accept: 'text/html' },
        redirect: 'manual',
      })

      expect(response.status).toBe(status)
      expect(response.headers.get('location')).toBe('/')
    })
  })
})
