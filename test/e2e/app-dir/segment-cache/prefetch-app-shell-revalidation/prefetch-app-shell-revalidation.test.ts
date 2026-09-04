import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'
import { retry } from 'next-test-utils'

/**
 * When a page switches from static to partial during a revalidation,
 * it continues serving static prerender responses for navigations
 * and runtime prefetches even though it shouldn't.
 *
 * This variable enables failing assertions that demonstrate this.
 * We keep both codepaths to also demonstrate the current (incorrect) behavior.
 * */
const REPRODUCE_STATIC_PAGE_UPGRADE_BUG =
  !!process.env.REPRODUCE_STATIC_PAGE_UPGRADE_BUG || false

/**
 * When a page switches from static to partial during a revalidation,
 * and the response indicates that runtime data should be used,
 * we'll perform a runtime follow up. However, if a navigation happens
 * before the runtime prefetch completes, we'll show the static app shell
 * instead of the static prefetch if the latter has more content.
 *
 * This variable enables failing assertions that demonstrate this.
 * We keep both codepaths to also demonstrate the current (incorrect) behavior.
 * */
const REPRODUCE_STATIC_SHELL_PRECEDENCE_BUG =
  !!process.env.REPRODUCE_STATIC_SHELL_PRECEDENCE_BUG || false

describe('App Shell revalidation', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true, // modifies files at runtime
  })
  if (skipped) return
  if (isNextDev) {
    it('is skipped', () => {})
    return
  }

  async function updateCachedValue() {
    await next.fetch('/update-cached-value', { method: 'POST' })
  }
  async function resetCachedValue() {
    await next.fetch('/reset-cached-value', { method: 'POST' })
  }
  async function updateAndWaitForRevalidation(route: string) {
    await updateCachedValue()
    await retry(async () => {
      const response = await next.fetch(route).then((res) => res.text())
      expect(response).toContain(`Cached value: updated`)
    })
    console.log(`--------------------------------------`)
    console.log(`${route} :: finished revalidating`)
    console.log(`--------------------------------------`)
  }

  // The tests are split into two to avoid dealing with browser caches
  // after a revalidation.
  // We do two assertions:
  // 1. The page uses static requests if the page doesn't use runtime data
  //    (when the cache returns its initial value)
  // 2. The page uses runtime follow-ups when the page *does* use runtime data
  //    (when the cache returns its updated value)

  describe.each([
    {
      description:
        'static page that only starts reading cookies in the shell after a revalidation',
      route:
        '/static-conditional-cookies-in-shell/static-shell-equal-to-prefetch',
      hasPrefetchData: false,
    },
    {
      // A variation of the previous test that includes prefetch-only content,
      // to make sure that this also works if the extracted static shell is not
      // equal to the static prefetch.
      description:
        'static page with prefetch-only content that only starts reading cookies in the shell after a revalidation',
      route:
        '/static-conditional-cookies-in-shell/static-shell-smaller-than-prefetch',
      hasPrefetchData: true,
    },
  ])('$description', ({ route, hasPrefetchData }) => {
    afterAll(() => resetCachedValue())

    it('uses static requests when the page does not use cookies', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page, { includeAppShellRequests: true })

      // Reveal a link to the page.
      // It was fully static during build, so it should use static requests.
      await act(async () => {
        await browser
          .elementByCss(`input[data-link-accordion="${route}"]`)
          .click()
      }, [
        // Only a static request.
        { includes: 'Cached value: original', kind: 'static' },
        { includes: '', kind: 'runtime', block: 'reject' },
      ])

      // The route is fully static, so we should navigate without extra requests.
      await act(async () => {
        await browser.elementByCss(`a[href="${route}"]`).click()
      }, 'no-requests')
    })

    it('[FAILING] starts using runtime requests when the page starts using cookies after a revalidation', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page, { includeAppShellRequests: true })

      // Update the cache and for revalidation to settle before opening the page
      await updateAndWaitForRevalidation(route)

      // Reveal a link to the page. We should see revalidated content.
      // After the revalidation, the page starts using cookies in the shell.
      if (REPRODUCE_STATIC_PAGE_UPGRADE_BUG) {
        // Expected behavior
        await act(async () => {
          await browser
            .elementByCss(`input[data-link-accordion="${route}"]`)
            .click()
        }, [
          // First, a static request (because the page was statically optimized at build time).
          // This response should signal to the client router that runtime requests are still needed.
          { includes: 'Cached value: updated', kind: 'static' },
          // Then, a runtime shell follow-up.
          { includes: 'Cookie data', kind: 'runtime' },
          // This should be a runtime shell, i.e. we should not see runtime prefetch content.
          {
            includes: 'Runtime prefetch data (behind cookies)',
            block: 'reject',
          },
        ])
      } else {
        // Actual behavior
        await act(async () => {
          await browser
            .elementByCss(`input[data-link-accordion="${route}"]`)
            .click()
        }, [
          // First, a static request (because the page was statically optimized at build time).
          // This response should signal to the client router that runtime requests are still needed.
          { includes: 'Cached value: updated', kind: 'static' },
          // We *do* issue a follow up runtime request, but it just returns
          // the static prerender result (under a `next-router-prefetch: 3` response).
          // It includes data gated behind `prefetch()` (which a shell would not do)...
          {
            includes: hasPrefetchData
              ? 'Prefetch data'
              : 'Static page that conditionally uses cookies in the shell',
            kind: 'runtime',
          },
          // ...and does not include cookies:
          { includes: 'Cookie data', kind: 'runtime', block: 'reject' },
        ])
      }

      // Navigate to the page. It became partial after revalidation, so we should
      // do another request.
      if (REPRODUCE_STATIC_PAGE_UPGRADE_BUG) {
        // Expected behavior
        await act(
          async () => {
            await browser.elementByCss(`a[href="${route}"]`).click()

            // We should show contents from the runtime shell while navigating.
            expect(await browser.elementById('cookie-data').text()).toEqual(
              'Cookie data'
            )
          },
          // The runtime shell is complete, so no extra requests should be needed.
          'no-requests'
        )

        expect(await browser.elementById('cookie-data').text()).toEqual(
          'Cookie data'
        )
      } else {
        // Actual behavior (incorrect)
        await act(async () => {
          await browser.elementByCss(`a[href="${route}"]`).click()
          // The server did not actually return a runtime shell, so we don't see cookies,
          // just the static prerender result.
          expect(
            await browser.elementById('cookie-data-fallback').text()
          ).toEqual('Loading cookie data...')

          if (hasPrefetchData) {
            // We do however show `prefetch()` data, because a static prerender includes those.
            expect(await browser.elementById('prefetch-data').text()).toBe(
              'Prefetch data'
            )
          }
        }, [
          // The navigation request *also* incorrectly returns the (partial) static prerender
          // result, which does not contain cookies.
          {
            includes:
              'Static page that conditionally uses cookies in the shell',
          },
          { includes: 'Cookie data', block: 'reject' },
        ])

        // The navigation response was partial, so decoding the payload errors with
        // with "Connection Closed" and crashes the page.
        expect(await browser.elementById('__next_error__').text()).toContain(
          'This page couldn’t load'
        )
      }
    })
  })

  describe.each([
    {
      description:
        'partial page that only starts reading cookies in the shell after a revalidation',
      route:
        '/partial-conditional-cookies-in-shell/static-shell-equal-to-prefetch',
      hasPrefetchData: false,
    },
    {
      // A variation of the previous test that includes prefetch-only content,
      // to make sure that this also works if the extracted static shell is not
      // equal to the static prefetch.
      description:
        'partial page with prefetch-only content that only starts reading cookies in the shell after a revalidation',
      route:
        '/partial-conditional-cookies-in-shell/static-shell-smaller-than-prefetch',
      hasPrefetchData: true,
    },
  ])('$description', ({ route, hasPrefetchData }) => {
    afterAll(() => resetCachedValue())

    it('uses static requests when the page does not use cookies', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page, { includeAppShellRequests: true })

      // Reveal a link to the page.
      // It used dynamic data during build, so it's partial, but it did not
      // use runtime data, so it should use static requests.
      await act(async () => {
        await browser
          .elementByCss(`input[data-link-accordion="${route}"]`)
          .click()
      }, [
        // Only a static request.
        { includes: 'Cached value: original', kind: 'static' },
        { includes: '', kind: 'runtime', block: 'reject' },
      ])

      if (hasPrefetchData) {
        // The route has static prefetch-only data. We should be showing it
        // while the navigation is pending (instead of the extracted static app shell)
        await act(async () => {
          await browser.elementByCss(`a[href="${route}"]`).click()

          expect(await browser.elementById('prefetch-data').text()).toBe(
            'Prefetch data'
          )
        })
      }
    })

    it('starts using runtime requests when the page starts using cookies after a revalidation', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page, { includeAppShellRequests: true })

      // Update the cache and for revalidation to settle before opening the page
      await updateAndWaitForRevalidation(route)

      // Reveal a link to the page. We should see revalidated content.
      // After the revalidation, the page starts using cookies in the shell.
      await act(async () => {
        await browser
          .elementByCss(`input[data-link-accordion="${route}"]`)
          .click()
      }, [
        // First, a static request (because the page was statically optimized at build time).
        // This response should signal to the client router that runtime requests are still needed.
        { includes: 'Cached value: updated', kind: 'static' },
        // Then, a runtime shell follow-up.
        { includes: 'Cookie data', kind: 'runtime' },
        // This should be a runtime shell, i.e. we should not see runtime prefetch content.
        { includes: 'Runtime prefetch data (behind cookies)', block: 'reject' },
      ])

      // Navigate to the page.
      await act(async () => {
        await browser.elementByCss(`a[href="${route}"]`).click()

        // We should show contents from the runtime shell while navigating.
        expect(await browser.elementById('cookie-data').text()).toEqual(
          'Cookie data'
        )
      }, [{ includes: 'Dynamic data' }])

      expect(await browser.elementById('dynamic-data').text()).toEqual(
        'Dynamic data'
      )
    })
  })

  describe('partial page that only starts reading cookies in the prefetch after a revalidation', () => {
    const route = '/partial-conditional-cookies-in-prefetch'
    afterAll(() => resetCachedValue())

    it('uses static requests when the page does not use cookies', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page, { includeAppShellRequests: true })

      // Reveal a link to the page.
      // It used dynamic data during build, so it's partial, but it did not
      // use runtime data, so it should use static requests.
      await act(async () => {
        await browser
          .elementByCss(`input[data-link-accordion="${route}"]`)
          .click()
      }, [
        // Only a static request.
        { includes: 'Cached value: original', kind: 'static' },
        { includes: '', kind: 'runtime', block: 'reject' },
      ])

      // The route has static prefetch-only data. We should be showing it
      // while the navigation is pending (instead of the extracted static app shell)
      await act(async () => {
        await browser.elementByCss(`a[href="${route}"]`).click()

        expect(await browser.elementById('prefetch-data').text()).toBe(
          'Prefetch data'
        )
      })
    })

    it('starts using runtime requests when the page starts using cookies after a revalidation', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page, { includeAppShellRequests: true })

      // Update the cache and for revalidation to settle before opening the page
      await updateAndWaitForRevalidation(route)

      // Reveal a prefetch-auto link to the page. We should see revalidated content.
      // After the revalidation, the page starts using cookies in the prefetch,
      // so we should not fetch a runtime shell.
      await act(async () => {
        await browser
          .elementByCss(
            `[data-prefetch="auto"] input[data-link-accordion="${route}"]`
          )
          .click()
      }, [
        // First, a static request (because the page was statically optimized at build time).
        // This response should signal to the client router that runtime requests are still needed,
        // but only for prefetches, not shells.
        { includes: 'Cached value: updated', kind: 'static' },
        // There should not be a runtime follow up.
        { includes: '', kind: 'runtime', block: 'reject' },
      ])

      // Reveal a prefetch-true link to the page.
      // We have a sufficient shell, but the prefetch requires runtime data.
      await act(async () => {
        await browser
          .elementByCss(
            `[data-prefetch="true"] input[data-link-accordion="${route}"]`
          )
          .click()
      }, [
        { includes: 'Runtime prefetch data (behind cookies)', kind: 'runtime' },
      ])

      // Navigate to the page.
      await act(async () => {
        await browser.elementByCss(`a[href="${route}"]`).click()

        // We should show contents from the runtime prefetch while navigating.
        expect(await browser.elementById('cookie-data').text()).toEqual(
          'Cookie data'
        )
        expect(
          await browser.elementById('cookies-runtime-prefetch-data').text()
        ).toEqual('Runtime prefetch data (behind cookies)')
      }, [{ includes: 'Dynamic data' }])

      expect(await browser.elementById('dynamic-data').text()).toEqual(
        'Dynamic data'
      )
    })

    it('[FAILING] shows static prefetch content if the runtime follow-up has not finished', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page, { includeAppShellRequests: true })

      // Update the cache and for revalidation to settle before opening the page
      await updateAndWaitForRevalidation(route)

      // Reveal a prefetch-auto link to the page. We should see revalidated content.
      // After the revalidation, the page starts using cookies in the prefetch,
      // so we should not fetch a runtime shell.
      await act(async () => {
        await browser
          .elementByCss(
            `[data-prefetch="auto"] input[data-link-accordion="${route}"]`
          )
          .click()
      }, [
        // First, a static request (because the page was statically optimized at build time).
        // This response should signal to the client router that runtime requests are still needed,
        // but only for prefetches, not shells.
        { includes: 'Cached value: updated', kind: 'static' },
        // There should not be a runtime follow up.
        { includes: '', kind: 'runtime', block: 'reject' },
      ])

      // Reveal a prefetch-true link to the page, but block its response, and navigate.
      // We have a sufficient shell, but the prefetch requires runtime data.
      // Howver, the the runtime request is blocked, so the client has to use
      // the static data it prefetched from the first requests.
      await act(async () => {
        await act(async () => {
          await browser
            .elementByCss(
              `[data-prefetch="true"] input[data-link-accordion="${route}"]`
            )
            .click()
        }, [
          {
            includes: 'Runtime prefetch data (behind cookies)',
            kind: 'runtime',
            block: true,
          },
        ])
        // Navigate while the runtime prefetch is blocked.
        await browser.elementByCss(`a[href="${route}"]`).click()

        // We should show the most complete static prefetch we have
        // (instead of the static app shell)
        // However, the client currently prefers the shell, because it did not use any runtime data
        // and was recorded at `FetchStrategy.ShellRuntime` which outranks the whole response's
        // `FetchStrategy.PPR`, so it will be used despite technically containing less data.
        if (REPRODUCE_STATIC_SHELL_PRECEDENCE_BUG) {
          expect(await browser.elementById('prefetch-data').text()).toBe(
            'Prefetch data'
          )
        } else {
          expect(
            await browser.elementById('prefetch-data-fallback').text()
          ).toBe('Loading prefetch data...')
        }
      })
    })
  })

  it.todo(
    'partial page that read cookies in the prefetch at build but starts to also read them in the shell after a revalidation'
  )

  it.todo(
    'partial page that read cookies in the shell at build but starts to only read them in the prefetch after a revalidation'
  )
})
