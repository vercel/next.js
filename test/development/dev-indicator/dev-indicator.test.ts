import { nextTestSetup } from 'e2e-utils'
import { gate, retry, waitForStaticIndicator } from 'next-test-utils'

const withCacheComponents = process.env.__NEXT_CACHE_COMPONENTS === 'true'

describe('dev indicator - route type', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('getServerSideProps', () => {
    it('should update when going from dynamic -> static', async () => {
      const browser = await next.browser('/pages/gssp')

      await waitForStaticIndicator(browser, 'Dynamic')

      // validate static -> dynamic updates
      await browser.elementByCss("[href='/pages']").click()

      await waitForStaticIndicator(browser, 'Static')
    })

    it('should update when going from static -> dynamic', async () => {
      const browser = await next.browser('/pages')

      await waitForStaticIndicator(browser, 'Static')

      // validate static -> dynamic updates
      await browser.elementByCss("[href='/pages/gssp']").click()

      await waitForStaticIndicator(browser, 'Dynamic')
    })

    it('should be marked dynamic on first load', async () => {
      const browser = await next.browser('/pages/gssp')

      await waitForStaticIndicator(browser, 'Dynamic')
    })
  })

  describe('getInitialProps', () => {
    it('should be marked dynamic on first load', async () => {
      const browser = await next.browser('/pages/gip')

      await waitForStaticIndicator(browser, 'Dynamic')
    })

    it('should update when going from dynamic -> static', async () => {
      const browser = await next.browser('/pages/gip')

      await waitForStaticIndicator(browser, 'Dynamic')

      await browser.elementByCss("[href='/pages']").click()

      await waitForStaticIndicator(browser, 'Static')
    })

    it('should update when going from static -> dynamic', async () => {
      const browser = await next.browser('/pages')

      await waitForStaticIndicator(browser, 'Static')

      await browser.elementByCss("[href='/pages/gip']").click()

      await waitForStaticIndicator(browser, 'Dynamic')
    })
  })

  describe('getStaticPaths', () => {
    it('should be marked static on first load', async () => {
      const browser = await next.browser('/pages/pregenerated')

      await waitForStaticIndicator(browser, 'Static')
    })

    it('should update when going from dynamic -> static', async () => {
      const browser = await next.browser('/pages/gssp')

      await waitForStaticIndicator(browser, 'Dynamic')

      await browser.elementByCss("[href='/pages/pregenerated']").click()

      await waitForStaticIndicator(browser, 'Static')
    })
  })

  it('should have route type as static by default for static page', async () => {
    const browser = await next.browser('/pages')

    await waitForStaticIndicator(browser, 'Static')
  })

  describe('with App Router', () => {
    it('classifies a completed static not-found page', async () => {
      const path = '/app/no-such-page'
      const response = await next.fetch(path)
      expect(response.status).toBe(404)

      const browser = await next.browser(path)
      const hasCacheComponents = await gate(
        (conditions) => conditions.cacheComponents
      )

      expect(await browser.elementByCss('#not-found-page').text()).toBe(
        'This static page was not found.'
      )
      await waitForStaticIndicator(
        browser,
        hasCacheComponents ? undefined : 'Static'
      )
    })

    it.each([
      ['static', 'Static'],
      ['dynamic', 'Dynamic'],
    ] as const)(
      'preserves the %s route indicator after a Server Action',
      async (route, routeType) => {
        const browser = await next.browser(`/app/static-indicator/${route}`)
        const hasCacheComponents = await gate(
          (conditions) => conditions.cacheComponents
        )
        const expected = hasCacheComponents ? undefined : routeType
        await waitForStaticIndicator(browser, expected)

        await browser.elementByCss('main button').click()
        await retry(async () => {
          expect(await browser.elementByCss('#action-result').text()).toBe(
            'Action complete'
          )
        })
        await waitForStaticIndicator(browser, expected)
      }
    )

    describe('when loading a dynamic page', () => {
      if (withCacheComponents) {
        describe('with Cache Components enabled', () => {
          it('should not show a static indicator', async () => {
            const browser = await next.browser('/app/static-indicator/dynamic')
            await waitForStaticIndicator(browser, undefined)
          })

          it('should still show a static indicator when navigating to a Pages Router page', async () => {
            const browser = await next.browser('/app/static-indicator/dynamic')
            await waitForStaticIndicator(browser, undefined)

            await browser.elementByCss("[href='/pages']").click()

            await retry(async () => {
              expect(await browser.elementByCss('main > p').text()).toBe(
                'hello world'
              )
            })

            await waitForStaticIndicator(browser, 'Static')
          })
        })
      } else {
        describe('with Cache Components disabled', () => {
          it('should be marked dynamic on first load', async () => {
            const browser = await next.browser('/app/static-indicator/dynamic')

            await waitForStaticIndicator(browser, 'Dynamic')
          })

          it('should update when going from dynamic -> static', async () => {
            const browser = await next.browser('/app/static-indicator/dynamic')

            await waitForStaticIndicator(browser, 'Dynamic')

            await browser
              .elementByCss("[href='/app/static-indicator/static']")
              .click()

            await waitForStaticIndicator(browser, 'Static')
          })
        })
      }
    })

    describe('when loading a static page', () => {
      if (withCacheComponents) {
        describe('with Cache Components enabled', () => {
          it('should not show a static indicator', async () => {
            const browser = await next.browser('/app/static-indicator/static')
            await waitForStaticIndicator(browser, undefined)
          })

          it('should still show a static indicator when navigating to a Pages Router page', async () => {
            const browser = await next.browser('/app/static-indicator/static')
            await waitForStaticIndicator(browser, undefined)

            await browser.elementByCss("[href='/pages/gssp']").click()

            await retry(async () => {
              expect(await browser.elementByCss('main > p').text()).toBe(
                'hello world'
              )
            })

            await waitForStaticIndicator(browser, 'Dynamic')
          })
        })
      } else {
        describe('with Cache Components disabled', () => {
          it('should be marked static on first load', async () => {
            const browser = await next.browser('/app/static-indicator/static')

            await waitForStaticIndicator(browser, 'Static')
          })

          it('should update when going from static -> dynamic', async () => {
            const browser = await next.browser('/app/static-indicator/static')

            await waitForStaticIndicator(browser, 'Static')

            await browser
              .elementByCss("[href='/app/static-indicator/dynamic']")
              .click()

            await waitForStaticIndicator(browser, 'Dynamic')
          })
        })
      }
    })
  })
})

describe('dev indicator after a custom server consumes the request', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    startCommand: 'node server.js',
    serverReadyPattern: /- Local:/,
    skipDeployment: true,
  })

  if (skipped) return

  async function expectPendingRoute(
    browser: Awaited<ReturnType<typeof next.browser>>,
    hasCacheComponents: boolean
  ) {
    await browser.locateDevToolsIndicator().click()
    await retry(async () => {
      const pendingRoute = browser.locator(
        'nextjs-portal .dev-tools-indicator-item[title="Loading..."]'
      )
      const routeType = browser.locator(
        'nextjs-portal [data-nextjs-route-type]'
      )
      if (hasCacheComponents) {
        expect(await pendingRoute.count()).toBe(0)
      } else {
        expect(await pendingRoute.count()).toBe(1)
        expect(await pendingRoute.innerText()).toContain('Route')
      }
      expect(await routeType.count()).toBe(0)
    })
  }

  it('keeps a dynamic document Pending until its output finishes', async () => {
    let browser: Awaited<ReturnType<typeof next.browser>> | undefined
    const hasCacheComponents = await gate(
      (conditions) => conditions.cacheComponents
    )
    try {
      browser = await next.browser('/app/static-indicator/gated', {
        waitUntil: 'commit',
        waitHydration: false,
      })

      await retry(async () => {
        expect((await next.fetch('/__gate-arrived')).status).toBe(200)
        expect(await browser.locator('main > p').textContent()).toBe(
          'Loading...'
        )
      })
      await expectPendingRoute(browser, hasCacheComponents)
    } finally {
      expect((await next.fetch('/__release-gate')).status).toBe(200)
    }

    await retry(async () => {
      expect(await browser!.elementByCss('#gate-released').text()).toBe(
        'The gate was released.'
      )
    })
    if (!hasCacheComponents) {
      await retry(async () => {
        expect(
          await browser!
            .locator('nextjs-portal [data-nextjs-route-type]')
            .innerText()
        ).toContain('Dynamic')
      })
    }
  })

  it('keeps a static document Pending until its output finishes', async () => {
    let browser: Awaited<ReturnType<typeof next.browser>> | undefined
    const hasCacheComponents = await gate(
      (conditions) => conditions.cacheComponents
    )
    try {
      browser = await next.browser('/app/static-indicator/gated-static', {
        waitUntil: 'commit',
        waitHydration: false,
      })
      await retry(async () => {
        expect((await next.fetch('/__gate-arrived')).status).toBe(200)
        expect(await browser.locator('main > p').textContent()).toBe(
          'Loading...'
        )
      })
      await expectPendingRoute(browser, hasCacheComponents)
    } finally {
      expect((await next.fetch('/__release-gate')).status).toBe(200)
    }

    expect(await browser!.elementByCss('#static-gate-released').text()).toBe(
      'The static gate was released.'
    )
    if (!hasCacheComponents) {
      await retry(async () => {
        expect(
          await browser!
            .locator('nextjs-portal [data-nextjs-route-type]')
            .innerText()
        ).toContain('Static')
      })
    }
  })

  it('waits for Client Component SSR usage before classifying', async () => {
    let browser: Awaited<ReturnType<typeof next.browser>> | undefined
    const hasCacheComponents = await gate(
      (conditions) => conditions.cacheComponents
    )
    try {
      browser = await next.browser('/app/static-indicator/gated-client', {
        waitUntil: 'commit',
        waitHydration: false,
      })
      await retry(async () => {
        expect((await next.fetch('/__gate-arrived')).status).toBe(200)
        expect(
          await browser.locator('#client-gate-pending').textContent()
        ).toBe('Loading client gate...')
        expect(await browser.locator('#client-dynamic').count()).toBe(0)
      })
      await expectPendingRoute(browser, hasCacheComponents)
    } finally {
      expect((await next.fetch('/__release-gate')).status).toBe(200)
    }

    expect(await browser!.elementByCss('#client-dynamic').text()).toBe(
      'Client SSR used noStore.'
    )
    if (!hasCacheComponents) {
      await retry(async () => {
        expect(
          await browser!
            .locator('nextjs-portal [data-nextjs-route-type]')
            .innerText()
        ).toContain('Dynamic')
      })
    }
  })

  it('classifies App Router document loads and navigation after request-body consumption', async () => {
    const browser = await next.browser('/app/static-indicator/dynamic')
    const hasCacheComponents = await gate(
      (conditions) => conditions.cacheComponents
    )
    await waitForStaticIndicator(
      browser,
      hasCacheComponents ? undefined : 'Dynamic'
    )

    await browser.elementByCss("[href='/app/static-indicator/static']").click()
    await waitForStaticIndicator(
      browser,
      hasCacheComponents ? undefined : 'Static'
    )
  })

  it('reclassifies an App Router page after HMR and restores Static', async () => {
    const browser = await next.browser('/app/static-indicator/static')
    const hasCacheComponents = await gate(
      (conditions) => conditions.cacheComponents
    )
    await waitForStaticIndicator(
      browser,
      hasCacheComponents ? undefined : 'Static'
    )

    const original = await next.readFile(
      'app/app/static-indicator/static/page.tsx'
    )
    await next.patchFile(
      'app/app/static-indicator/static/page.tsx',
      original
        .replace('// await connection()', 'await connection()')
        .replace(
          'This is a static app router page.',
          'This page used connection().'
        )
    )

    try {
      await retry(async () => {
        expect(await browser.elementByCss('main > p').text()).toBe(
          'This page used connection().'
        )
      })
      await waitForStaticIndicator(
        browser,
        hasCacheComponents ? undefined : 'Dynamic'
      )
    } finally {
      await next.patchFile('app/app/static-indicator/static/page.tsx', original)
    }

    await retry(async () => {
      expect(await browser.elementByCss('main > p').text()).toBe(
        'This is a static app router page.'
      )
    })
    await waitForStaticIndicator(
      browser,
      hasCacheComponents ? undefined : 'Static'
    )

    if (!hasCacheComponents) {
      await next.patchFile(
        'app/app/static-indicator/static/page.tsx',
        `export const dynamic = 'force-dynamic'\n${original.replace('This is a static app router page.', 'This page is forced dynamic.')}`
      )
      try {
        await retry(async () => {
          expect(await browser.elementByCss('main > p').text()).toBe(
            'This page is forced dynamic.'
          )
        })
        await waitForStaticIndicator(browser, 'Dynamic')
      } finally {
        await next.patchFile(
          'app/app/static-indicator/static/page.tsx',
          original
        )
      }
    }
  })
})
