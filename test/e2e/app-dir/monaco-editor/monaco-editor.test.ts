import { nextTestSetup } from 'e2e-utils'

describe('monaco-editor', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'monaco-editor': '^0.52.2',
    },
  })

  // Recommended for tests that need a full browser
  it('should load monaco-editor', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('h1').text()).toBe('Editor Page')
    expect(
      await browser.waitForElementByCss('.monaco-editor').getAttribute('role')
    ).toBe('code')
  })
})
