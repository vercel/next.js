import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('router.isReady with appGip', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const checkIsReadyValues = async (browser: any, expected: boolean[] = []) => {
    await retry(async () => {
      const values = JSON.stringify(
        (await browser.eval('window.isReadyValues')).sort()
      )
      expect(values).toBe(JSON.stringify(expected.sort()))
    })
  }

  it('isReady should be true immediately for pages without getStaticProps', async () => {
    const browser = await next.browser('/appGip')
    await checkIsReadyValues(browser, [true])
  })

  it('isReady should be true immediately for pages without getStaticProps, with query', async () => {
    const browser = await next.browser('/appGip?hello=world')
    await checkIsReadyValues(browser, [true])
  })

  it('isReady should be true immediately for getStaticProps page without query', async () => {
    const browser = await next.browser('/gsp')
    await checkIsReadyValues(browser, [true])
  })

  it('isReady should be true after query update for getStaticProps page with query', async () => {
    const browser = await next.browser('/gsp?hello=world')
    await checkIsReadyValues(browser, [false, true])
  })
})
