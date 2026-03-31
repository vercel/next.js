import { nextTestSetup } from 'e2e-utils'

describe('clientTraceMetadata', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    dependencies: require('./package.json').dependencies,
    // This test sometimes takes longer than the default timeout, extending it bit longer
    // to avoid flakiness.
    startServerTimeout: 15_000,
  })

  describe('app router', () => {
    it('should inject propagation data for a dynamically server-side-rendered page', async () => {
      const $ = await next.render$('/app-router/dynamic-page')
      const headHtml = $.html('head')
      expect(headHtml).toContain(
        '<meta name="my-test-key-1" content="my-test-value-1">'
      )
      expect(headHtml).toContain(
        '<meta name="my-test-key-2" content="my-test-value-2">'
      )
      expect(headHtml).toMatch(
        /<meta name="my-parent-span-id" content="[a-f0-9]{16}">/
      )
      expect(headHtml).not.toContain('non-metadata-key-3')
    })

    it('hard loading a dynamic page twice should yield different dynamic trace data', async () => {
      const browser1 = await next.browser('/app-router/dynamic-page')
      const firstLoadSpanIdContent = await browser1
        .elementByCss('meta[name="my-parent-span-id"]')
        .getAttribute('content')

      const browser2 = await next.browser('/app-router/dynamic-page')
      const secondLoadSpanIdContent = await browser2
        .elementByCss('meta[name="my-parent-span-id"]')
        .getAttribute('content')

      expect(firstLoadSpanIdContent).toMatch(/[a-f0-9]{16}/)
      expect(secondLoadSpanIdContent).toMatch(/[a-f0-9]{16}/)
      expect(firstLoadSpanIdContent).not.toBe(secondLoadSpanIdContent)
    })

    it('should only insert the client trace metadata once', async () => {
      const html = await next.render('/app-router/suspense')
      const matches = html.match(/meta name="my-test-key-1"/g)
      expect(matches.length).toBe(1)
    })

    if (isNextDev) {
      describe('next dev only', () => {
        it('should inject propagation data for a statically server-side-rendered page', async () => {
          const $ = await next.render$('/app-router/static-page')
          const headHtml = $.html('head')
          expect(headHtml).toContain(
            '<meta name="my-test-key-1" content="my-test-value-1">'
          )
          expect(headHtml).toContain(
            '<meta name="my-test-key-2" content="my-test-value-2">'
          )
          expect(headHtml).toMatch(
            /<meta name="my-parent-span-id" content="[a-f0-9]{16}">/
          )
          expect(headHtml).not.toContain('non-metadata-key-3')
        })

        it('soft navigating to a dynamic page should not transform previous propagation data', async () => {
          const browser = await next.browser('/app-router/static-page')

          const initialSpanIdTagContent = await browser
            .elementByCss('meta[name="my-parent-span-id"]')
            .getAttribute('content')

          // We are in dev mode so the static page should contain propagation data
          expect(initialSpanIdTagContent).toMatch(/[a-f0-9]{16}/)

          await browser.elementByCss('#go-to-dynamic-page').click()
          await browser.elementByCss('#dynamic-page-header')

          const updatedSpanIdTagContent = await browser
            .elementByCss('meta[name="my-parent-span-id"]')
            .getAttribute('content')

          expect(initialSpanIdTagContent).toBe(updatedSpanIdTagContent)
        })

        it('soft navigating to a static page should not transform previous propagation data', async () => {
          const browser = await next.browser('/app-router/static-page')

          const initialSpanIdTagContent = await browser
            .elementByCss('meta[name="my-parent-span-id"]')
            .getAttribute('content')

          // We are in dev mode so the static page should contain propagation data
          expect(initialSpanIdTagContent).toMatch(/[a-f0-9]{16}/)

          await browser.elementByCss('#go-to-static-page').click()
          await browser.elementByCss('#static-page-2-header')

          const updatedSpanIdTagContent = await browser
            .elementByCss('meta[name="my-parent-span-id"]')
            .getAttribute('content')

          expect(initialSpanIdTagContent).toBe(updatedSpanIdTagContent)
        })
      })
    } else {
      describe('next start only', () => {
        it('should not inject propagation data for a statically server-side-rendered page', async () => {
          const $ = await next.render$('/app-router/static-page')
          const headHtml = $.html('head')
          expect(headHtml).not.toContain(
            '<meta name="my-test-key-1" content="my-test-value-1">'
          )
          expect($.html('head')).not.toContain(
            '<meta name="my-test-key-2" content="my-test-value-2">'
          )
          expect($.html('head')).not.toMatch(
            /<meta name="my-parent-span-id" content="[a-f0-9]{16}">/
          )
        })

        it('soft navigating to a dynamic page should not transform previous propagation data', async () => {
          const browser = await next.browser('/app-router/static-page')

          await browser.elementByCss('#static-page-header')

          const initialSpanIdTag = await browser.eval(
            'document.querySelector(\'meta[name="my-parent-span-id"]\')'
          )

          // We are in prod mode so we are not expecting propagation data to be present for a static page
          expect(initialSpanIdTag).toBeNull()

          await browser.elementByCss('#go-to-dynamic-page').click()
          await browser.elementByCss('#dynamic-page-header')

          const updatedSpanIdTag = await browser.eval(
            'document.querySelector(\'meta[name="my-parent-span-id"]\')'
          )

          // After the navigation to the dynamic page, there should still be no meta tag with propagation data
          expect(updatedSpanIdTag).toBeNull()
        })

        it('soft navigating to a static page should not transform previous propagation data', async () => {
          const browser = await next.browser('/app-router/static-page')

          await browser.elementByCss('#static-page-header')

          const initialSpanIdTag = await browser.eval(
            'document.querySelector(\'meta[name="my-parent-span-id"]\')'
          )

          // We are in prod mode so we are not expecting propagation data to be present for a static page
          expect(initialSpanIdTag).toBeNull()

          await browser.elementByCss('#go-to-static-page').click()
          await browser.elementByCss('#static-page-2-header')

          const updatedSpanIdTag = await browser.eval(
            'document.querySelector(\'meta[name="my-parent-span-id"]\')'
          )

          // After the navigation to the dynamic page, there should still be no meta tag with propagation data
          expect(updatedSpanIdTag).toBeNull()
        })
      })
    }
  })

  describe('pages router', () => {
    it('should inject propagation data for a dynamically server-side-rendered page', async () => {
      const $ = await next.render$('/pages-router/dynamic-page')
      const headHtml = $.html('head')
      expect(headHtml).toContain(
        '<meta name="my-test-key-1" content="my-test-value-1">'
      )
      expect(headHtml).toContain(
        '<meta name="my-test-key-2" content="my-test-value-2">'
      )
      expect(headHtml).toMatch(
        /<meta name="my-parent-span-id" content="[a-f0-9]{16}">/
      )
      expect(headHtml).not.toContain('non-metadata-key-3')
    })

    it('hard loading a dynamic page twice should yield different dynamic trace data', async () => {
      const browser1 = await next.browser('/pages-router/dynamic-page')
      const firstLoadSpanIdContent = await browser1
        .elementByCss('meta[name="my-parent-span-id"]')
        .getAttribute('content')

      const browser2 = await next.browser('/pages-router/dynamic-page')
      const secondLoadSpanIdContent = await browser2
        .elementByCss('meta[name="my-parent-span-id"]')
        .getAttribute('content')

      expect(firstLoadSpanIdContent).toMatch(/[a-f0-9]{16}/)
      expect(secondLoadSpanIdContent).toMatch(/[a-f0-9]{16}/)
      expect(firstLoadSpanIdContent).not.toBe(secondLoadSpanIdContent)
    })

    if (isNextDev) {
      describe('next dev only', () => {
        it('should inject propagation data for a statically server-side-rendered page', async () => {
          const $ = await next.render$('/pages-router/static-page')
          const headHtml = $.html('head')
          expect(headHtml).toContain(
            '<meta name="my-test-key-1" content="my-test-value-1">'
          )
          expect(headHtml).toContain(
            '<meta name="my-test-key-2" content="my-test-value-2">'
          )
          expect(headHtml).toMatch(
            /<meta name="my-parent-span-id" content="[a-f0-9]{16}">/
          )
          expect(headHtml).not.toContain('non-metadata-key-3')
        })

        it('soft navigating to a dynamic page should not transform previous propagation data', async () => {
          const browser = await next.browser('/pages-router/static-page')

          const initialSpanIdTagContent = await browser
            .elementByCss('meta[name="my-parent-span-id"]')
            .getAttribute('content')

          // We are in dev mode so the static page should contain propagation data
          expect(initialSpanIdTagContent).toMatch(/[a-f0-9]{16}/)

          await browser.elementByCss('#go-to-dynamic-page').click()
          await browser.elementByCss('#dynamic-page-header')

          const updatedSpanIdTagContent = await browser
            .elementByCss('meta[name="my-parent-span-id"]')
            .getAttribute('content')

          expect(initialSpanIdTagContent).toBe(updatedSpanIdTagContent)
        })

        it('soft navigating to a static page should not transform previous propagation data', async () => {
          const browser = await next.browser('/pages-router/static-page')

          const initialSpanIdTagContent = await browser
            .elementByCss('meta[name="my-parent-span-id"]')
            .getAttribute('content')

          // We are in dev mode so the static page should contain propagation data
          expect(initialSpanIdTagContent).toMatch(/[a-f0-9]{16}/)

          await browser.elementByCss('#go-to-static-page').click()
          await browser.elementByCss('#static-page-2-header')

          const updatedSpanIdTagContent = await browser
            .elementByCss('meta[name="my-parent-span-id"]')
            .getAttribute('content')

          expect(initialSpanIdTagContent).toBe(updatedSpanIdTagContent)
        })
      })
    } else {
      describe('next start only', () => {
        it('should not inject propagation data for a statically server-side-rendered page', async () => {
          const $ = await next.render$('/pages-router/static-page')
          const headHtml = $.html('head')
          expect(headHtml).not.toContain(
            '<meta name="my-test-key-1" content="my-test-value-1">'
          )
          expect($.html('head')).not.toContain(
            '<meta name="my-test-key-2" content="my-test-value-2">'
          )
          expect($.html('head')).not.toMatch(
            /<meta name="my-parent-span-id" content="[a-f0-9]{16}">/
          )
        })

        it('soft navigating to a dynamic page should not transform previous propagation data', async () => {
          const browser = await next.browser('/pages-router/static-page')

          await browser.elementByCss('#static-page-header')

          const initialSpanIdTag = await browser.eval(
            'document.querySelector(\'meta[name="my-parent-span-id"]\')'
          )

          // We are in prod mode so we are not expecting propagation data to be present for a static page
          expect(initialSpanIdTag).toBeNull()

          await browser.elementByCss('#go-to-dynamic-page').click()
          await browser.elementByCss('#dynamic-page-header')

          const updatedSpanIdTag = await browser.eval(
            'document.querySelector(\'meta[name="my-parent-span-id"]\')'
          )

          // After the navigation to the dynamic page, there should still be no meta tag with propagation data
          expect(updatedSpanIdTag).toBeNull()
        })

        it('soft navigating to a static page should not transform previous propagation data', async () => {
          const browser = await next.browser('/pages-router/static-page')

          await browser.elementByCss('#static-page-header')

          const initialSpanIdTag = await browser.eval(
            'document.querySelector(\'meta[name="my-parent-span-id"]\')'
          )

          // We are in prod mode so we are not expecting propagation data to be present for a static page
          expect(initialSpanIdTag).toBeNull()

          await browser.elementByCss('#go-to-static-page').click()
          await browser.elementByCss('#static-page-2-header')

          const updatedSpanIdTag = await browser.eval(
            'document.querySelector(\'meta[name="my-parent-span-id"]\')'
          )

          // After the navigation to the dynamic page, there should still be no meta tag with propagation data
          expect(updatedSpanIdTag).toBeNull()
        })
      })
    }
  })
})
