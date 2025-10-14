import * as path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { assertNoRedbox, retry } from 'next-test-utils'

describe('async imports in cacheComponents', () => {
  const { next, isNextStart, isNextDev } = nextTestSetup({
    files: path.join(__dirname, 'bundled'),
  })

  if (isNextStart) {
    it('does not cause any routes to become (partially) dynamic', async () => {
      const prerenderManifest = JSON.parse(
        await next.readFile('.next/prerender-manifest.json')
      )

      // For the purpose of this test we don't consider an incomplete shell.
      const prerenderedRoutes = Object.keys(prerenderManifest.routes)
        .sort()
        .filter((route) => {
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

      expect(prerenderedRoutes).toMatchInlineSnapshot(`
       [
         "/_global-error",
         "/_not-found",
         "/inside-render/client/async-module",
         "/inside-render/client/sync-module",
         "/inside-render/route-handler/async-module",
         "/inside-render/route-handler/sync-module",
         "/inside-render/server/async-module",
         "/inside-render/server/from-node-modules/cjs/sync-module",
         "/inside-render/server/from-node-modules/esm/async-module",
         "/inside-render/server/from-node-modules/esm/sync-module",
         "/inside-render/server/sync-module",
         "/not-instrumented/middleware",
         "/outside-of-render/client/async-module",
         "/outside-of-render/client/sync-module",
         "/outside-of-render/server/async-module",
         "/outside-of-render/server/sync-module",
       ]
      `)
    })
  }

  const testPage = async (href: string) => {
    const browser = await next.browser(href)
    expect(await browser.elementByCss('body').text()).toBe('hello')
    if (isNextDev) {
      await retry(async () => {
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

  describe('outside of render', () => {
    describe('server', () => {
      it('import of a sync module', async () => {
        await testPage('/outside-of-render/server/sync-module')
      })

      it('import of module with top-level-await', async () => {
        await testPage('/outside-of-render/server/async-module')
      })
    })

    describe('client', () => {
      it('import of a sync module', async () => {
        await testPage('/outside-of-render/client/sync-module')
      })

      it('import of module with top-level-await', async () => {
        await testPage('/outside-of-render/client/async-module')
      })
    })
  })

  describe('are not instrumented in edge', () => {
    it('middleware', async () => {
      // indirectly tests the behavior of middleware by rendering a page which the middleware matches
      await testPage('/not-instrumented/middleware')
    })
  })
})

describe('async imports in cacheComponents - external packages', () => {
  const { next, isNextStart, skipped } = nextTestSetup({
    files: path.join(__dirname, 'external'),
    skipDeployment: true,
    skipStart: true,
  })
  if (skipped) return

  // This is currently expected to fail because we can only track `import()` in bundled code,
  // and packages marked as external aren't bundled.
  it('does not instrument import() in external packages', async () => {
    const expectedError = `Error: Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it.`
    if (isNextStart) {
      // in prod, we fail during the build
      await expect(() => next.start()).rejects.toThrow()
      expect(next.cliOutput).toContain(expectedError)
    } else {
      // in dev, we fail when visiting the page
      await next.start()
      await next.browser('/')
      await retry(() => expect(next.cliOutput).toContain(expectedError))
    }
  })
})
