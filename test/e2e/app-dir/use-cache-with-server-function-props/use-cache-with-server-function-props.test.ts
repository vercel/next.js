import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const isoDateRegExp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const randomRegExp = /^\d+\.\d+$/

describe('use-cache-with-server-function-props', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should be able to use inline server actions as props', async () => {
    const browser = await next.browser('/server-action')

    await browser.elementById('submit-button-hi').click()
    await retry(async () => {
      expect(await browser.elementById('hi').text()).toMatch('Hi, World!')
    })

    await browser.elementById('submit-button-hello').click()
    await retry(async () => {
      expect(await browser.elementById('hello').text()).toMatch('Hello, World!')
    })
  })

  it('should be able to use nested cache functions as props', async () => {
    const browser = await next.browser('/nested-cache')

    await browser.elementById('submit-button-date').click()
    await retry(async () => {
      expect(await browser.elementById('date').text()).toMatch(isoDateRegExp)
    })

    await browser.elementById('submit-button-random').click()
    await retry(async () => {
      expect(await browser.elementById('random').text()).toMatch(randomRegExp)
    })
  })
})
