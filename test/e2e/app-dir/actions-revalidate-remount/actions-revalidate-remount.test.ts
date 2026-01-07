import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('actions-revalidate-remount', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not remount the page + loading component when revalidating', async () => {
    const browser = await next.browser('/test')
    const initialTime = await browser.elementById('time').text()

    expect(initialTime).toMatch(/Time: \d+/)

    await browser.elementByCss('button').click()

    await retry(async () => {
      const time = await browser.elementById('time').text()
      expect(time).toMatch(/Time: \d+/)

      // The time should be updated
      expect(initialTime).not.toBe(time)

      const logs = (await browser.log()).filter(
        (log) => log.message === 'Loading Mounted'
      )

      // There should not be any loading logs
      expect(logs.length).toBe(0)
    })
  })
})
