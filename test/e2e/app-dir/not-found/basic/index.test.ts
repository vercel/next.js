import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'app dir - not-found - basic',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next, isNextDev, isNextStart }) => {
    it("should propagate notFound errors past a segment's error boundary", async () => {
      let browser = await next.browser('/error-boundary')
      await browser.elementByCss('button').click()
      expect(await browser.elementByCss('h1').text()).toBe('Root Not Found')

      browser = await next.browser('/error-boundary/nested/nested-2')
      await browser.elementByCss('button').click()
      expect(await browser.elementByCss('h1').text()).toBe(
        'Not Found (error-boundary/nested)'
      )

      browser = await next.browser('/error-boundary/nested/trigger-not-found')
      expect(await browser.elementByCss('h1').text()).toBe(
        'Not Found (error-boundary/nested)'
      )
    })

    if (isNextStart) {
      it('should include not found client reference manifest in the file trace', async () => {
        const fileTrace = JSON.parse(
          await next.readFile('.next/server/app/_not-found.js.nft.json')
        )

        const isTraced = fileTrace.files.some((filePath) =>
          filePath.includes('_not-found_client-reference-manifest.js')
        )

        expect(isTraced).toBe(true)
      })

      it('should not output /404 in tree view logs', async () => {
        const output = await next.cliOutput
        expect(output).not.toContain('○ /404')
      })

      it('should use root not-found content for 404 html', async () => {
        // static /404 page will use /_not-found content
        const page404 = await next.readFile('.next/server/pages/404.html')
        expect(page404).toContain('Root Not Found')
      })
    }

    const runTests = ({ isEdge }: { isEdge: boolean }) => {
      it('should use the not-found page for non-matching routes', async () => {
        const browser = await next.browser('/random-content')
        expect(await browser.elementByCss('h1').text()).toContain(
          'Root Not Found'
        )
        // should contain root layout content
        expect(await browser.elementByCss('#layout-nav').text()).toBe('Navbar')
      })

      it('should match dynamic route not-found boundary correctly', async () => {
        // `/dynamic` display works
        const browserDynamic = await next.browser('/dynamic')
        expect(await browserDynamic.elementByCss('main').text()).toBe('dynamic')

        // `/dynamic/404` calling notFound() will match the same level not-found boundary
        const browserDynamic404 = await next.browser('/dynamic/404')
        expect(await browserDynamic404.elementByCss('#not-found').text()).toBe(
          'dynamic/[id] not found'
        )

        const browserDynamicId = await next.browser('/dynamic/123')
        expect(await browserDynamicId.elementByCss('#page').text()).toBe(
          'dynamic [id]'
        )
      })

      it('should escalate notFound to parent layout if no not-found boundary present in current layer', async () => {
        const browserDynamic = await next.browser(
          '/dynamic-layout-without-not-found'
        )
        expect(await browserDynamic.elementByCss('h1').text()).toBe(
          'Dynamic with Layout'
        )

        // no not-found boundary in /dynamic-layout-without-not-found, escalate to parent layout to render root not-found
        const browserDynamicId = await next.browser(
          '/dynamic-layout-without-not-found/404'
        )
        expect(await browserDynamicId.elementByCss('h1').text()).toBe(
          'Root Not Found'
        )

        const browserDynamic404 = await next.browser(
          '/dynamic-layout-without-not-found/123'
        )
        expect(await browserDynamic404.elementByCss('#page').text()).toBe(
          'dynamic-layout-without-not-found [id]'
        )
      })

      if (isNextDev) {
        it('should not reload the page', async () => {
          const browser = await next.browser('/random-content')
          const timestamp = await browser.elementByCss('#timestamp').text()

          await new Promise((resolve) => {
            setTimeout(resolve, 3000)
          })

          await check(async () => {
            const newTimestamp = await browser.elementByCss('#timestamp').text()
            return newTimestamp !== timestamp ? 'failure' : 'success'
          }, 'success')
        })

        // Disabling for Edge because it is too flakey.
        // @TODO investigate a proper for fix for this flake
        if (!isEdge) {
          it('should render the 404 page when the file is removed, and restore the page when re-added', async () => {
            const browser = await next.browser('/')
            await check(() => browser.elementByCss('h1').text(), 'My page')
            await next.renameFile('./app/page.js', './app/foo.js')
            await check(
              () => browser.elementByCss('h1').text(),
              'Root Not Found'
            )
            await next.renameFile('./app/foo.js', './app/page.js')
            await check(() => browser.elementByCss('h1').text(), 'My page')
          })
        }
      }

      if (!isNextDev && !isEdge) {
        it('should create the 404 mapping and copy the file to pages', async () => {
          const html = await next.readFile('.next/server/pages/404.html')
          expect(html).toContain('Root Not Found')
          expect(
            await next.readFile('.next/server/pages-manifest.json')
          ).toContain('"pages/404.html"')
        })
      }
    }

    describe('with default runtime', () => {
      runTests({ isEdge: false })
    })

    describe('with runtime = edge', () => {
      let originalLayout = ''

      beforeAll(async () => {
        await next.stop()
        originalLayout = await next.readFile('app/layout.js')
        await next.patchFile(
          'app/layout.js',
          `export const runtime = 'edge'\n${originalLayout}`
        )
        await next.start()
      })
      afterAll(async () => {
        await next.patchFile('app/layout.js', originalLayout)
      })

      runTests({ isEdge: true })
    })
  }
)
