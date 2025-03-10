import { nextTestSetup } from 'e2e-utils'
import {
  getRedboxDescription,
  openRedbox,
  assertNoRedbox,
  retry,
} from 'next-test-utils'

describe('Dynamic IO Dev Errors', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not show a red box error on the SSR render', async () => {
    const browser = await next.browser('/cached')
    await assertNoRedbox(browser)
    let latestValue = await browser.elementByCss('#value').text()

    await browser.refresh()
    await assertNoRedbox(browser)
    let priorValue = latestValue
    latestValue = await browser.elementByCss('#value').text()

    expect(latestValue).toBe(priorValue)

    await browser.elementByCss('#refresh').click()
    await retry(async () => {
      await assertNoRedbox(browser)
      let priorValue = latestValue
      latestValue = await browser.elementByCss('#value').text()
      expect(latestValue).not.toBe(priorValue)
    })

    await browser.elementByCss('#refresh').click()
    await retry(async () => {
      await assertNoRedbox(browser)
      let priorValue = latestValue
      latestValue = await browser.elementByCss('#value').text()
      expect(latestValue).not.toBe(priorValue)
    })

    // TODO CI is too flakey to run tests like this b/c timing cannot be controlled.
    // we need to land this so we're deactivating these assertions for now.
    // you should be able to reproduce the assertions below when testing locally

    // await browser.elementByCss('#reload').click()
    // await retry(async () => {
    //   await assertNoRedbox(browser)
    //   let priorValue = latestValue
    //   latestValue = await browser.elementByCss('#value').text()
    //   expect(latestValue).toBe(priorValue)
    // })

    // await browser.elementByCss('#reload').click()
    // await retry(async () => {
    //   await assertNoRedbox(browser)
    //   let priorValue = latestValue
    //   latestValue = await browser.elementByCss('#value').text()
    //   expect(latestValue).toBe(priorValue)
    // })

    // await browser.elementByCss('#refresh').click()
    // await retry(async () => {
    //   await assertNoRedbox(browser)
    //   let priorValue = latestValue
    //   latestValue = await browser.elementByCss('#value').text()
    //   expect(latestValue).not.toBe(priorValue)
    // })g
  })

  it('should show a red box error on the SSR render when data is uncached', async () => {
    let desc

    const browser = await next.browser('/uncached')
    await openRedbox(browser)
    desc = await getRedboxDescription(browser)

    expect(desc).toContain(
      'Route "/uncached": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it'
    )

    await browser.refresh()
    await openRedbox(browser)
    desc = await getRedboxDescription(browser)

    expect(desc).toContain(
      'Route "/uncached": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it'
    )
  })
})
