import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('server-external-packages-url-asset', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'external-url-asset': 'file:./external-url-asset',
    },
  })

  it('should emit a new URL() asset from a package in serverExternalPackages', async () => {
    const browser = await next.browser('/')
    let url = ''
    await retry(async () => {
      url = await browser.elementByCss('#url').text()
      expect(url).toMatch(/worker.*\.mjs$/)
    })
    const res = await next.fetch(url)
    expect(res.status).toBe(200)
    expect(next.cliOutput).not.toContain("can't be external")
  })
})
