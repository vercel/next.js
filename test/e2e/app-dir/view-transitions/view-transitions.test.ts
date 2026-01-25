import * as path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { Playwright } from 'next-webdriver'

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
})
