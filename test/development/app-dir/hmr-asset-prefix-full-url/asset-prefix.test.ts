import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app-dir assetPrefix full URL', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    forcedPort: 'random',
  })

  beforeAll(async () => {
    const port = next.forcedPort
    await next.patchFile(
      'next.config.js',
      `module.exports = { assetPrefix: 'http://localhost:${port}' }`
    )
    await next.start()
  })

  it('should not break HMR when asset prefix set to full URL', async () => {
    const browser = await next.browser('/')
    const text = await browser.elementByCss('p').text()
    expect(text).toBe('before edit')

    await next.patchFile('app/page.tsx', (content) => {
      return content.replace('before', 'after')
    })

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe('after edit')
    })
  })
})
