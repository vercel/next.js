import { nextTestSetup } from 'e2e-utils'

describe('Document and App - With CSP enabled', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should load inline script by hash', async () => {
    const browser = await next.browser('/?withCSP=hash')
    if (global.browserName === 'chrome') {
      const errLog = await browser.log()
      expect(errLog.filter((e) => e.source === 'security')).toEqual([])
    }
  })

  it('should load inline script by nonce', async () => {
    const browser = await next.browser('/?withCSP=nonce')
    if (global.browserName === 'chrome') {
      const errLog = await browser.log()
      expect(errLog.filter((e) => e.source === 'security')).toEqual([])
    }
  })
})
