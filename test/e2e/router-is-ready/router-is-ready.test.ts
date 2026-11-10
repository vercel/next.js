import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('router.isReady', () => {
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

  it('isReady should be true immediately for getInitialProps page', async () => {
    const browser = await next.browser('/gip')
    await checkIsReadyValues(browser, [true])
  })

  it('isReady should be true immediately for getInitialProps page with query', async () => {
    const browser = await next.browser('/gip?hello=world')
    await checkIsReadyValues(browser, [true])
  })

  it('isReady should be true immediately for getServerSideProps page', async () => {
    const browser = await next.browser('/gssp')
    await checkIsReadyValues(browser, [true])
  })

  it('isReady should be true immediately for getServerSideProps page with query', async () => {
    const browser = await next.browser('/gssp?hello=world')
    await checkIsReadyValues(browser, [true])
  })

  it('isReady should be true immediately for auto-export page without query', async () => {
    const browser = await next.browser('/auto-export')
    await checkIsReadyValues(browser, [true])
  })

  it('isReady should be true after query update for auto-export page with query', async () => {
    const browser = await next.browser('/auto-export?hello=world')
    await checkIsReadyValues(browser, [false, true])
  })

  it('isReady should be true after query update for dynamic auto-export page without query', async () => {
    const browser = await next.browser('/auto-export/first')
    await checkIsReadyValues(browser, [false, true])
  })

  it('isReady should be true after query update for dynamic auto-export page with query', async () => {
    const browser = await next.browser('/auto-export/first?hello=true')
    await checkIsReadyValues(browser, [false, true])
  })

  it('isReady should be true after query update for getStaticProps page with query', async () => {
    const browser = await next.browser('/gsp?hello=world')
    await checkIsReadyValues(browser, [false, true])
  })

  it('isReady should be true immediately for getStaticProps page without query', async () => {
    const browser = await next.browser('/gsp')
    await checkIsReadyValues(browser, [true])
  })
})
