import { nextTestSetup } from 'e2e-utils'
import {
  assertNoRedbox,
  getRouteTypeFromDevToolsIndicator,
  retry,
} from 'next-test-utils'

describe('async imports in dynamicIO', () => {
  const { next, isNextStart, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextStart) {
    it('does not cause any routes to become (partially) dynamic', async () => {
      const prerenderManifest = JSON.parse(
        await next.readFile('.next/prerender-manifest.json')
      )

      let prerenderedRoutes = Object.keys(prerenderManifest.routes).sort()

      if (process.env.__NEXT_EXPERIMENTAL_PPR === 'true') {
        // For the purpose of this test we don't consider an incomplete shell.
        prerenderedRoutes = prerenderedRoutes.filter((route) => {
          const filename = route.replace(/^\//, '').replace(/^$/, 'index')
          try {
            return next
              .readFileSync(`.next/server/app/${filename}.html`)
              .endsWith('</html>')
          } catch (err) {
            if ('code' in err && err.code === 'ENOENT') {
              // the route was prerendered, but we didn't find a HTML file for it.
              // this means it must be a GET route handler, not a page
              return true
            } else {
              throw err
            }
          }
        })
      }

      expect(prerenderedRoutes).toMatchInlineSnapshot(`
       [
         "/inside-render/client/async-module",
         "/inside-render/client/sync-module",
         "/inside-render/route-handler/async-module",
         "/inside-render/route-handler/sync-module",
         "/inside-render/server/async-module",
         "/inside-render/server/from-node-modules/cjs/sync-module",
         "/inside-render/server/from-node-modules/esm/async-module",
         "/inside-render/server/from-node-modules/esm/sync-module",
         "/inside-render/server/sync-module",
       ]
      `)
    })
  }

  const testPage = async (href: string) => {
    const browser = await next.browser(href)
    expect(await browser.elementByCss('body').text()).toBe('hello')
    if (isNextDev) {
      await retry(async () => {
        // the page should be static
        expect(await getRouteTypeFromDevToolsIndicator(browser)).toBe('Static')
        // we shouldn't get any errors from `spawnDynamicValidationInDev`
        await assertNoRedbox(browser)
      })
    }
  }

  describe('inside a server component', () => {
    it('import of a sync module', async () => {
      await testPage('/inside-render/server/sync-module')
    })

    it('import of module with top-level-await', async () => {
      await testPage('/inside-render/server/async-module')
    })

    describe('dynamic import in node_modules', () => {
      describe('in an ESM package', () => {
        it('import of a sync module', async () => {
          await testPage(
            '/inside-render/server/from-node-modules/esm/sync-module'
          )
        })

        it('import of module with top-level-await', async () => {
          await testPage(
            '/inside-render/server/from-node-modules/esm/async-module'
          )
        })
      })

      describe('in a CJS package', () => {
        // CJS can't do top-level-await, so we're only testing sync modules
        it('import of a sync module', async () => {
          await testPage(
            '/inside-render/server/from-node-modules/cjs/sync-module'
          )
        })
      })
    })
  })

  describe('inside a client component', () => {
    it('import of a sync module', async () => {
      await testPage('/inside-render/client/sync-module')
    })

    it('import of module with top-level-await', async () => {
      await testPage('/inside-render/client/async-module')
    })
  })

  describe('inside a GET route handler', () => {
    it('import of a sync module', async () => {
      const result = await next
        .fetch('/inside-render/route-handler/sync-module')
        .then((res) => res.text())
      expect(result).toBe('hello')
    })

    it('import of module with top-level-await', async () => {
      const result = await next
        .fetch('/inside-render/route-handler/async-module')
        .then((res) => res.text())
      expect(result).toBe('hello')
    })
  })
})
