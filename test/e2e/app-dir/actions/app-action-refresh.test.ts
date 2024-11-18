import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app-dir action refresh', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should refresh client cache when refresh() is called in a server action', async () => {
    const browser = await next.browser('/refresh')

    const initialServerTimestamp = await browser
      .elementById('server-timestamp')
      .text()

    expect(initialServerTimestamp).toBeTruthy()

    await browser.elementById('refresh-button').click()

    await retry(async () => {
      const newServerTimestamp = await browser
        .elementById('server-timestamp')
        .text()
      expect(newServerTimestamp).not.toBe(initialServerTimestamp)
      expect(Number(newServerTimestamp)).toBeGreaterThan(
        Number(initialServerTimestamp)
      )
    })
  })
})
