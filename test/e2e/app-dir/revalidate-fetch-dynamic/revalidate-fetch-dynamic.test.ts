import { nextTestSetup } from 'e2e-utils'

describe('revalidate-fetch-dynamic', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it.each(['undefined', 'page', 'layout'])(
    'should revalidate fetches when %s is provided to revalidatePath',
    async (type) => {
      const browser = await next.browser('/')
      let initialRandom: string

      await browser.elementByCss("[href='/dynamic/1']").click()

      // grab the random number from the dynamic page
      initialRandom = await browser.waitForElementByCss('#random-number').text()
      expect(initialRandom).toMatch(/\d+/)

      // go back
      await browser.back()

      // revalidate the dynamic page data
      await browser.elementById(`revalidate-${type}`).click()

      // go back to the dynamic page
      await browser.elementByCss("[href='/dynamic/1']").click()

      const newRandom = await browser
        .waitForElementByCss('#random-number')
        .text()
      expect(newRandom).toMatch(/\d+/)

      // The number should be different
      expect(newRandom).not.toEqual(initialRandom)
    }
  )
})
