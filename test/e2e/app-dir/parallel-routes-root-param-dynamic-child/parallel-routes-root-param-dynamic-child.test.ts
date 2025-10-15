import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'
import { setTimeout } from 'node:timers/promises'

describe('parallel-routes-root-param-dynamic-child', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  async function createBrowserActor(url: string, errorPage: boolean = false) {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser(url, {
      beforePageLoad(page) {
        act = createRouterAct(page, { allowErrorStatusCodes: [404] })
      },
      // throttling the CPU to rule out flakiness based on how quickly the page loads
      cpuThrottleRate: 6,
    })

    // If we're on the error page, we don't have a nav element to wait for.
    if (errorPage) {
      return { act, browser }
    }

    // The page has navigation links that will be automatically prefetched.
    // Some routes will 404 (like /es which isn't in generateStaticParams),
    // so we allow 404 status codes. Let's reveal the navigation links and let
    // the prefetching occur.
    await act(
      async () => {
        await browser.elementByCss('#reveal').click()

        // Ensure the navigation is visible
        await browser.elementByCss('#nav')

        // Wait for 500ms to ensure all links are visible
        await setTimeout(500)

        // Scroll to bottom to ensure all links enter viewport and trigger prefetches
        await browser.eval('window.scrollTo(0, document.body.scrollHeight)')

        // Wait for 500ms to ensure all links are visible
        await setTimeout(500)
      },
      // If we're in development, we don't have any prefetching to wait for.
      isNextDev ? 'no-requests' : undefined
    )

    return { act, browser }
  }

  if (!isNextDev) {
    describe('Prefetching', () => {
      it('prefetches the 404 pages correctly', async () => {
        await createBrowserActor('/en')

        // If we got here without errors, the prefetch responses completed successfully
        // without problematic redirects (like 307). Those will throw because
        // it'll hit the net::ERR_TOO_MANY_REDIRECTS error.
      })
    })
  }

  describe('Base Routes', () => {
    it.each(['en', 'fr'])(
      'should render a 200 for /%s (in generateStaticParams)',
      async (locale) => {
        const { browser } = await createBrowserActor(`/${locale}`)

        expect(await browser.elementByCss('#locale-page').text()).toBe(
          `Locale: ${locale}`
        )
      }
    )

    it('should render a 404 for /es (not in generateStaticParams)', async () => {
      const { browser } = await createBrowserActor('/es', true)

      expect(await browser.elementByCss('.next-error-h1').text()).toBe('404')
    })
  })

  describe('Without generateStaticParams (no-gsp)', () => {
    it.each(['en', 'fr', 'es'])(
      'should render a 200 for /%s/no-gsp/stories/dynamic-123',
      async (locale) => {
        const { browser, act } = await createBrowserActor('/en')

        await act(async () => {
          await browser
            .elementByCss(`[href="/${locale}/no-gsp/stories/dynamic-123"]`)
            .click()
        })

        expect(await browser.elementByCss('#story-locale').text()).toBe(
          `Locale: ${locale}`
        )
        expect(await browser.elementByCss('#story-slug').text()).toBe(
          'Story: dynamic-123'
        )
      }
    )

    it('should allow dynamic params even with /es locale', async () => {
      // Even though /es is not in the root generateStaticParams,
      // no-gsp routes should still work because they don't enforce static params
      const { browser } = await createBrowserActor(
        '/es/no-gsp/stories/dynamic-123'
      )

      expect(await browser.elementByCss('#story-locale').text()).toBe(
        'Locale: es'
      )
      expect(await browser.elementByCss('#story-slug').text()).toBe(
        'Story: dynamic-123'
      )
    })
  })

  describe('With generateStaticParams (gsp)', () => {
    describe('Static params (static-123)', () => {
      it.each(['en', 'fr'])(
        'should render a 200 for /%s/gsp/stories/static-123',
        async (locale) => {
          const { browser, act } = await createBrowserActor(`/${locale}`)

          await act(async () => {
            await browser
              .elementByCss(`[href="/${locale}/gsp/stories/static-123"]`)
              .click()
          })

          expect(await browser.elementByCss('#story-locale').text()).toBe(
            `Locale: ${locale}`
          )
          expect(await browser.elementByCss('#story-slug').text()).toBe(
            'Story: static-123'
          )
        }
      )

      it('should render a 404 for /es/gsp/stories/static-123 (locale not in generateStaticParams)', async () => {
        const response = await next.fetch('/es/gsp/stories/static-123')
        expect(response.status).toBe(404)
      })
    })

    describe('Dynamic params (dynamic-123)', () => {
      it.each(['en', 'fr'])(
        'should render a 404 for /%s/gsp/stories/dynamic-123 (slug not in generateStaticParams)',
        async (locale) => {
          const { browser, act } = await createBrowserActor(`/${locale}`)

          await act(async () => {
            await browser
              .elementByCss(`[href="/${locale}/gsp/stories/dynamic-123"]`)
              .click()
          })

          expect(await browser.elementByCss('.next-error-h1').text()).toBe(
            '404'
          )
        }
      )

      it('should render a 404 for /es/gsp/stories/dynamic-123 (both locale and slug not allowed)', async () => {
        const response = await next.fetch('/es/gsp/stories/dynamic-123')
        expect(response.status).toBe(404)
      })
    })
  })
})
