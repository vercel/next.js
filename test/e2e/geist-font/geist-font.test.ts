import { nextTestSetup } from 'e2e-utils'
import { waitForNoRedbox } from 'next-test-utils'

describe('geist-font', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { ENABLE_EXPERIMENTAL_COREPACK: '1' },
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
