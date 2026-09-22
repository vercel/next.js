import { randomUUID } from 'node:crypto'
import { nextTestSetup } from 'e2e-utils'
import { gate, retry } from 'next-test-utils'
import type { Page } from 'playwright'
import { createRouterAct } from 'router-act'

describe('on-demand-prerender-error-boundary', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it.each([
    ['/prerendered', 'prerendered'],
    ['/on-demand', 'on-demand'],
    ['/global/prerendered', 'prerendered'],
    ['/global/on-demand', 'on-demand'],
  ])('renders %s', async (pathname, slug) => {
    const { browser, response } = await next.browserWithResponse(pathname)

    expect(response.status()).toBe(200)
    expect(await browser.elementByCss('h1').text()).toBe(slug)
  })

  // @force-gate prod && cacheComponents
  describe('partial prerender recovery', () => {
    for (const withSuspense of [false, true]) {
      it(`recovers during the same request after a transient prerender error with Suspense=${withSuspense}`, async () => {
        const slug = `transient-${randomUUID()}`
        const pathname = `/partial/${withSuspense ? 'suspense-' : ''}${slug}`
        const message = `Transient prerender error: ${pathname}`
        const usesGenericErrorPage = await gate(
          (conditions) => conditions.deploy && !conditions.adapter
        )
        let documentRequests = 0
        const { browser, response } = await next.browserWithResponse(pathname, {
          extraHTTPHeaders: { 'accept-language': 'en-GB' },
          beforePageLoad(page) {
            page.on('request', (request) => {
              if (
                request.isNavigationRequest() &&
                new URL(request.url()).pathname === pathname
              ) {
                documentRequests++
              }
            })
          },
        })
        try {
          expect(response.status()).toBe(500)
          expect(response.headers()['cache-control']).toBe(
            usesGenericErrorPage
              ? 'public, max-age=0, must-revalidate'
              : 'private, no-cache, no-store, max-age=0, must-revalidate'
          )

          if (!usesGenericErrorPage) {
            expect(await response.text()).toContain('Recovered during resume')
          }

          await retry(async () => {
            const body = await browser.elementByCss('body').text()
            expect(body).not.toContain(message)
            if (usesGenericErrorPage) {
              expect(body).toContain(
                'A server error occurred. Reload to try again.'
              )
            } else {
              expect(await browser.elementById('content').text()).toBe(
                'Recovered during resume'
              )
              expect(await browser.elementById('request-content').text()).toBe(
                'en-GB'
              )
              expect(body).not.toContain('Partial prerender error boundary')
            }
          })
          expect(documentRequests).toBe(1)

          await retry(async () => {
            const report = await next.fetch(
              `/test-data?key=${encodeURIComponent(`report-${pathname}`)}`
            )
            expect(report.status).toBe(200)
            expect(await report.json()).toMatchObject({
              message,
              request: { path: pathname, method: 'GET' },
              context: {
                routerKind: 'App Router',
                routeType: 'render',
                routePath: expect.stringMatching(
                  /^\/partial\/\[slug\](?:\/page)?$/
                ),
              },
            })
          }, 30_000)
        } finally {
          await browser.close()
        }
      })

      it(`recovers at the same URL and retains the successful page with Suspense=${withSuspense}`, async () => {
        const key = `recovery-${randomUUID()}`
        const pathname = `/partial/${withSuspense ? 'suspense-' : ''}${key}`
        const usesGenericErrorPage = await gate(
          (conditions) => conditions.deploy && !conditions.adapter
        )

        for (const [value, status, language] of [
          ['error', 500, 'en-GB'],
          ['ready', 200, 'de-DE'],
          ['error', 200, 'fr-FR'],
        ] as const) {
          await setData(key, value)
          const { browser, response } = await next.browserWithResponse(
            pathname,
            {
              extraHTTPHeaders: { 'accept-language': language },
            }
          )
          try {
            expect(response.status()).toBe(status)
            if (status === 500 && !usesGenericErrorPage) {
              expect(response.headers()['cache-control']).toBe(
                'private, no-cache, no-store, max-age=0, must-revalidate'
              )
            }
            await retry(async () => {
              if (status === 500) {
                expect(await browser.elementByCss('body').text()).toContain(
                  usesGenericErrorPage
                    ? 'A server error occurred. Reload to try again.'
                    : 'Partial prerender error boundary'
                )
              } else {
                expect(await browser.elementById('content').text()).toBe(
                  'ready'
                )
              }
              if (status !== 500 || !usesGenericErrorPage) {
                expect(
                  await browser.elementById('request-content').text()
                ).toBe(language)
              }
            })
          } finally {
            await browser.close()
          }
        }
      })

      it(`reports the original partial prerender error and route context with Suspense=${withSuspense}`, async () => {
        const slug = `reported-${randomUUID()}`
        const pathname = `/partial/${withSuspense ? 'suspense-' : ''}${slug}`
        const message = `Reported partial prerender error: ${slug}`
        const { browser, response } = await next.browserWithResponse(pathname, {
          extraHTTPHeaders: { 'accept-language': 'en-GB' },
        })
        try {
          expect(response.status()).toBe(500)
          expect(await browser.elementByCss('body').text()).not.toContain(
            message
          )
          const usesGenericErrorPage = await gate(
            (conditions) => conditions.deploy && !conditions.adapter
          )
          if (!usesGenericErrorPage) {
            await retry(async () => {
              expect(await browser.elementByCss('body').text()).toContain(
                'Partial prerender error boundary'
              )
              expect(await browser.elementById('request-content').text()).toBe(
                'en-GB'
              )
            })
          }
        } finally {
          await browser.close()
        }

        await retry(async () => {
          const report = await next.fetch(
            `/test-data?key=${encodeURIComponent(`report-${pathname}`)}`
          )
          expect(report.status).toBe(200)
          expect(await report.json()).toMatchObject({
            message,
            request: { path: pathname, method: 'GET' },
            context: {
              routerKind: 'App Router',
              routeType: 'render',
              routePath: expect.stringMatching(
                /^\/partial\/\[slug\](?:\/page)?$/
              ),
            },
          })
        }, 30_000)
      })
    }

    for (const slug of ['suspense-error', 'error']) {
      it(`renders ${slug} and its dynamic sibling after a failed prefetch`, async () => {
        const pathname = `/partial/${slug}`
        let page: Page | undefined
        const browser = await next.browser('/partial', {
          extraHTTPHeaders: { 'accept-language': 'en-GB' },
          beforePageLoad(browserPage) {
            page = browserPage
          },
        })
        try {
          if (page === undefined) {
            throw new Error('The browser did not provide a Playwright page')
          }

          const act = createRouterAct(page, { allowErrorStatusCodes: [500] })
          await act(async () => {
            await browser
              .elementByCss(`input[data-link-accordion="${pathname}"]`)
              .click()
          })

          // Failed Flight responses cause an MPA navigation, outside act.
          await browser.elementByCss(`a[href="${pathname}"]`).click()
          await page.waitForURL((url) => url.pathname === pathname, {
            timeout: 30_000,
          })
          const usesGenericErrorPage = await gate(
            (conditions) => conditions.deploy && !conditions.adapter
          )
          await retry(async () => {
            expect(await browser.elementByCss('body').text()).toContain(
              usesGenericErrorPage
                ? 'A server error occurred. Reload to try again.'
                : 'Partial prerender error boundary'
            )
            if (!usesGenericErrorPage) {
              expect(await browser.elementById('request-content').text()).toBe(
                'en-GB'
              )
            }
          })
        } finally {
          await browser.close()
        }
      })
    }

    for (const [slug, status, expectedText] of [
      ['healthy', 200, 'Healthy page'],
      ['suspense-error', 500, 'Partial prerender error boundary'],
      ['error', 500, 'Partial prerender error boundary'],
      ['suspense-missing', 200, 'Partial prerender not-found boundary'],
      ['missing', 404, 'Partial prerender not-found boundary'],
    ] as const) {
      it(`resumes ${slug} with the current request outside the page boundary`, async () => {
        const usesGenericErrorPage =
          status === 500 &&
          (await gate((conditions) => conditions.deploy && !conditions.adapter))

        for (const language of ['en-GB', 'de-DE']) {
          const { browser, response } = await next.browserWithResponse(
            `/partial/${slug}`,
            { extraHTTPHeaders: { 'accept-language': language } }
          )
          try {
            expect(response.status()).toBe(status)
            if (status === 500 && !usesGenericErrorPage) {
              expect(response.headers()['cache-control']).toBe(
                'private, no-cache, no-store, max-age=0, must-revalidate'
              )
            }

            await retry(async () => {
              expect(await browser.elementByCss('body').text()).toContain(
                usesGenericErrorPage
                  ? 'A server error occurred. Reload to try again.'
                  : expectedText
              )
              if (!usesGenericErrorPage) {
                expect(
                  await browser.elementById('request-content').text()
                ).toBe(language)
              }
            })
          } finally {
            await browser.close()
          }
        }
      })
    }
  })

  async function setData(key: string, value: string) {
    const pathname = `/test-data?key=${encodeURIComponent(key)}`
    const invalidation = await next.fetch(pathname, { method: 'DELETE' })
    expect(invalidation.status).toBe(204)

    // The platform can finish invalidation and cache writes after the response.
    await retry(async () => {
      const fill = await next.fetch(pathname, { method: 'POST', body: value })
      expect(fill.status).toBe(200)
      expect(await fill.text()).toBe(value)

      const read = await next.fetch(pathname)
      expect(read.status).toBe(200)
      expect(await read.text()).toBe(value)
    }, 30_000)
  }

  // @force-gate prod
  it('recovers at the same URL without invalidating the failed page', async () => {
    const key = `recovery-${randomUUID()}`
    const pathname = `/${key}`
    await setData(key, 'error')

    const { browser, response } = await next.browserWithResponse(pathname)
    try {
      expect(response.status()).toBe(500)
      const expectedText = (await gate(
        (conditions) => conditions.deploy && !conditions.adapter
      ))
        ? 'A server error occurred. Reload to try again.'
        : 'Custom error boundary'
      expect(await browser.elementByCss('body').text()).toContain(expectedText)
    } finally {
      await browser.close()
    }

    await setData(key, 'ready')
    const recovered = await next.browserWithResponse(pathname)
    try {
      expect(recovered.response.status()).toBe(200)
      expect(await recovered.browser.elementById('content').text()).toBe(
        'ready'
      )
    } finally {
      await recovered.browser.close()
    }

    await setData(key, 'error')
    const cached = await next.browserWithResponse(pathname)
    try {
      expect(cached.response.status()).toBe(200)
      expect(await cached.browser.elementById('content').text()).toBe('ready')
    } finally {
      await cached.browser.close()
    }
  })

  // @force-gate prod
  it('reports a failed background prerender while retaining the stale page', async () => {
    const slug = `reported-revalidate-${randomUUID()}`
    const pathname = `/${slug}`
    await setData(slug, 'ready')

    const initial = await next.fetch(pathname)
    expect(initial.status).toBe(200)
    expect(await initial.text()).toContain('<p id="content">ready</p>')

    await setData(slug, 'error')
    await retry(async () => {
      const response = await next.fetch(pathname)
      expect(response.status).toBe(200)
      expect(await response.text()).toContain('<p id="content">ready</p>')

      const report = await next.fetch(
        `/test-data?key=${encodeURIComponent(`report-${pathname}`)}`
      )
      expect(report.status).toBe(200)
      expect(await report.json()).toMatchObject({
        message: `Reported revalidation error: ${slug}`,
        request: { path: pathname, method: 'GET' },
        context: {
          routerKind: 'App Router',
          routeType: 'render',
          routePath: expect.stringMatching(/^\/\[slug\](?:\/page)?$/),
          revalidateReason: expect.stringMatching(/^(stale|on-demand)$/),
        },
      })
    }, 30_000)
  })

  // @force-gate prod
  it('delivers recovery without waiting for onRequestError to finish', async () => {
    const slug = `reported-blocked-${randomUUID()}`
    const pathname = `/${slug}`
    const releaseKey = `release-${pathname}`
    await setData(releaseKey, 'pending')

    try {
      const response = await next.fetch(pathname, {
        signal: AbortSignal.timeout(30_000),
      })
      expect(response.status).toBe(500)
      expect(await response.text()).not.toBe('')

      await retry(async () => {
        const started = await next.fetch(
          `/test-data?key=${encodeURIComponent(`started-${pathname}`)}`
        )
        expect(started.status).toBe(200)
        expect(await started.text()).toBe('started')
      }, 30_000)
    } finally {
      await setData(releaseKey, 'released')
    }

    await retry(async () => {
      const report = await next.fetch(
        `/test-data?key=${encodeURIComponent(`report-${pathname}`)}`
      )
      expect(report.status).toBe(200)
      expect(await report.json()).toMatchObject({
        message: `Reported prerender error: ${slug}`,
        request: { path: pathname, method: 'GET' },
      })
    }, 30_000)
  })

  // @force-gate prod
  it('reports the original prerender error and route context to onRequestError', async () => {
    const slug = `reported-${randomUUID()}`
    const pathname = `/${slug}`
    const message = `Reported prerender error: ${slug}`
    const { browser, response } = await next.browserWithResponse(pathname)
    try {
      expect(response.status()).toBe(500)
      expect(await browser.elementByCss('body').text()).not.toContain(message)
    } finally {
      await browser.close()
    }

    await retry(async () => {
      const report = await next.fetch(
        `/test-data?key=${encodeURIComponent(`report-${pathname}`)}`
      )
      expect(report.status).toBe(200)
      expect(await report.json()).toMatchObject({
        message,
        request: { path: pathname, method: 'GET' },
        context: {
          routerKind: 'App Router',
          routeType: 'render',
          // The renderer uses the route pattern; the handler uses its page
          // file.
          routePath: expect.stringMatching(/^\/\[slug\](?:\/page)?$/),
        },
      })
    }, 30_000)
  })

  for (const [pathname, expected] of [
    ['/error', 'Custom error boundary'],
    ['/global/error', 'Custom global error boundary'],
  ]) {
    it(`renders an error response for ${pathname} when an on-demand prerender throws`, async () => {
      const { browser, response } = await next.browserWithResponse(pathname)

      expect(response.status()).toBe(500)

      const expectedText = (await gate(
        // The legacy builder replaces the error response with the generic error
        // page.
        (conditions) => conditions.deploy && !conditions.adapter
      ))
        ? 'A server error occurred. Reload to try again.'
        : expected

      await retry(async () => {
        expect(await browser.elementByCss('body').text()).toContain(
          expectedText
        )
      })
    })
  }

  it.each([
    { api: 'headers', withSuspense: false },
    { api: 'headers', withSuspense: true },
    { api: 'no-store', withSuspense: false },
    { api: 'no-store', withSuspense: true },
  ])(
    'handles $api with Suspense=$withSuspense during on-demand prerendering',
    async ({ api, withSuspense }) => {
      const pathname = `/${api}${withSuspense ? '-suspense' : ''}`
      const { browser, response } = await next.browserWithResponse(pathname, {
        extraHTTPHeaders: { 'accept-language': 'en-GB' },
      })

      // `unstable_noStore()` is a no-op during Cache Components prerenders.
      const shouldSucceed = await gate(
        (conditions) =>
          conditions.dev ||
          (conditions.cacheComponents && (api === 'no-store' || withSuspense))
      )

      expect(response.status()).toBe(shouldSucceed ? 200 : 500)

      if (shouldSucceed) {
        await retry(async () => {
          expect(await browser.elementById('content').text()).toBe(
            api === 'headers' ? 'en-GB' : 'No-store content'
          )
        })
      } else {
        const expectedText = (await gate(
          (conditions) => conditions.deploy && !conditions.adapter
        ))
          ? 'A server error occurred. Reload to try again.'
          : 'Custom error boundary'

        await retry(async () => {
          expect(await browser.elementByCss('body').text()).toContain(
            expectedText
          )
        })
      }
    }
  )

  it.each([false, true])(
    'handles pending IO inside Suspense with a prerender bailout=%s',
    async (withBailout) => {
      const pathname = `/io-suspense${withBailout ? '-error' : ''}`
      const { browser, response } = await next.browserWithResponse(pathname)
      try {
        const shouldSucceed = await gate(
          (conditions) =>
            conditions.dev || (conditions.cacheComponents && !withBailout)
        )
        expect(response.status()).toBe(shouldSucceed ? 200 : 500)

        if (shouldSucceed) {
          await retry(async () => {
            expect(await browser.elementById('io-content').text()).toBe(
              'Fetched content'
            )
          })
        } else {
          const expectedText = (await gate(
            (conditions) => conditions.deploy && !conditions.adapter
          ))
            ? 'A server error occurred. Reload to try again.'
            : 'Custom error boundary'
          await retry(async () => {
            expect(await browser.elementByCss('body').text()).toContain(
              expectedText
            )
          })
        }
      } finally {
        await browser.close()
      }
    }
  )

  for (const value of ['zero', 'false', 'empty-string', 'null', 'undefined']) {
    // @force-gate prod
    it(`returns an error response when a Client Component throws ${value} during SSR`, async () => {
      const { browser, response } = await next.browserWithResponse(
        `/ssr-${value}`
      )

      const usesGenericErrorPage = await gate(
        (conditions) => conditions.deploy && !conditions.adapter
      )
      expect(response.status()).toBe(500)
      expect(response.headers()['cache-control']).toBe(
        usesGenericErrorPage
          ? 'public, max-age=0, must-revalidate'
          : 'private, no-cache, no-store, max-age=0, must-revalidate'
      )

      const expectedText = usesGenericErrorPage
        ? 'A server error occurred. Reload to try again.'
        : 'Recovered in browser'

      await retry(async () => {
        expect(await browser.elementByCss('body').text()).toContain(
          expectedText
        )
      })
    })
  }

  for (const order of [
    ['prefetch', 'document'],
    ['document', 'prefetch'],
  ]) {
    // @force-gate prefetching
    it(`renders the error boundary on navigation and document load when ${order[0]} is requested first`, async () => {
      const pathname = `/error-${randomUUID()}`
      const usesGenericErrorPage = await gate(
        (conditions) => conditions.deploy && !conditions.adapter
      )
      const expectedText = usesGenericErrorPage
        ? 'A server error occurred. Reload to try again.'
        : 'Custom error boundary'

      for (const request of order) {
        if (request === 'document') {
          const { browser, response } = await next.browserWithResponse(pathname)
          try {
            expect(response.status()).toBe(500)
            expect(response.headers()['cache-control']).toBe(
              usesGenericErrorPage
                ? 'public, max-age=0, must-revalidate'
                : 'private, no-cache, no-store, max-age=0, must-revalidate'
            )
            await retry(async () => {
              expect(await browser.elementByCss('body').text()).toContain(
                expectedText
              )
            })
          } finally {
            await browser.close()
          }
        } else {
          let page: Page | undefined
          const browser = await next.browser(`/global${pathname}`, {
            beforePageLoad(browserPage) {
              page = browserPage
            },
          })
          try {
            if (page === undefined) {
              throw new Error('The browser did not provide a Playwright page')
            }

            const act = createRouterAct(page, { allowErrorStatusCodes: [500] })
            await act(async () => {
              await browser
                .elementByCss(`input[data-link-accordion="${pathname}"]`)
                .click()
            })

            // A failed prefetch can cause an MPA navigation, which act does not
            // support.
            await browser.elementByCss(`a[href="${pathname}"]`).click()
            await page.waitForURL((url) => url.pathname === pathname, {
              timeout: 30_000,
            })
            await retry(async () => {
              expect(await browser.elementByCss('body').text()).toContain(
                expectedText
              )
            })
          } finally {
            await browser.close()
          }
        }
      }
    })
  }
})
