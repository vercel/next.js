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
})
