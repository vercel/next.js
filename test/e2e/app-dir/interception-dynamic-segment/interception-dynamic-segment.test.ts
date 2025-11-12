import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { createRouterAct } from 'router-act'

describe('interception-dynamic-segment', () => {
  const { next, isNextStart, isNextDev } = nextTestSetup({
    files: __dirname,
  })

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

    await browser.elementByCss('[href="/foo/1"]').click()
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
    await browser.elementByCss('[href="/foo/1"]').click()
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
      await browser.elementByCss('[href="/foo/1"]').click()
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
          await browser.elementByCss('[href="/foo/1"]').click()
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
          await browser.elementByCss('[href="/simple-page"]').click()
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
          await browser.elementByCss('[href="/has-page"]').click()
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
          await browser
            .elementByCss('[href="/no-parallel-routes/deeper"]')
            .click()
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
          await browser.elementByCss('[href="/has-both"]').click()
        })

        await retry(async () => {
          expect(await browser.elementByCss('#modal h3').text()).toContain(
            'TEST CASE 3'
          )
        })
      })

      /**
       * Test Case 4: Has @sidebar but NO page.tsx (THE KEY BUG CASE)
       * Structure: @modal/(.)test-nested/@sidebar/page.tsx (NO page.tsx at root)
       * Expected: Should work WITHOUT explicit default.tsx (auto null default)
       * Reason: Interception + parallel routes should inject null default
       *
       * This is the critical test! Without the fix:
       * 1. Server returns 404 (default.js calls notFound())
       * 2. Client sees !res.ok in fetch-server-response.ts:229
       * 3. Client triggers doMpaNavigation() - full page reload
       * 4. Navigation still succeeds via MPA, hiding the 404 bug
       *
       * With createRouterAct (no allowErrorStatusCodes), 404 fails the test.
       */
      it('should navigate to /test-nested without 404 (auto null default)', async () => {
        const { act, browser } = await createBrowserWithRouterAct('/')

        await act(async () => {
          await browser.elementByCss('[href="/test-nested"]').click()
        })

        await retry(async () => {
          // Modal should show intercepted content
          const modalContent = await browser.elementByCss('#modal').text()
          expect(modalContent).toContain('Intercepted test-nested sidebar')
        })

        await retry(async () => {
          // Children slot should still show original page (/)
          const childrenContent = await browser.elementByCss('#children').text()
          expect(childrenContent).toContain('CHILDREN SLOT')
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
          await browser.elementByCss('[href="/test-nested/deeper"]').click()
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
          await browser.elementByCss('[href="/explicit-layout/deeper"]').click()
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
          // Forward navigation: triggers RSC request (validates no 404)
          await act(
            async () => {
              await browser.elementByCss('[href="/test-nested"]').click()
            },
            i > 0 ? 'no-requests' : undefined
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
          await browser.elementByCss('[href="/test-nested"]').click()
        })

        await retry(async () => {
          const modalContent = await browser.elementByCss('#modal').text()
          expect(modalContent).toContain('Intercepted test-nested sidebar')
        })

        // Second interception
        await act(async () => {
          await browser.elementByCss('[href="/has-both"]').click()
        }, 'no-requests')

        await retry(async () => {
          const modalContent = await browser.elementByCss('#modal').text()
          expect(modalContent).toContain('TEST CASE 3')
        })
      })
    })
  }
})
