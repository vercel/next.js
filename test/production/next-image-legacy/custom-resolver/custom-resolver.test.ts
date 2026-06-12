import { nextTestSetup, type Playwright } from 'e2e-utils'

describe('Custom Resolver Tests', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })
  type Browser = Playwright

  function runTests(getBrowser: () => Promise<Browser>) {
    it('Should use a custom resolver for image URL', async () => {
      const browser = await getBrowser()
      expect(await browser.elementById('basic-image').getAttribute('src')).toBe(
        'https://customresolver.com/foo.jpg?w~~1024,q~~60'
      )
    })
    it('should add a srcset based on the custom resolver', async () => {
      const browser = await getBrowser()
      expect(
        await browser.elementById('basic-image').getAttribute('srcset')
      ).toBe(
        'https://customresolver.com/foo.jpg?w~~480,q~~60 1x, https://customresolver.com/foo.jpg?w~~1024,q~~60 2x'
      )
    })
    it('should support the unoptimized attribute', async () => {
      const browser = await getBrowser()
      expect(
        await browser.elementById('unoptimized-image').getAttribute('src')
      ).toBe('https://arbitraryurl.com/foo.jpg')
    })
  }

  describe('SSR Custom Loader Tests', () => {
    runTests(() => next.browser('/'))
  })

  describe('Client-side Custom Loader Tests', () => {
    runTests(() => next.browser('/client-side'))
  })
})
