import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// TODO: findPort not working anyway how
const forcedPort = String(Math.floor(10000 + Math.random() * 90000))

describe('app-dir assetPrefix full URL', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    forcedPort,
    skipDeployment: true,
    nextConfig: {
      assetPrefix: `http://localhost:${forcedPort}`,
    },
  })

  it('should not break when renaming a folder', async () => {
    const browser = await next.browser('/')
    const text = await browser.elementByCss('p').text()
    expect(text).toBe('before edit')

    await next.patchFile('app/page.tsx', (content) => {
      return content.replace('before', 'after')
    })

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toContain('after edit')
    })
  })
})
