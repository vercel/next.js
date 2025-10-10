import path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('parallel-routes-leaf-segments-build-error', () => {
  const { next, isNextDev, skipped, isTurbopack, isRspack } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'build-error'),
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    it.skip('skip test', () => {})
    return
  }

  if (isNextDev) {
    beforeEach(() => next.start())
    afterEach(() => next.stop())
  } else {
    beforeAll(async () => {
      try {
        await next.build()
      } catch {
        // Expect build error
      }
    })
  }

  describe('Non-leaf segment with child routes', () => {
    it('should throw MissingDefaultParallelRouteError for @header slot', async () => {
      if (isNextDev) {
        const browser = await next.browser('/with-children/child')
        if (isTurbopack) {
          await expect(browser).toDisplayRedbox(`
           {
             "description": "Missing required default.js file for parallel route at /with-children/@header",
             "environmentLabel": null,
             "label": "Build Error",
             "source": "./app/with-children/@header
           Missing required default.js file for parallel route at /with-children/@header
           The parallel route slot "@header" is missing a default.js file. When using parallel routes, each slot must have a default.js file to serve as a fallback.
           Create a default.js file at: /with-children/@header/default.js
           https://nextjs.org/docs/messages/slot-missing-default",
             "stack": [],
           }
          `)
        } else if (isRspack) {
          await expect(browser).toDisplayRedbox(`
           {
             "description": "  × Missing required default.js file for parallel route at app/with-children/@header",
             "environmentLabel": null,
             "label": "Build Error",
             "source": "app/with-children/child/page.tsx
             × Missing required default.js file for parallel route at app/with-children/@header
             │ The parallel route slot "@header" is missing a default.js file. When using parallel routes, each slot must have a default.js file to serve as a fallback.
             │
             │ Create a default.js file at: app/with-children/@header/default.js
             │
             │ https://nextjs.org/docs/messages/slot-missing-default",
             "stack": [],
           }
          `)
        } else {
          await expect(browser).toDisplayRedbox(`
           {
             "description": "Missing required default.js file for parallel route at app/with-children/@header",
             "environmentLabel": null,
             "label": "Build Error",
             "source": "app/with-children/child/page.tsx
           Missing required default.js file for parallel route at app/with-children/@header
           The parallel route slot "@header" is missing a default.js file. When using parallel routes, each slot must have a default.js file to serve as a fallback.
           Create a default.js file at: app/with-children/@header/default.js
           https://nextjs.org/docs/messages/slot-missing-default",
             "stack": [],
           }
          `)
        }
      }

      expect(next.cliOutput).toContain('/with-children/@header/default.js')
    })
  })

  describe('Non-leaf segment with route groups and child routes', () => {
    it('should throw MissingDefaultParallelRouteError for parallel slots', async () => {
      if (isNextDev) {
        const browser = await next.browser('/with-groups-and-children/nested')
        if (isTurbopack) {
          await expect(browser).toDisplayRedbox(`
           {
             "description": "Missing required default.js file for parallel route at /with-children/@header",
             "environmentLabel": null,
             "label": "Build Error",
             "source": "./app/with-children/@header
           Missing required default.js file for parallel route at /with-children/@header
           The parallel route slot "@header" is missing a default.js file. When using parallel routes, each slot must have a default.js file to serve as a fallback.
           Create a default.js file at: /with-children/@header/default.js
           https://nextjs.org/docs/messages/slot-missing-default",
             "stack": [],
           }
          `)
        } else if (isRspack) {
          await expect(browser).toDisplayRedbox(`
           {
             "description": "  × Missing required default.js file for parallel route at app/with-groups-and-children/(dashboard)/(overview)/@metrics",
             "environmentLabel": null,
             "label": "Build Error",
             "source": "app/with-groups-and-children/(dashboard)/(overview)/nested/page.tsx
             × Missing required default.js file for parallel route at app/with-groups-and-children/(dashboard)/(overview)/@metrics
             │ The parallel route slot "@metrics" is missing a default.js file. When using parallel routes, each slot must have a default.js file to serve as a fallback.
             │
             │ Create a default.js file at: app/with-groups-and-children/(dashboard)/(overview)/@metrics/default.js
             │
             │ https://nextjs.org/docs/messages/slot-missing-default",
             "stack": [],
           }
          `)
        } else {
          await expect(browser).toDisplayRedbox(`
           {
             "description": "Missing required default.js file for parallel route at app/with-groups-and-children/(dashboard)/(overview)/@metrics",
             "environmentLabel": null,
             "label": "Build Error",
             "source": "app/with-groups-and-children/(dashboard)/(overview)/nested/page.tsx
           Missing required default.js file for parallel route at app/with-groups-and-children/(dashboard)/(overview)/@metrics
           The parallel route slot "@metrics" is missing a default.js file. When using parallel routes, each slot must have a default.js file to serve as a fallback.
           Create a default.js file at: app/with-groups-and-children/(dashboard)/(overview)/@metrics/default.js
           https://nextjs.org/docs/messages/slot-missing-default",
             "stack": [],
           }
          `)
        }
      }

      expect(next.cliOutput).toContain(
        '/with-groups-and-children/(dashboard)/(overview)/@metrics/default.js'
      )
    })
  })
})
