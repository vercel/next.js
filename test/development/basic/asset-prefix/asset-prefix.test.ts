import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('asset-prefix', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixture'),
  })

  it('should load the app properly without reloading', async () => {
    const browser = await next.browser('/')
    await browser.eval(`window.__v = 1`)

    expect(await browser.elementByCss('div').text()).toBe('Hello World')

    await retry(async () => {
      const logs = await browser.log()
      const hasError = logs.some((log) =>
        log.message.includes('Failed to fetch')
      )
      expect(hasError).toBeFalsy()
    })

    expect(await browser.eval(`window.__v`)).toBe(1)
  })
})
