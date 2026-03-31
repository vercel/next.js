import { nextTestSetup } from 'e2e-utils'
import { retry, findAllTelemetryEvents } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

// TODO(NAR-423): Migrate to Cache Components.
describe.skip('ppr', () => {
  const { next, isNextDev, isNextStart } = nextTestSetup({
    files: __dirname,
    env: {
      NEXT_TELEMETRY_DEBUG: '1',
    },
  })

  it('should indicate the feature is experimental', async () => {
    await retry(() => {
      expect(next.cliOutput).toContain('Experiments (use with caution)')
      expect(stripAnsi(next.cliOutput)).toContain('✓ ppr')
    })
  })
  if (isNextStart) {
    describe('build output', () => {
      it('correctly marks pages as being partially prerendered in the build output', () => {
        expect(next.cliOutput).toContain('◐ /loading/nested/[slug]')
        expect(next.cliOutput).toContain('◐ /suspense/node')
        expect(next.cliOutput).toContain('◐ /suspense/node/gsp/[slug]')
        expect(next.cliOutput).toContain('◐ /suspense/node/nested/[slug]')
      })
    })

    describe('telemetry', () => {
      it('should send ppr feature usage event', async () => {
        const events = findAllTelemetryEvents(
          next.cliOutput,
          'NEXT_BUILD_FEATURE_USAGE'
        )
        expect(events).toContainEqual({
          featureName: 'experimental/ppr',
          invocationCount: 1,
        })
      })
    })
  }
  describe.each([
    { pathname: '/suspense/node' },
    { pathname: '/suspense/node/nested/1' },
    { pathname: '/suspense/node/nested/2' },
    { pathname: '/suspense/node/nested/3' },
    { pathname: '/loading/nested/1' },
    { pathname: '/loading/nested/2' },
    { pathname: '/loading/nested/3' },
  ])('for $pathname', ({ pathname }) => {
    // When we're partially pre-rendering, we should get the static parts
    // immediately, and the dynamic parts after the page loads. So we should
    // see the static part in the output, but the dynamic part should be
    // missing.
    it('should serve the static part', async () => {
      const $ = await next.render$(pathname)
      expect($('#page').length).toBe(1)
    })

    if (isNextDev) {
      it('should have the dynamic part', async () => {
        let $ = await next.render$(pathname)
        // asserting this flushes in a single pass in dev is not reliable
        // so we just assert that the nodes are somewhere in the document
        // even if they aren't in position
        let dynamic = $('#dynamic > #state')

        expect(dynamic.length).toBe(1)
        expect(dynamic.text()).toBe('Not Signed In')

        $ = await next.render$(
          pathname,
          {},
          {
            headers: {
              cookie: 'session=1',
            },
          }
        )
        dynamic = $('#dynamic > #state')
        expect(dynamic.length).toBe(1)
        expect(dynamic.text()).toBe('Signed In')
      })
    } else {
      it('should not have the dynamic part', async () => {
        const $ = await next.render$(pathname)
        expect($('#container > #dynamic > #state').length).toBe(0)
      })
    }
  })

  describe.each([
    { pathname: '/suspense/node' },
    { pathname: '/suspense/edge' },
  ])('with suspense for $pathname', ({ pathname }) => {
    // When the browser loads the page, we expect that the dynamic part will
    // be rendered.
    it('should eventually render the dynamic part', async () => {
      const browser = await next.browser(pathname)

      try {
        // Wait for the page part to load.
        await browser.waitForElementByCss('#page')
        await browser.waitForIdleNetwork()

        // Wait for the dynamic part to load.
        await browser.waitForElementByCss('#container > #dynamic > #state')

        // Ensure we've got the right dynamic part.
        let dynamic = await browser
          .elementByCss('#container > #dynamic > #state')
          .text()

        expect(dynamic).toBe('Not Signed In')

        // Re-visit the page with the cookie.
        await browser.addCookie({ name: 'session', value: '1' }).refresh()

        // Wait for the page part to load.
        await browser.waitForElementByCss('#page')
        await browser.waitForIdleNetwork()

        // Wait for the dynamic part to load.
        await browser.waitForElementByCss('#container > #dynamic > #state')

        // Ensure we've got the right dynamic part.
        dynamic = await browser
          .elementByCss('#container > #dynamic > #state')
          .text()

        expect(dynamic).toBe('Signed In')
      } finally {
        await browser.deleteCookies()
        await browser.close()
      }
    })
  })

  describe('search parameters', () => {
    it('should render the page with the search parameters', async () => {
      const expected = `${Date.now()}:${Math.random()}`
      const res = await next.fetch(
        `/search?query=${encodeURIComponent(expected)}`
      )
      expect(res.status).toBe(200)

      const html = await res.text()
      expect(html).toContain(expected)
    })
  })

  describe.each([{ pathname: '/no-suspense' }])(
    'without suspense for $pathname',
    ({ pathname }) => {
      // When the browser loads the page, we expect that the dynamic part will
      // be rendered.
      it('should immediately render the dynamic part', async () => {
        let $ = await next.render$(pathname)

        let dynamic = $('#container > #dynamic > #state').text()
        expect(dynamic).toBe('Not Signed In')

        // Re-visit the page with the cookie.
        $ = await next.render$(
          pathname,
          {},
          {
            headers: {
              cookie: 'session=1',
            },
          }
        )

        dynamic = $('#container > #dynamic > #state').text()
        expect(dynamic).toBe('Signed In')
      })
    }
  )

  describe('/no-suspense/node/gsp/[slug]', () => {
    it('should serve the static & dynamic parts', async () => {
      const $ = await next.render$('/no-suspense/node/gsp/foo')
      expect($('#page').length).toBe(1)
      expect($('#container > #dynamic > #state').length).toBe(1)
    })
  })

  describe('/suspense/node/gsp/[slug]', () => {
    it('should serve the static part first', async () => {
      const $ = await next.render$('/suspense/node/gsp/foo')
      expect($('#page').length).toBe(1)
    })

    it('should not have the dynamic part', async () => {
      const $ = await next.render$('/suspense/node/gsp/foo')
      expect($('#container > #dynamic > #state').length).toBe(0)
    })
  })
})
