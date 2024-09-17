import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('asset-prefix', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixture'),
  })

  it('should load the app properly without reloading', async () => {
    const browser = await next.browser('/')
    await browser.eval(`window.__v = 1`)

    expect(await browser.elementByCss('div').text()).toBe('Hello World')

    await check(async () => {
      const logs = await browser.log()
      const hasError = logs.some((log) =>
        log.message.includes('Failed to fetch')
      )
      return hasError ? 'error' : 'success'
    }, 'success')

    expect(await browser.eval(`window.__v`)).toBe(1)
  })

  describe('rewrites', () => {
    it('rewrites that do not start with assetPrefix should still work', async () => {
      const res = await next.fetch('/not-custom-asset-prefix/api/test-json', {})
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('{"message":"test"}')
    })

    it('should respect rewrites that start with assetPrefix', async () => {
      const res = await next.fetch('/custom-asset-prefix/api/test-json', {})
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('{"message":"test"}')
    })
  })
})
