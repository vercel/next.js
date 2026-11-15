import { nextTestSetup } from 'e2e-utils'
import { load } from 'cheerio'

// These status assertions require production prerendering. In dev, pages are
// rendered on request and Suspense may stream a 200 before an HTTP error occurs.
// @force-gate !dev
describe('prerendered-http-status-codes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('returns 200 when notFound() runs after connection() inside Suspense, then shows the not-found UI', async () => {
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

  describe.each(['suspense', 'root'])(
    'HTTP error precedence with the second error caught at %s',
    (boundary) => {
      async function expectResponse(
        first: string,
        second: string,
        status: number,
        location: string | null = null
      ) {
        const response = await next.fetch(
          `/precedence/${first}/${second}/${boundary}`,
          {
            headers: { Accept: 'text/html' },
            redirect: 'manual',
          }
        )

        expect(response.status).toBe(status)
        expect(response.headers.get('location')).toBe(location)
        expect(response.headers.get('content-type')).toContain('text/html')
        if (boundary === 'suspense') {
          const $ = load(await response.text())
          expect($('#precedence-layout').text()).toBe('HTTP error precedence')
          expect($('#first-fallback').text()).toBe('First fallback')
          expect($('#second-fallback').text()).toBe('Second fallback')
        }
      }

      it.each([
        ['not-found', 'unauthorized', 404],
        ['not-found', 'forbidden', 404],
        ['unauthorized', 'not-found', 401],
        ['unauthorized', 'forbidden', 401],
        ['forbidden', 'not-found', 403],
        ['forbidden', 'unauthorized', 403],
      ])('keeps the first access fallback: %s before %s', expectResponse)

      describe.each([
        { redirect: 'redirect', status: 307 },
        { redirect: 'permanent-redirect', status: 308 },
      ])('$redirect', ({ redirect, status }) => {
        it.each(['not-found', 'unauthorized', 'forbidden'])(
          'overrides an earlier %s',
          async (fallback) => {
            await expectResponse(fallback, redirect, status, '/second')
          }
        )

        it.each(['not-found', 'unauthorized', 'forbidden'])(
          'takes precedence over a later %s',
          async (fallback) => {
            await expectResponse(redirect, fallback, status, '/first')
          }
        )

        it.each(['redirect', 'permanent-redirect'])(
          'keeps its status and location when followed by %s',
          async (second) => {
            await expectResponse(redirect, second, status, '/first')
          }
        )
      })
    }
  )

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
        if (variant === 'with-suspense') {
          const $ = load(await response.text())
          expect($('#layout').text()).toBe('Shared layout')
          expect($('#suspense-fallback').text()).toBe('Loading...')
        }
      }
    )

    it('shows the custom not-found UI in the browser', async () => {
      const browser = await next.browser(`/${variant}/not-found`)
      try {
        expect(await browser.elementByCss('#not-found').text()).toBe(
          'This page could not be found.'
        )
        if (variant === 'with-suspense') {
          expect(await browser.elementByCss('#layout').text()).toBe(
            'Shared layout'
          )
          expect(
            await browser.hasElementByCssSelector('#suspense-fallback')
          ).toBe(false)
        }
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
      if (variant === 'with-suspense') {
        const $ = load(await response.text())
        expect($('#layout').text()).toBe('Shared layout')
        expect($('#suspense-fallback').text()).toBe('Loading...')
      }
    })
  })
})
