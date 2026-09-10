import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'
import type * as Playwright from 'playwright'
import { instant } from '@next/playwright'

// @force-gate prefetching
describe.each([
  { cacheComponents: false, partialPrefetching: false },
  { cacheComponents: true, partialPrefetching: false },
  { cacheComponents: true, partialPrefetching: true },
])(
  'draft-mode-prefetch - Cache Components: $cacheComponents, Partial Prefetching: $partialPrefetching',
  ({ cacheComponents, partialPrefetching }) => {
    const { next } = nextTestSetup({
      files: __dirname,
      nextConfig: {
        cacheComponents,
        partialPrefetching,
        experimental: {
          cachedNavigations: cacheComponents,
          exposeTestingApiInProductionBuild: true,
        },
      },
    })

    async function startBrowser(url: string) {
      let act: ReturnType<typeof createRouterAct> | undefined
      let page: Playwright.Page | undefined
      const browser = await next.browser(url, {
        // A new permissions array makes the harness create a fresh context, so
        // neither a paused clock nor the draft cookie can carry over from the
        // previous test.
        permissions: [],
        beforePageLoad(browserPage) {
          page = browserPage
          // Suppression must also cover App Shell requests (prefetch header 3).
          act = createRouterAct(page, { includeAppShellRequests: true })
        },
      })
      if (act === undefined || page === undefined) {
        throw new Error('Router act was not initialized')
      }
      await browser.eval('window.__testDocument = "retained"')
      return { browser, act, page }
    }

    async function queuePrefetches({
      browser,
      act,
    }: Awaited<ReturnType<typeof startBrowser>>) {
      // Hold enough responses to fill the scheduler's viewport request limit.
      await act(async () => {
        for (let index = 0; index < 8; index++) {
          await browser
            .elementByCss(
              `input[data-link-accordion="/article/queued-${index}"]`
            )
            .click()
        }
      }, 'block')

      // This link must wait for the responses held by the outer act scope.
      await act(async () => {
        await browser
          .elementByCss('input[data-link-accordion="/article/queued-8"]')
          .click()
      }, 'no-requests')
    }

    describe.each([
      {
        name: 'auto Link',
        selector: 'input[data-link-accordion="/article/auto"]',
      },
      {
        name: 'prefetch=true Link',
        selector: 'input[data-link-accordion="/article/full"]',
      },
      { name: 'router.prefetch', selector: '#router-prefetch' },
    ])('$name', ({ selector }) => {
      it('issues prefetch requests when draft mode is disabled', async () => {
        const { browser, act } = await startBrowser('/')
        expect(await browser.elementById('draft-mode').text()).toBe(
          'Draft mode: disabled'
        )

        // No navigation occurs, so these requests must come from prefetching.
        await act(async () => {
          await browser.elementByCss(selector).click()
        })
      })
    })

    it('suppresses initial draft-mode prefetches and hover without preventing SPA navigation', async () => {
      const { browser, act } = await startBrowser('/draft')
      expect(new URL(await browser.url()).pathname).toBe('/')
      expect(await browser.elementById('draft-mode').text()).toBe(
        'Draft mode: enabled'
      )

      for (const target of ['auto', 'full']) {
        await act(async () => {
          await browser
            .elementByCss(`input[data-link-accordion="/article/${target}"]`)
            .click()
        }, 'no-requests')
        await act(async () => {
          await browser.locator(`a[href="/article/${target}"]`).hover()
        }, 'no-requests')
      }
      await act(async () => {
        await browser.elementById('router-prefetch').click()
      }, 'no-requests')

      await act(
        async () => {
          await browser.elementByCss('a[href="/article/full"]').click()
        },
        { includes: 'Draft content: full' }
      )
      expect(await browser.elementById('target-content').text()).toBe(
        'Draft content: full'
      )
      expect(await browser.eval('window.__testDocument')).toBe('retained')
      await act(async () => {
        await browser.locator('a[href="/article/auto"]').hover()
        await browser.elementById('router-prefetch').click()
      }, 'no-requests')
    })

    it('updates prefetch suppression before Server Action invalidation and resumes an open Link after disabling', async () => {
      const { browser, act, page } = await startBrowser('/')
      expect(await browser.elementById('draft-mode').text()).toBe(
        'Draft mode: disabled'
      )

      await act(
        async () => {
          await browser
            .elementByCss('input[data-link-accordion="/article/retained"]')
            .click()
        },
        { includes: 'Published content: retained' }
      )
      await pauseClock(page)

      // Only the action request is allowed. Its response must disable
      // prefetching before cache invalidation reschedules visible links.
      await act(async () => {
        await act(
          async () => {
            await browser.elementById('enable-draft-mode').click()
          },
          { includes: 'Draft mode: enabled', block: true }
        )
      }, 'no-requests')
      // Expiring the action's cooldown must not resume prefetches in draft
      // mode.
      await act(async () => {
        await page.clock.fastForward(300)
      }, 'no-requests')
      expect(await browser.elementById('draft-mode').text()).toBe(
        'Draft mode: enabled'
      )
      expect(
        await browser.hasElementByCssSelector(
          'input[data-link-accordion="/article/retained"]:checked'
        )
      ).toBe(true)
      expect(await browser.eval('window.__testDocument')).toBe('retained')

      await act(async () => {
        await browser.locator('a[href="/article/retained"]').hover()
        await browser.elementById('router-prefetch').click()
      }, 'no-requests')

      // The retained Link must resume without a remount, another hover, or a
      // document reload.
      await act(
        async () => {
          await browser.elementById('disable-draft-mode').click()
        },
        { includes: 'Draft mode: disabled' }
      )
      // Re-prefetching resumes through the existing revalidation cooldown.
      await act(
        async () => {
          await page.clock.fastForward(300)
        },
        { includes: 'Published content: retained' }
      )
      expect(await browser.elementById('draft-mode').text()).toBe(
        'Draft mode: disabled'
      )
      expect(
        await browser.hasElementByCssSelector(
          'input[data-link-accordion="/article/retained"]:checked'
        )
      ).toBe(true)
      expect(await browser.eval('window.__testDocument')).toBe('retained')
    })

    it('suppresses prefetches after a redirecting Server Action enables draft mode', async () => {
      const { browser, act, page } = await startBrowser('/')
      expect(await browser.elementById('draft-mode').text()).toBe(
        'Draft mode: disabled'
      )
      await pauseClock(page)

      await act(
        async () => {
          await browser.elementById('enable-and-redirect').click()
        },
        { includes: 'Draft content: redirect' }
      )
      expect(new URL(await browser.url()).pathname).toBe('/article/redirect')
      expect(await browser.elementById('draft-mode').text()).toBe(
        'Draft mode: enabled'
      )
      expect(await browser.elementById('target-content').text()).toBe(
        'Draft content: redirect'
      )
      expect(await browser.eval('window.__testDocument')).toBe('retained')

      await act(async () => {
        await page.clock.fastForward(300)
        await browser
          .elementByCss('input[data-link-accordion="/article/full"]')
          .click()
        await browser.locator('a[href="/article/full"]').hover()
        await browser.elementById('router-prefetch').click()
      }, 'no-requests')
    })

    it('finishes queued prefetches when draft mode remains disabled', async () => {
      const session = await startBrowser('/')
      expect(await session.browser.elementById('draft-mode').text()).toBe(
        'Draft mode: disabled'
      )

      await session.act(
        async () => {
          await queuePrefetches(session)
        },
        { includes: 'Published content: queued-8' }
      )
    })

    it('does not reset draft mode when an earlier unrelated action finishes', async () => {
      const { browser, act, page } = await startBrowser('/')
      await pauseClock(page)

      await act(async () => {
        await act(
          async () => {
            await browser.elementById('unrelated-action').click()
          },
          { includes: 'Unrelated action done', block: true }
        )

        await act(
          async () => {
            await browser
              .elementByCss('input[data-link-accordion="/article/foreground"]')
              .click()
            await browser.elementByCss('a[href="/article/foreground"]').click()
          },
          { includes: 'Published content: foreground' }
        )

        await act(
          async () => {
            await browser.elementById('enable-draft-mode').click()
          },
          { includes: 'Draft mode: enabled' }
        )
      }, 'no-requests')

      expect(await browser.elementById('action-result').text()).toBe(
        'Unrelated action done'
      )
      expect(await browser.elementById('draft-mode').text()).toBe(
        'Draft mode: enabled'
      )
      await act(async () => {
        await page.clock.fastForward(300)
        await browser
          .elementByCss('input[data-link-accordion="/article/full"]')
          .click()
        await browser.elementById('router-prefetch').click()
      }, 'no-requests')
    })

    it('suppresses and resumes prefetches after forwarded draft-mode actions', async () => {
      const { browser, act, page } = await startBrowser('/forwarded/source')
      expect(await browser.elementById('forwarded-actions-ready').text()).toBe(
        'Forwarded actions registered'
      )

      // Only the source worker has these action IDs. The shared layout retains
      // their references after navigation.
      await act(
        async () => {
          await browser
            .elementByCss(
              'input[data-link-accordion="/forwarded/action-target"]'
            )
            .click()
          await browser
            .elementByCss('a[href="/forwarded/action-target"]')
            .click()
        },
        { includes: 'Forwarded target draft mode: disabled' }
      )
      expect(new URL(await browser.url()).pathname).toBe(
        '/forwarded/action-target'
      )

      const actionPaths: string[] = []
      page.on('request', (request) => {
        if (request.method() === 'POST' && request.headers()['next-action']) {
          actionPaths.push(new URL(request.url()).pathname)
        }
      })

      await act(
        async () => {
          await browser
            .elementByCss(
              'input[data-link-accordion="/article/forwarded-retained"]'
            )
            .click()
        },
        { includes: 'Published content: forwarded-retained' }
      )
      await pauseClock(page)

      // The forwarded worker skips the page render. The target must read the
      // updated cookie in a new request.
      await act(
        async () => {
          await browser.elementById('forwarded-enable-draft-mode').click()
        },
        { includes: 'Forwarded target draft mode: enabled' }
      )
      expect(await browser.elementById('forwarded-target-mode').text()).toBe(
        'Forwarded target draft mode: enabled'
      )
      expect(new URL(await browser.url()).pathname).toBe(
        '/forwarded/action-target'
      )

      await act(async () => {
        await page.clock.fastForward(300)
        await browser.locator('a[href="/article/forwarded-retained"]').hover()
      }, 'no-requests')

      await act(
        async () => {
          await browser.elementById('forwarded-disable-draft-mode').click()
        },
        { includes: 'Forwarded target draft mode: disabled' }
      )
      expect(await browser.elementById('forwarded-target-mode').text()).toBe(
        'Forwarded target draft mode: disabled'
      )

      // The retained Link resumes through the native revalidation cooldown
      // without another hover or remount.
      await act(
        async () => {
          await page.clock.fastForward(300)
        },
        { includes: 'Published content: forwarded-retained' }
      )
      expect(
        await browser.hasElementByCssSelector(
          'input[data-link-accordion="/article/forwarded-retained"]:checked'
        )
      ).toBe(true)
      expect(actionPaths).toEqual([
        '/forwarded/action-target',
        '/forwarded/action-target',
      ])
      expect(await browser.eval('window.__testDocument')).toBe('retained')
    })

    it('preserves draft mode after a forwarded action redirects', async () => {
      const { browser, act, page } = await startBrowser('/forwarded/source')
      expect(await browser.elementById('forwarded-actions-ready').text()).toBe(
        'Forwarded actions registered'
      )

      await act(
        async () => {
          await browser
            .elementByCss(
              'input[data-link-accordion="/forwarded/action-target"]'
            )
            .click()
          await browser
            .elementByCss('a[href="/forwarded/action-target"]')
            .click()
        },
        { includes: 'Forwarded target draft mode: disabled' }
      )
      expect(new URL(await browser.url()).pathname).toBe(
        '/forwarded/action-target'
      )
      await pauseClock(page)

      const actionRequest = page.waitForRequest(
        (request) =>
          request.method() === 'POST' &&
          Boolean(request.headers()['next-action'])
      )
      await act(
        async () => {
          await browser.elementById('forwarded-enable-and-redirect').click()
        },
        { includes: 'Draft content: forwarded-redirect' }
      )
      expect(new URL((await actionRequest).url()).pathname).toBe(
        '/forwarded/action-target'
      )
      expect(new URL(await browser.url()).pathname).toBe(
        '/article/forwarded-redirect'
      )
      expect(await browser.elementById('target-content').text()).toBe(
        'Draft content: forwarded-redirect'
      )

      await act(async () => {
        await page.clock.fastForward(300)
        await browser
          .elementByCss('input[data-link-accordion="/article/full"]')
          .click()
        await browser.locator('a[href="/article/full"]').hover()
        await browser.elementById('router-prefetch').click()
      }, 'no-requests')

      // A fresh navigation verifies the browser received the cookie, not just
      // the redirected Flight data.
      //
      // TODO: Fix the adapter's rscSuffix query leak and restore the includes
      // assertion. The first request asks for the article, since the client
      // already has its shared layouts. The extra search parameter makes the
      // returned page differ from the router's prediction. The retry renders
      // the destination from the root layout, so both responses include the
      // article.
      await act(
        async () => {
          await browser.elementByCss('a[href="/article/full"]').click()
        }
        // , { includes: 'Draft content: full' }
      )
      expect(await browser.elementById('target-content').text()).toBe(
        'Draft content: full'
      )
      expect(await browser.eval('window.__testDocument')).toBe('retained')
    })

    it('stops queued prefetches after a Server Action enables draft mode', async () => {
      const session = await startBrowser('/')
      const { browser, act, page } = session
      expect(await browser.elementById('draft-mode').text()).toBe(
        'Draft mode: disabled'
      )

      await act(async () => {
        await queuePrefetches(session)
        await pauseClock(page)

        // Apply the action before the pending prefetch responses reach the
        // client.
        await act(async () => {
          await act(
            async () => {
              await browser.elementById('enable-draft-mode').click()
            },
            { includes: 'Draft mode: enabled', block: true }
          )
        }, 'no-requests')
        await act(async () => {
          await page.clock.fastForward(300)
        }, 'no-requests')
        expect(await browser.elementById('draft-mode').text()).toBe(
          'Draft mode: enabled'
        )
      }, 'no-requests')

      expect(
        await browser.hasElementByCssSelector(
          'input[data-link-accordion="/article/queued-8"]:checked'
        )
      ).toBe(true)
      expect(await browser.eval('window.__testDocument')).toBe('retained')
    })

    it('resumes prefetches if the disable action response body fails', async () => {
      const { browser, act, page } = await startBrowser('/draft')
      await pauseClock(page)
      await act(async () => {
        await browser
          .elementByCss('input[data-link-accordion="/article/retained"]')
          .click()
      }, 'no-requests')

      const failActionBody = async (route: Playwright.Route) => {
        if (route.request().method() === 'POST') {
          const response = await route.fetch()
          await route.fulfill({ response, body: '' })
        } else {
          await route.fallback()
        }
      }
      try {
        await act(
          async () => {
            // Keep the actual action's headers, including its cookie mutation,
            // but close the response before its Flight body arrives.
            await page.route('**/*', failActionBody)
            await browser.elementById('disable-with-catch').click()
            expect(await browser.elementById('action-result').text()).toBe(
              'Action response failed'
            )
            await page.clock.fastForward(300)
          },
          { includes: 'Published content: retained' }
        )
      } finally {
        await page.unroute('**/*', failActionBody)
      }

      expect(
        (await page.context().cookies()).some(
          (cookie) => cookie.name === '__prerender_bypass'
        )
      ).toBe(false)
    })

    if (cacheComponents) {
      it('does not let paused Link prefetches block an instant test navigation', async () => {
        const { browser, act, page } = await startBrowser('/draft')
        await act(async () => {
          for (const target of ['auto', 'full']) {
            await browser
              .elementByCss(`input[data-link-accordion="/article/${target}"]`)
              .click()
          }
          await browser.locator('a[href="/article/auto"]').hover()
        }, 'no-requests')

        await act(async () => {
          await instant(page, async () => {
            await act(async () => {
              await browser.elementByCss('a[href="/article/full"]').click()
            })
            expect(await browser.elementById('target-content').text()).toBe(
              'Draft content: full'
            )
            expect(await browser.eval('window.__testDocument')).toBe('retained')
          })
        })
        expect(await browser.elementById('draft-mode').text()).toBe(
          'Draft mode: enabled'
        )
      })
    }
  }
)

async function pauseClock(page: Playwright.Page) {
  // Keep router-act's idle barrier running while revalidation timers are
  // paused.
  const requestIdleCallback = await page.evaluateHandle(() =>
    window.requestIdleCallback.bind(window)
  )
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.clock.pauseAt(new Date('2026-01-02T00:00:00Z'))
  await page.evaluate((callback) => {
    window.requestIdleCallback = callback
  }, requestIdleCallback)
  await requestIdleCallback.dispose()
}
