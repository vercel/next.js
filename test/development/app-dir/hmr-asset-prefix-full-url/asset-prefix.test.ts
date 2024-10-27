import { createNext } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'

describe('app-dir assetPrefix full URL', () => {
  let next, forcedPort
  beforeAll(async () => {
    forcedPort = ((await findPort()) ?? '54321').toString()

    next = await createNext({
      files: __dirname,
      forcedPort,
      nextConfig: {
        assetPrefix: `http://localhost:${forcedPort}`,
      },
    })
  })
  afterAll(() => next.destroy())

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
