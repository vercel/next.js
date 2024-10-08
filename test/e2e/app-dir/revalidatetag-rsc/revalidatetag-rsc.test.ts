import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('revalidateTag-rsc', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should revalidate fetch cache if revalidateTag invoked via server action', async () => {
    const browser = await next.browser('/')
    const randomNumber = await browser.elementById('data').text()
    await browser.refresh()
    const randomNumber2 = await browser.elementById('data').text()
    expect(randomNumber).toEqual(randomNumber2)

    await browser.elementByCss('#submit-form').click()

    await retry(async () => {
      const randomNumber3 = await browser.elementById('data').text()
      expect(randomNumber3).not.toEqual(randomNumber)
    })
  })

  it('should revalidate fetch cache if revalidateTag invoked via server component', async () => {
    const browser = await next.browser('/')
    const randomNumber = await browser.elementById('data').text()
    await browser.refresh()
    const randomNumber2 = await browser.elementById('data').text()
    expect(randomNumber).toEqual(randomNumber2)
    await browser.elementByCss('#revalidate-via-page').click()
    await browser.waitForElementByCss('#home')
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#data')
    await retry(async () => {
      // need to refresh to evict client router cache
      await browser.refresh()
      await browser.waitForElementByCss('#data')
      const randomNumber3 = await browser.elementById('data').text()
      expect(randomNumber3).not.toEqual(randomNumber)
    })
  })
})
