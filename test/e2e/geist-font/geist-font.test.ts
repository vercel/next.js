import { nextTestSetup } from 'e2e-utils'
import { waitForNoRedbox } from 'next-test-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// `geist@latest` has a peer dependency issue with the latest Next.js.
// see: https://github.com/vercel/geist-font/pull/117
// @force-gate !deploy
describe('geist-font', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      geist: 'latest',
    },
  })

  it('should work with geist font in pages router', async () => {
    const browser = await next.browser('/foo')

    await waitForNoRedbox(browser)
    const text = await browser.elementByCss('p').text()
    expect(text).toBe('Foo page')
  })
})
