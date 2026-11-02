import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { Page } from 'playwright'

declare global {
  interface Window {
    __webpackPublicPathStylesheet: Node | null
  }
}

describe('webpack-public-path', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function changePublicPath(
    browser: Awaited<ReturnType<typeof next.browser>>
  ) {
    await browser.elementByCss('#change-public-path').click()
    await retry(async () => {
      expect(
        JSON.parse(await browser.elementByCss('#public-path-result').text())
      ).toEqual({
        original: '/_next/',
        first: {
          value: 'first-chunk',
          publicPath: '/webpack-public-path-first/',
        },
        second: {
          value: 'second-chunk',
          publicPath: '/webpack-public-path-second/',
        },
        current: '/webpack-public-path-second/',
        shorthand: { __webpack_public_path__: '/webpack-public-path-second/' },
        shadowed: 'local-local/',
        type: 'string',
      })
    })
  }

  it('loads subsequent chunks from each assigned base URL', async () => {
    const responses: { pathname: string; status: number }[] = []
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        page.on('response', (response) => {
          responses.push({
            pathname: new URL(response.url()).pathname,
            status: response.status(),
          })
        })
      },
    })
    await changePublicPath(browser)
    for (const base of [
      '/webpack-public-path-first/',
      '/webpack-public-path-second/',
    ]) {
      expect(
        responses.some(
          (r) =>
            r.pathname.startsWith(base) &&
            r.pathname.endsWith('.js') &&
            r.status === 200
        )
      ).toBe(true)
    }
  })

  it('resolves assets evaluated after an assignment from the assigned path', async () => {
    const browser = await next.browser('/')
    await changePublicPath(browser)
    await browser.elementByCss('#load-asset').click()
    let assetUrl = ''
    await retry(async () => {
      assetUrl = await browser.elementByCss('#asset-url').text()
      expect(assetUrl).toMatch(
        /^\/webpack-public-path-second\/static\/(.+\/)?asset\.[^/]+\.txt/
      )
    })
    const response = await next.fetch(assetUrl)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('webpack-public-path-asset\n')
  })

  it('keeps image URLs evaluated after an assignment on the configured path', async () => {
    const browser = await next.browser('/')
    await changePublicPath(browser)
    await browser.elementByCss('#load-image').click()
    await retry(async () => {
      expect(await browser.elementByCss('#image-src').text()).toMatch(
        /^\/_next\/static\/(.+\/)?image\.[^/]+\.png/
      )
    })
  })

  it('resolves server component assets evaluated after an assignment from the assigned path', async () => {
    const $ = await next.render$('/server-asset')
    expect($('#server-asset-url').text()).toMatch(
      /^https:\/\/cdn\.example\/server\/static\/(.+\/)?asset\.[^/]+\.txt/
    )
  })

  it('loads workers from the assigned path with the configured path inside', async () => {
    let page!: Page
    const browser = await next.browser('/', {
      beforePageLoad(p) {
        page = p
      },
    })
    await changePublicPath(browser)
    const [worker] = await Promise.all([
      page.waitForEvent('worker'),
      browser.elementByCss('#load-worker').click(),
    ])
    expect(new URL(worker.url()).pathname).toMatch(
      /^\/webpack-public-path-second\//
    )
    await retry(async () => {
      expect(await browser.elementByCss('#worker-public-path').text()).toBe(
        '/_next/'
      )
    })
  })

  it('keeps server dynamic imports on the filesystem after an assignment', async () => {
    const response = await next.fetch('/api/public-path')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      original: '/_next/',
      current: 'https://cdn.example/server/',
      value: 'server-dynamic-import',
    })
  })

  it('reads the configured public path in edge routes', async () => {
    const response = await next.fetch('/api/edge-public-path')
    expect(await response.json()).toEqual({ publicPath: '/_next/' })
  })

  it('refreshes an already hydrated route without refetching loaded chunks after assignment', async () => {
    let refreshing = false
    const scripts: string[] = []
    const errors: string[] = []
    const browser = await next.browser('/refresh', {
      beforePageLoad(page) {
        page.on('request', (request) => {
          if (refreshing && request.resourceType() === 'script') {
            scripts.push(request.url())
          }
        })
        page.on('pageerror', (error) => errors.push(error.message))
      },
    })
    await retry(async () => {
      expect(
        await browser.elementByCss('#refresh-loaded').getAttribute('disabled')
      ).toBeNull()
    })
    const value = await browser.elementByCss('#refresh-value').text()
    refreshing = true
    await browser.elementByCss('#refresh-loaded').click()
    await retry(async () => {
      expect(await browser.elementByCss('#refresh-value').text()).not.toBe(
        value
      )
    })
    expect(await browser.elementByCss('#refresh-count').text()).toBe('1')
    expect(await browser.elementByCss('#refresh-public-path').text()).toBe(
      '/unavailable-assets/'
    )
    expect(scripts).toEqual([])
    expect(errors).toEqual([])
  })

  it('loads route client chunks from the assigned path when the original path is unavailable', async () => {
    let assigned = false
    const errors: string[] = []
    const responses: { pathname: string; status: number }[] = []
    const browser = await next.browser('/', {
      async beforePageLoad(page) {
        await page.route('**/_next/static/chunks/**', async (route) => {
          if (assigned && route.request().resourceType() === 'script') {
            await route.abort()
          } else {
            await route.continue()
          }
        })
        page.on('pageerror', (error) => errors.push(error.message))
        page.on('response', (response) => {
          if (assigned) {
            responses.push({
              pathname: new URL(response.url()).pathname,
              status: response.status(),
            })
          }
        })
      },
    })
    await changePublicPath(browser)
    assigned = true
    await browser.elementByCss('#navigate').click()
    await retry(async () => {
      expect(await browser.elementByCss('#destination').text()).toBe(
        '/webpack-public-path-second/'
      )
    })
    // Explicit server-rendered script resources may still use the configured URL.
    // They remain blocked: navigation must not depend on them or throw a chunk error.
    expect(errors).toEqual([])
    expect(
      responses.some(
        (response) =>
          response.pathname.startsWith('/webpack-public-path-second/') &&
          response.pathname.endsWith('.js') &&
          response.status === 200
      )
    ).toBe(true)
  })

  it('finishes a route chunk requested before another public-path assignment', async () => {
    let page!: Page
    let release!: () => void
    const resumed = new Promise<void>((resolve) => {
      release = resolve
    })
    const browser = await next.browser('/', {
      beforePageLoad(p) {
        page = p
      },
    })
    try {
      await changePublicPath(browser)
      await page.route('**/webpack-public-path-second/**', async (route) => {
        await resumed
        await route.continue()
      })
      await Promise.all([
        page.waitForRequest(
          (request) =>
            request.resourceType() === 'script' &&
            new URL(request.url()).pathname.startsWith(
              '/webpack-public-path-second/'
            )
        ),
        browser.elementByCss('#navigate').click(),
      ])
      await browser.elementByCss('#reset-public-path').click()
      await retry(async () => {
        expect(await browser.elementByCss('#public-path-result').text()).toBe(
          '/_next/'
        )
      })
      release()
      await retry(async () => {
        expect(await browser.elementByCss('#destination').text()).toBe(
          '/_next/'
        )
      })
    } finally {
      release()
    }
  })

  it('finishes a chunk requested before the public path changes again', async () => {
    let pending = false
    let release!: () => void
    const resumed = new Promise<void>((resolve) => {
      release = resolve
    })
    const browser = await next.browser('/', {
      async beforePageLoad(page) {
        await page.route('**/webpack-public-path-first/**', async (route) => {
          pending = true
          await resumed
          await route.continue()
        })
      },
    })
    try {
      await browser.elementByCss('#change-public-path').click()
      await retry(() => expect(pending).toBe(true))
      await browser.elementByCss('#switch-pending-public-path').click()
      release()
      await retry(async () => {
        const result = JSON.parse(
          await browser.elementByCss('#public-path-result').text()
        )
        expect(result.first).toEqual({
          value: 'first-chunk',
          publicPath: '/webpack-public-path-second/',
        })
        expect(result.second).toEqual({
          value: 'second-chunk',
          publicPath: '/webpack-public-path-second/',
        })
        expect(result.current).toBe('/webpack-public-path-second/')
      })
    } finally {
      release()
    }
  })

  // Requires local source edits and a live development HMR connection.
  // @force-gate dev
  it('replaces CSS loaded under earlier public paths without leaving stale links', async () => {
    const css = await next.readFile('app/style.module.css')
    const browser = await next.browser('/')
    await browser.elementByCss('#counter').click()
    await browser.elementByCss('#load-styled').click()
    await retry(async () => {
      expect(
        await browser.elementByCss('#styled').getComputedCss('color')
      ).toBe('rgb(10, 20, 30)')
    })
    const markStylesheet = async () => {
      expect(
        await browser.eval(() => {
          for (const sheet of document.styleSheets) {
            if (
              Array.from(sheet.cssRules).some((rule) =>
                rule.cssText.includes('--webpack-public-path-marker')
              )
            ) {
              window.__webpackPublicPathStylesheet = sheet.ownerNode
              return sheet.href
            }
          }
          return null
        })
      ).not.toBeNull()
    }
    try {
      await markStylesheet()
      await changePublicPath(browser)
      await next.patchFile(
        'app/style.module.css',
        css.replace('10, 20, 30', '40, 50, 60')
      )
      await retry(async () => {
        expect(
          await browser.elementByCss('#styled').getComputedCss('color')
        ).toBe('rgb(40, 50, 60)')
        expect(
          await browser.eval(
            () => window.__webpackPublicPathStylesheet?.isConnected === false
          )
        ).toBe(true)
      })
      expect(await browser.elementByCss('#counter').text()).toBe('1')
      await markStylesheet()
      await browser.elementByCss('#reset-public-path').click()
      expect(await browser.elementByCss('#public-path-result').text()).toBe(
        '/_next/'
      )
      // Disposing the CSS dependency must also remove its tag under the previous URL.
      const component = await next.readFile('app/styled.tsx')
      try {
        await next.patchFile(
          'app/styled.tsx',
          component
            .replace("import styles from './style.module.css'", '')
            .replace('className={styles.color}', '')
        )
        await retry(async () => {
          expect(
            await browser.eval(
              () => window.__webpackPublicPathStylesheet?.isConnected === false
            )
          ).toBe(true)
        })
        expect(await browser.elementByCss('#counter').text()).toBe('1')
      } finally {
        await next.patchFile('app/styled.tsx', component)
      }
    } finally {
      await next.patchFile('app/style.module.css', css)
    }
  })
})
