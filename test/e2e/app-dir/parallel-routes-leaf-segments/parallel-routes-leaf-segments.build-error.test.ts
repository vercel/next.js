import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { assertHasRedbox, retry } from 'next-test-utils'

describe('parallel-routes-leaf-segments-build-error', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'build-error'),
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    it.skip('skip test', () => {})
    return
  }

  if (isNextDev) {
    beforeAll(() => next.start())
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
        await assertHasRedbox(browser)

        await retry(async () => {
          const logs = await browser.log()
          expect(logs).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                message: expect.stringContaining(
                  '/with-children/@header/default.js'
                ),
              }),
            ])
          )
        })
      } else {
        await retry(() => {
          expect(next.cliOutput).toContain('/with-children/@header/default.js')
        })
      }
    })
  })

  describe('Non-leaf segment with route groups and child routes', () => {
    it('should throw MissingDefaultParallelRouteError for parallel slots', async () => {
      if (isNextDev) {
        const browser = await next.browser('/with-groups-and-children/nested')
        await assertHasRedbox(browser)

        await retry(async () => {
          const logs = await browser.log()
          expect(logs).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                message: expect.stringContaining(
                  '/with-groups-and-children/(dashboard)/(overview)/@metrics/default.js'
                ),
              }),
            ])
          )
        })
      } else {
        await retry(() => {
          expect(next.cliOutput).toContain(
            '/with-groups-and-children/(dashboard)/(overview)/@metrics/default.js'
          )
        })
      }
    })
  })
})
