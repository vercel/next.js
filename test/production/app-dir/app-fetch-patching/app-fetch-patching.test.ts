/* eslint-disable jest/no-standalone-expect */
import { waitFor, retry } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

describe('app-fetch-deduping', () => {
  const { next, isTurbopack } = nextTestSetup({ files: __dirname })

  const itSkipTurbopack = isTurbopack ? it.skip : it

  // This solution consistently works in Webpack but is flaky in Turbopack.
  // This will require a follow-up
  itSkipTurbopack(
    'should still properly cache fetches when the user has a custom fetch implementation',
    async () => {
      const browser = await next.browser('/')

      let currentValue: string | undefined
      await retry(async () => {
        const initialRandom = await browser.elementById('random').text()
        expect(initialRandom).toMatch(/^0\.\d+$/)

        await browser.refresh()
        currentValue = await browser.elementById('random').text()
        expect(currentValue).toBe(initialRandom)
      })

      // wait for the revalidation period
      await waitFor(3000)

      await retry(async () => {
        await browser.refresh()
        const finalValue = await browser.elementById('random').text()
        expect(finalValue).not.toBe(currentValue)
      })
    }
  )
})
