import { nextTestSetup, type Playwright } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { createRouterAct } from 'router-act'

describe('interception-dynamic-segment', () => {
  const { next, isNextStart, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  /**
   * Returns true if the given href should already be opened. This allows us to
   * condition on whether to expect any additional network requests.
   */
  async function isAccordionClosed(
    browser: Playwright,
    href: string
  ): Promise<boolean> {
    const selector = `[data-testid="link-accordion"][data-href="${href}"]`

    // Check if the button is already open
    return await browser.hasElementByCss(`${selector} button`)
  }

  /**
   * Helper to navigate via the LinkAccordion component.
   * Scrolls to the accordion, opens it, and clicks the link.
   */
  async function navigate(browser: Playwright, href: string) {
    const selector = `[data-testid="link-accordion"][data-href="${href}"]`

    // Find and scroll to accordion
    const accordion = await browser.elementByCss(selector)
    await accordion.scrollIntoViewIfNeeded()

    // Click the "Open" button, it may already be open, so we don't need to
    // click it again.
    if (await isAccordionClosed(browser, href)) {
      const button = await browser.elementByCss(`${selector} button`)
      await button.click()
    }

    // Click the actual link
    const link = await browser.elementByCss(`${selector} a`)
    await link.click()
  }

  /**
   * Create a browser with router act that will FAIL if any 404s occur during navigation.
   * This is critical because if a 404 occurs, the client will perform MPA navigation
   * (full page reload) which still successfully navigates, hiding the bug.
   */
  async function createBrowserWithRouterAct(url: string) {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser(url, {
      beforePageLoad(page) {
        // DON'T use allowErrorStatusCodes - we want 404s to fail the test
        act = createRouterAct(page)
      },
    })

    return { act: act!, browser }
  }

  it('should work when interception route is paired with a dynamic segment', async () => {
    const browser = await next.browser('/')

    await navigate(browser, '/foo/1')
    await browser.waitForIdleNetwork()

    await retry(async () => {
      expect(await browser.elementById('modal').text()).toContain('intercepted')
    })

    await browser.refresh()
    await browser.waitForIdleNetwork()

    await retry(async () => {
      expect(await browser.elementById('modal').text()).toContain('catch-all')
    })
    await retry(async () => {
      expect(await browser.elementById('children').text()).toContain(
        'not intercepted'
      )
    })
  })

  it('should intercept consistently with back/forward navigation', async () => {
    // Test that the fix works with browser back/forward navigation
    const browser = await next.browser('/')

    // Navigate with interception
    await navigate(browser, '/foo/1')
    await browser.waitForIdleNetwork()

    await retry(async () => {
      expect(await browser.elementById('modal').text()).toContain('intercepted')
    })

    // Go back to root
    await browser.back()
    await browser.waitForIdleNetwork()

    await retry(async () => {
      const url = await browser.url()
      expect(url).toContain('/')
    })

    // Go forward - should show intercepted version
    await browser.forward()
    await browser.waitForIdleNetwork()

    await retry(async () => {
      expect(await browser.elementById('modal').text()).toContain('intercepted')
    })
  })

  it('should intercept multiple times from root', async () => {
    // Test that repeated interception from root works
    const browser = await next.browser('/')

    for (let i = 0; i < 2; i++) {
      await navigate(browser, '/foo/1')
      await browser.waitForIdleNetwork()

      await retry(async () => {
        expect(await browser.elementById('modal').text()).toContain(
          'intercepted'
        )
      })

      await browser.back()
      await browser.waitForIdleNetwork()

      await retry(async () => {
        const url = await browser.url()
        expect(url).toMatch(/\/$/)
      })
    }
  })

  if (isNextStart) {
    it('should correctly prerender segments with generateStaticParams', async () => {
      expect(next.cliOutput).toContain('/generate-static-params/a')
      const res = await next.fetch('/generate-static-params/a')
      expect(res.status).toBe(200)
      expect(res.headers.get('x-nextjs-cache')).toBe('HIT')
    })

    it('should prerender a dynamic intercepted route', async () => {
      if (process.env.__NEXT_CACHE_COMPONENTS === 'true') {
        expect(next.cliOutput).toContain('/(.)[username]/[id]')
        expect(next.cliOutput).toContain('/(.)john/[id]')
      }

      expect(next.cliOutput).toContain('/(.)john/1')
      expect(next.cliOutput).not.toContain('/john/1')
    })
  }

  if (isNextDev) {
    it('should retain named host slots for an interception catch-all in development', async () => {
      const { act, browser } = await createBrowserWithRouterAct('/named-host')

      await browser.elementById('retained-counter').click()

      await act(async () => {
        await navigate(browser, '/named-host/named-catchall-target/photo')
      })

      expect(
        await browser.elementById('named-host-catchall-modal').text()
      ).toBe('Intercepted named catch-all target')
      expect(await browser.elementById('named-host-content').text()).toContain(
        'Named content slot'
      )
      expect(
        await browser.elementById('named-host-secondary').text()
      ).toContain('Named secondary slot without a default')
      expect(await browser.elementById('named-host-canonical').text()).toBe(
        'Named canonical slot'
      )
      expect(await browser.elementById('retained-counter').text()).toBe(
        'Retained count: 1'
      )
    })
  }

  if (!isNextDev) {
    /**
     * Test Case Validation: Ensure NO 404s occur during interception navigation
     * These tests validate the fix for default.tsx injection with parallel routes.
     * Using createRouterAct WITHOUT allowErrorStatusCodes ensures that any 404
     * response will fail the test, preventing the bug where MPA navigation masks 404s.
     */
    describe('Default.tsx injection validation (no 404s allowed)', () => {
      /**
       * Test Case: Dynamic segment interception route [username]/[id]
       * Validates that intercepted routes with dynamic segments don't return 404
       */
      it('should not render a 404 for the intercepted route with dynamic segments', async () => {
        const { act, browser } = await createBrowserWithRouterAct('/')

        await act(async () => {
          await navigate(browser, '/foo/1')
        })

        await retry(async () => {
          expect(await browser.elementById('modal').text()).toContain(
            'intercepted'
          )
        })
      })
      /**
       * Test Case 1a: Simple interception page (no parallel routes)
       * Structure: @modal/(.)simple-page/page.tsx
       * Expected: Should work WITHOUT null default logic
       * Reason: No parallel routes = no implicit layout = no children slot
       */
      it('should navigate to /simple-page without 404 (no parallel routes)', async () => {
        const { act, browser } = await createBrowserWithRouterAct('/')

        await act(async () => {
          await navigate(browser, '/simple-page')
        })

        await retry(async () => {
          expect(await browser.elementByCss('#modal h3').text()).toContain(
            'Simple interception page'
          )
        })
      })

      /**
       * Test Case 1b: Has page.tsx at interception level
       * Structure: @modal/(.)has-page/page.tsx
       * Expected: Should work WITHOUT default.tsx
       * Reason: page.tsx fills the children slot
       */
      it('should navigate to /has-page without 404 (page fills children)', async () => {
        const { act, browser } = await createBrowserWithRouterAct('/')

        await act(async () => {
          await navigate(browser, '/has-page')
        })

        await retry(async () => {
          expect(await browser.elementByCss('#modal h3').text()).toContain(
            'TEST CASE 1'
          )
        })
      })

      /**
       * Test Case 2: No parallel routes (nested page)
       * Structure: @modal/(.)no-parallel-routes/deeper/page.tsx
       * Expected: Should work WITHOUT default.tsx at parent level
       * Reason: No parallel routes exist, so no implicit layout
       */
      it('should navigate to /no-parallel-routes/deeper without 404', async () => {
        const { act, browser } = await createBrowserWithRouterAct('/')

        await act(async () => {
          await navigate(browser, '/no-parallel-routes/deeper')
        })

        await retry(async () => {
          expect(await browser.elementByCss('#modal h3').text()).toContain(
            'TEST CASE 2'
          )
        })
      })

      /**
       * Test Case 3: Has both @sidebar AND page.tsx
       * Structure: @modal/(.)has-both/page.tsx + @sidebar/page.tsx
       * Expected: Should work WITHOUT default.tsx
       * Reason: page.tsx fills children slot, even though @sidebar creates implicit layout
       */
      it('should navigate to /has-both without 404 (has both @sidebar and page)', async () => {
        const { act, browser } = await createBrowserWithRouterAct('/')

        await act(async () => {
          await navigate(browser, '/has-both')
        })

        await retry(async () => {
          expect(await browser.elementByCss('#modal h3').text()).toContain(
            'TEST CASE 3'
          )
        })
      })

      it('should retain named host slots instead of rendering their defaults', async () => {
        const { act, browser } = await createBrowserWithRouterAct('/named-host')

        await browser.elementById('retained-counter').click()

        await act(async () => {
          await navigate(browser, '/named-target')
        })

        expect(await browser.elementById('named-host-modal').text()).toContain(
          'Intercepted named target'
        )
        expect(
          await browser.elementById('named-host-content').text()
        ).toContain('Named content slot')
        expect(
          await browser.elementById('named-host-secondary').text()
        ).toContain('Named secondary slot without a default')
        expect(await browser.elementById('retained-counter').text()).toBe(
          'Retained count: 1'
        )

        await browser.refresh()

        expect(await browser.elementById('canonical-named-target').text()).toBe(
          'Canonical named target'
        )
        expect(await browser.hasElementByCss('#named-host')).toBe(false)
      })

      it('should retain named host slots for an interception catch-all', async () => {
        const { act, browser } = await createBrowserWithRouterAct('/named-host')

        await browser.elementById('retained-counter').click()

        await act(async () => {
          await navigate(browser, '/named-host/named-catchall-target/photo')
        })

        expect(
          await browser.elementById('named-host-catchall-modal').text()
        ).toBe('Intercepted named catch-all target')
        expect(
          await browser.elementById('named-host-content').text()
        ).toContain('Named content slot')
        expect(
          await browser.elementById('named-host-secondary').text()
        ).toContain('Named secondary slot without a default')
        expect(await browser.elementById('named-host-canonical').text()).toBe(
          'Named canonical slot'
        )
        expect(await browser.elementById('retained-counter').text()).toBe(
          'Retained count: 1'
        )
      })

      it('should send and render a real default for a newly entered slot owner', async () => {
        const { act, browser } = await createBrowserWithRouterAct('/')

        await act(async () => {
          await navigate(browser, '/real-default')
        })

        expect(await browser.elementById('real-default-page').text()).toBe(
          'Real default page'
        )
        expect(await browser.elementById('real-default-panel').text()).toBe(
          'Real default panel'
        )
      })

      /**
       * Test Case 4: Has named slots but NO page.tsx (THE KEY BUG CASE)
       * Structure: @modal/(.)test-nested has route targets only under the
       * direct @sidebar and @panel slots, but NO ordinary route branch.
       * Expected: Should work WITHOUT an explicit children default.
       * Reason: The intercepted layout only declares named slots, so explicit
       * children detection should not synthesize a missing slot. Its real
       * @panel default still renders because this is a newly entered owner,
       * not a retained sibling at the interception host.
       *
       * The outer children subtree, including client state, remains mounted
       * because its host slot is represented by the interception retain marker.
       *
       * This must remain a controlled client-navigation test. Without omitting
       * the undeclared children slot:
       * 1. Its synthesized default calls notFound().
       * 2. The server returns a 404 response for the soft navigation.
       * 3. The client router falls back to an MPA navigation.
       * 4. The hard navigation can succeed, hiding the broken soft response.
       *
       * createRouterAct rejects the 404 before the fallback can hide it. The
       * retained counter remaining at 1 also proves that no MPA reload occurred.
       */
      it('should omit undeclared children and preserve parent state', async () => {
        const { act, browser } = await createBrowserWithRouterAct('/')

        await browser.elementById('retained-counter').click()
        expect(await browser.elementById('retained-counter').text()).toBe(
          'Retained count: 1'
        )

        await act(async () => {
          await navigate(browser, '/test-nested')
        })

        await retry(async () => {
          // Modal should show intercepted content
          const modalContent = await browser.elementByCss('#modal').text()
          expect(modalContent).toContain('Intercepted test-nested sidebar')
          expect(modalContent).toContain('Intercepted panel default')
        })
        expect(await browser.hasElementByCss('#unexpected-children-slot')).toBe(
          false
        )

        await retry(async () => {
          // Children slot should still show original page (/)
          const childrenContent = await browser.elementByCss('#children').text()
          expect(childrenContent).toContain('CHILDREN SLOT')
          expect(await browser.elementById('retained-counter').text()).toBe(
            'Retained count: 1'
          )
        })
      })

      /**
       * Test Case 4b: Navigate deeper within intercepted route with parallel routes
       * This validates that navigating to the deeper page directly (from home) works
       */
      it('should navigate to /test-nested/deeper without 404', async () => {
        const { act, browser } = await createBrowserWithRouterAct('/')

        // Navigate directly to the deeper page from home
        await act(async () => {
          await navigate(browser, '/test-nested/deeper')
        })

        await retry(async () => {
          const modalContent = await browser.elementByCss('#modal').text()
          // Should show the deeper intercepted content
          expect(modalContent).toContain('deeper')
        })
      })

      it('should navigate to /regular-route/deeper without 404 (has page)', async () => {
        // Navigate directly via URL to avoid potential link click issues
        const browser = await next.browser('/regular-route/deeper')

        await retry(async () => {
          // Since this is NOT an interception route, we should see the actual page content
          // The page should render in the main content area, not in a modal
          const bodyText = await browser.elementByCss('body').text()
          expect(bodyText).toContain('Regular route without default.tsx')
          expect(bodyText).toContain('deeper/page.tsx')
        })
      })

      /**
       * Explicit layout test: Verify behavior with layout.tsx but no parallel routes
       */
      it('should navigate to /explicit-layout/deeper without 404', async () => {
        const { act, browser } = await createBrowserWithRouterAct('/')

        await act(async () => {
          await navigate(browser, '/explicit-layout/deeper')
        })

        await retry(async () => {
          const modalContent = await browser.elementByCss('#modal').text()
          expect(modalContent).toContain('Explicit layout')
          expect(modalContent).toContain('Deeper page under explicit layout')
        })
      })

      /**
       * Repeated navigation test: Validate __DEFAULT__ marker handling is consistent
       * Uses act() to ensure navigation requests return 200 (not 404). Each forward
       * navigation triggers an RSC request (even if cached), while back navigation
       * uses browser history without network requests.
       */
      it('should handle repeated interceptions without 404', async () => {
        const { act, browser } = await createBrowserWithRouterAct('/')

        for (let i = 0; i < 3; i++) {
          const isAccordionOpen = i > 0

          await expect(
            isAccordionClosed(browser, '/test-nested')
          ).resolves.toBe(!isAccordionOpen)

          // Forward navigation: triggers RSC request (validates no 404)
          await act(
            async () => {
              await navigate(browser, '/test-nested')
            },
            !isAccordionOpen ? undefined : 'no-requests'
          )

          await retry(async () => {
            const modalContent = await browser.elementByCss('#modal').text()
            expect(modalContent).toContain('Intercepted test-nested sidebar')
          })

          // Back navigation: uses browser history, no network request
          await act(async () => {
            await browser.back()
          }, 'no-requests')

          await retry(async () => {
            const url = await browser.url()
            expect(url).toMatch(/\/$/)
          })
        }
      })

      /**
       * Cross-interception navigation
       */
      it('should navigate between different interception routes without 404', async () => {
        const { act, browser } = await createBrowserWithRouterAct('/')

        // First interception
        await act(async () => {
          await navigate(browser, '/test-nested')
        })

        await retry(async () => {
          const modalContent = await browser.elementByCss('#modal').text()
          expect(modalContent).toContain('Intercepted test-nested sidebar')
        })

        // Second interception
        await act(async () => {
          await navigate(browser, '/has-both')
        })

        await retry(async () => {
          const modalContent = await browser.elementByCss('#modal').text()
          expect(modalContent).toContain('TEST CASE 3')
        })
      })
    })
  }
})
