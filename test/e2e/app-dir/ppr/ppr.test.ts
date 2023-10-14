import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'ppr',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next, isNextDev }) => {
    describe.each([
      { pathname: '/suspense/node' },
      { pathname: '/suspense/node/nested/1' },
      { pathname: '/suspense/node/nested/2' },
      { pathname: '/suspense/node/nested/3' },
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
          let dynamic = $('#container > #dynamic > #state')

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
          dynamic = $('#container > #dynamic > #state')
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
  }
)
