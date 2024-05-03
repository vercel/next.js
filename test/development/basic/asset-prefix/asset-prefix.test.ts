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
      const messages = await browser
        .log()
        .then((logs: { message: string }[]) => {
          return logs.map((log) => log.message)
        })
        .join('\n')

      expect(messages).toInclude('Failed to fetch')
    })

    expect(await browser.eval(`window.__v`)).toBe(1)
  })
})
