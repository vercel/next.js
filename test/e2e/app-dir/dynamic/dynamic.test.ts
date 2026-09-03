import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import path from 'path'

describe('app dir - next/dynamic', () => {
  const { next, isNextStart, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should handle ssr: false in pages when appDir is enabled', async () => {
    const $ = await next.render$('/legacy/no-ssr')
    expect($.html()).not.toContain('navigator')

    const browser = await next.browser('/legacy/no-ssr')
    expect(await browser.waitForElementByCss('#pure-client').text()).toContain(
      'navigator'
    )
  })

  it('should handle next/dynamic in SSR correctly', async () => {
    const $ = await next.render$('/dynamic')
    // filter out the script
    const selector = 'body div'
    const serverContent = $(selector).text()
    // should load chunks generated via async import correctly with React.lazy
    expect(serverContent).toContain('next-dynamic lazy')
    // should support `dynamic` in both server and client components
    expect(serverContent).toContain('next-dynamic dynamic on server')
    expect(serverContent).toContain('next-dynamic dynamic on client')
    expect(serverContent).toContain('next-dynamic server import client')
    expect(serverContent).not.toContain('next-dynamic dynamic no ssr on client')
  })

  it('should handle next/dynamic in hydration correctly', async () => {
    const browser = await next.browser('/dynamic')
    await browser.waitForElementByCss('#css-text-dynamic-no-ssr-client')

    expect(
      await browser.elementByCss('#css-text-dynamic-no-ssr-client').text()
    ).toBe('next-dynamic dynamic no ssr on client:suffix')
  })

  it('should generate correct client manifest for dynamic chunks', async () => {
    const $ = await next.render$('/chunk-loading/server')
    expect($('h1').text()).toBe('hello')
  })

  it('should render loading by default if loading is specified and loader is slow', async () => {
    const $ = await next.render$('/default-loading')

    // First render in dev should show loading, production build will resolve the content.
    expect($('body').text()).toContain(
      isNextDev ? 'Loading...' : 'This is a dynamically imported component'
    )
  })

  it('should not render loading by default', async () => {
    const $ = await next.render$('/default')
    expect($('#dynamic-component').text()).not.toContain('loading')
  })

  it('should ignore next/dynamic in routes', async () => {
    const response = await next.fetch('/api')
    expect(await response.text()).toEqual('Hello function')
  })

  it('should ignore next/dynamic in sitemap', async () => {
    const response = await next.fetch('/sitemap.xml')
    expect(await response.text()).toInclude('<changefreq>yearly</changefreq>')
  })

  if (isNextDev) {
    it('should directly raise error when dynamic component error on server', async () => {
      const pagePath = 'app/default-loading/dynamic-component.js'
      const page = await next.readFile(pagePath)
      await next.patchFile(
        pagePath,
        page.replace('const isDevTest = false', 'const isDevTest = true')
      )
      await retry(async () => {
        const { status } = await next.fetch('/default-loading')
        expect(status).toBe(200)
      })
    })
  }

  describe('no SSR', () => {
    it('should not render client component imported through ssr: false in client components in edge runtime', async () => {
      // noSSR should not show up in html
      const $ = await next.render$('/dynamic-mixed-ssr-false/client-edge')
      expect($('#server-false-client-module')).not.toContain(
        'ssr-false-client-module-text'
      )
      // noSSR should not show up in browser
      const browser = await next.browser('/dynamic-mixed-ssr-false/client-edge')
      expect(
        await browser.elementByCss('#ssr-false-client-module').text()
      ).toBe('ssr-false-client-module-text')

      // in the server bundle should not contain client component imported through ssr: false
      if (isNextStart) {
        const middlewareManifest = JSON.parse(
          await next.readFile('.next/server/middleware-manifest.json')
        )

        const uniquePageFiles = [
          ...new Set<string>(
            middlewareManifest.functions[
              '/dynamic-mixed-ssr-false/client-edge/page'
            ].files
          ),
        ]

        for (const file of uniquePageFiles) {
          const contents = await next.readFile(path.join('.next', file))
          expect(contents).not.toContain('ssr-false-client-module-text')
        }
      }
    })

    it('should not render client component imported through ssr: false in client components', async () => {
      // noSSR should not show up in html
      const $ = await next.render$('/dynamic-mixed-ssr-false/client')
      expect($('#client-false-client-module')).not.toContain(
        'ssr-false-client-module-text'
      )
      // noSSR should not show up in browser
      const browser = await next.browser('/dynamic-mixed-ssr-false/client')
      expect(
        await browser.elementByCss('#ssr-false-client-module').text()
      ).toBe('ssr-false-client-module-text')

      // in the server bundle should not contain both server and client component imported through ssr: false
      if (isNextStart) {
        const pageServerChunk = await next.readFile(
          '.next/server/app/dynamic-mixed-ssr-false/client/page.js'
        )
        expect(pageServerChunk).not.toContain('ssr-false-client-module-text')
      }
    })

    it('should support dynamic import with accessing named exports from client component', async () => {
      const $ = await next.render$('/dynamic/named-export')
      expect($('#client-button').text()).toBe('this is a client button')
    })

    it('should support dynamic import with TLA in client components', async () => {
      const $ = await next.render$('/dynamic/async-client')
      expect($('#client-button').text()).toBe(
        'this is an async client button with SSR'
      )
      expect($('#client-button-no-ssr').text()).toBe('')

      const browser = await next.browser('/dynamic/async-client')
      expect(await browser.elementByCss('#client-button').text()).toBe(
        'this is an async client button with SSR'
      )
      expect(await browser.elementByCss('#client-button-no-ssr').text()).toBe(
        'this is an async client button'
      )
    })
  })

  describe('conditional dynamic loading', () => {
    it('should only include the rendered module script tag', async () => {
      const $ = await next.render$('/conditional-loading/first?component=first')
      const html = $('html').html()
      expect(html).toContain('First Dynamic Component')
      expect(html).not.toContain('Second Dynamic Component')

      const scriptSrcs = $('script[src]')
        .map((_, el) => $(el).attr('src'))
        .get()
      const hasSecondComponentChunk = scriptSrcs.some(
        (src) =>
          src &&
          (src.includes('second-dynamic') || src.includes('second_dynamic'))
      )
      expect(hasSecondComponentChunk).toBe(false)
    })

    it('should only load the rendered module in the browser', async () => {
      const browser = await next.browser(
        '/conditional-loading/first?component=first'
      )
      await browser.waitForElementByCss('#dynamic-content')

      const html = await browser.eval('document.documentElement.innerHTML')
      expect(html).toContain('First Dynamic Component')
      expect(html).not.toContain('Second Dynamic Component')

      await browser.close()
    })

    it('should handle client-side navigation between conditional components', async () => {
      const browser = await next.browser(
        '/conditional-loading/first?component=first'
      )
      await browser.waitForElementByCss('#dynamic-content')

      expect(await browser.elementByCss('#dynamic-content').text()).toContain(
        'First Dynamic Component'
      )

      await browser.elementByCss('#nav-second').click()

      await retry(async () => {
        const text = await browser.elementByCss('#dynamic-content').text()
        expect(text).toContain('Second Dynamic Component')
      })

      const finalContent = await browser.elementByCss('#dynamic-content').text()
      expect(finalContent).not.toContain('First Dynamic Component')

      await browser.close()
    })

    if (isNextStart) {
      it('should not load unnecessary chunks for conditional imports - first component', async () => {
        const browser = await next.browser(
          '/conditional-loading/first?component=first'
        )
        await browser.waitForElementByCss('#dynamic-content')

        const networkRequests = await browser.eval(() => {
          return Array.from(performance.getEntriesByType('resource'))
            .filter((entry) => entry.name.includes('.js'))
            .map((entry) => entry.name)
        })

        const firstComponentRequests = networkRequests.filter(
          (req) =>
            req.includes('first-dynamic') || req.includes('first_dynamic')
        )
        const secondComponentRequests = networkRequests.filter(
          (req) =>
            req.includes('second-dynamic') || req.includes('second_dynamic')
        )

        expect(firstComponentRequests.length).toBeGreaterThan(0)
        expect(secondComponentRequests.length).toBe(0)

        await browser.close()
      })

      it('should not load unnecessary chunks for conditional imports - second component', async () => {
        const browser = await next.browser(
          '/conditional-loading/second?component=second'
        )
        await browser.waitForElementByCss('#dynamic-content')

        const networkRequests = await browser.eval(() => {
          return Array.from(performance.getEntriesByType('resource'))
            .filter((entry) => entry.name.includes('.js'))
            .map((entry) => entry.name)
        })

        const firstComponentRequests = networkRequests.filter(
          (req) =>
            req.includes('first-dynamic') || req.includes('first_dynamic')
        )
        const secondComponentRequests = networkRequests.filter(
          (req) =>
            req.includes('second-dynamic') || req.includes('second_dynamic')
        )

        expect(secondComponentRequests.length).toBeGreaterThan(0)
        expect(firstComponentRequests.length).toBe(0)

        await browser.close()
      })
    }
  })
})
