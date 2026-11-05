import { nextTestSetup } from 'e2e-utils'
import { waitForNoErrorToast } from 'next-test-utils'

describe('cache-components-sync-fs-reads', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  // `fs.readFileSync(path)` closes the file with `fs.closeSync`. In the dev
  // server, graceful-fs (loaded by the bundler) used to wrap `fs.closeSync` with
  // a `Date.now()` call, which was reported as sync IO in the user's page.
  it('does not report sync IO for fs.readFileSync without an encoding', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('hello from data.txt')

    if (isNextDev) {
      await waitForNoErrorToast(browser)
    }
    expect(next.cliOutput).not.toContain('encountered the unstable value')
  })
})
