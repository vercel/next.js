import * as path from 'path'
import { nextTestSetup, type Playwright } from 'e2e-utils'
import { retry } from 'next-test-utils'

async function assertNoConsoleErrors(browser: Playwright) {
  const logs = await browser.log()
  const warningsAndErrors = logs.filter((log) => {
    return log.source === 'warning' || log.source === 'error'
  })

  expect(warningsAndErrors).toEqual([])
}

describe('view-transitions', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/default'),
  })

  it('smoketest', async () => {
    const browser = await next.browser('/basic')

    await assertNoConsoleErrors(browser)
  })

  it('transitionTypes smoketest', async () => {
    const browser = await next.browser('/transition-types')

    await assertNoConsoleErrors(browser)

    // Click the link to navigate to page two
    // The first link causes a sliding transition
    // The second link causes a default transition (cross-fade)
    await browser.elementByCss('a[href="/transition-types/page-two"]').click()

    await assertNoConsoleErrors(browser)
  })

  it('reports a browser-skipped transition for a hidden document', async () => {
    const pageErrors: string[] = []
    const browser = await next.browser('/hidden-document', {
      beforePageLoad: async (page) => {
        page.on('pageerror', (error) => {
          pageErrors.push(`${error.name}: ${error.message}`)
        })
        await page.addInitScript(() => {
          Document.prototype.startViewTransition = function (options) {
            const update =
              typeof options === 'function' ? options : options.update
            const updateCallbackDone = Promise.resolve().then(() => update?.())
            const ready = Promise.reject(
              new DOMException(
                'Skipping view transition because document visibility state is hidden.',
                'InvalidStateError'
              )
            )
            const finished = updateCallbackDone.then(() => undefined)

            return {
              ready,
              updateCallbackDone,
              finished,
              skipTransition() {},
            }
          }
        })
      },
    })

    await browser.elementByCss('button').click()
    expect(
      await browser.waitForElementByCss('[data-page="destination"]').text()
    ).toBe('Destination')

    await retry(() => {
      expect(pageErrors).toEqual([
        'InvalidStateError: Skipping view transition because document visibility state is hidden.',
      ])
    })
  })
})
