import { nextTestSetup, isNextDev } from 'e2e-utils'

describe('Image Component assetPrefix Tests', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  it('should include assetPrefix when placeholder=blur during dev', async () => {
    if (!isNextDev) return
    const browser = await next.browser('/')
    const id = 'test1'
    const bgImage = await browser.eval(
      `document.getElementById('${id}').style['background-image']`
    )
    if (isTurbopack) {
      expect(bgImage).toContain('data:image/svg+xml;')
    } else {
      expect(bgImage).toMatch(
        /\/_next\/image\?url=https%3A%2F%2Fexample\.vercel\.sh%2Fpre%2F_next%2Fstatic%2Fmedia%2Ftest(.+).jpg&w=8&q=70/
      )
    }
  })

  it('should use base64 data url with placeholder=blur during production', async () => {
    if (isNextDev) return
    const browser = await next.browser('/')
    const id = 'test1'
    const bgImage = await browser.eval(
      `document.getElementById('${id}').style['background-image']`
    )
    expect(bgImage).toMatch('data:image/jpeg;base64')
  })

  it('should not log a deprecation warning about using `images.domains`', async () => {
    await next.browser('/')
    const warningMessage =
      'The "images.domains" configuration is deprecated. Please use "images.remotePatterns" configuration instead.'
    expect(next.cliOutput).not.toContain(warningMessage)
  })
})
