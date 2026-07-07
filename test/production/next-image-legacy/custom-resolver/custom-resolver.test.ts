import { nextTestSetup, type Playwright } from 'e2e-utils'

describe('Custom Resolver Tests', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })
  type Browser = Playwright

  function runTests(browser: () => Browser) {
    it('Should use a custom resolver for image URL', async () => {
      expect(
        await browser().elementById('basic-image').getAttribute('src')
      ).toBe('https://customresolver.com/foo.jpg?w~~1024,q~~60')
    })
    it('should add a srcset based on the custom resolver', async () => {
      expect(
        await browser().elementById('basic-image').getAttribute('srcset')
      ).toBe(
        'https://customresolver.com/foo.jpg?w~~480,q~~60 1x, https://customresolver.com/foo.jpg?w~~1024,q~~60 2x'
      )
    })
    it('should support the unoptimized attribute', async () => {
      expect(
        await browser().elementById('unoptimized-image').getAttribute('src')
      ).toBe('https://arbitraryurl.com/foo.jpg')
    })
  }

  describe('SSR Custom Loader Tests', () => {
    let browser: Playwright
    beforeAll(async () => {
      browser = await next.browser('/')
    })
    runTests(() => browser)
  })

  describe('Client-side Custom Loader Tests', () => {
    let browser: Playwright
    beforeAll(async () => {
      browser = await next.browser('/client-side')
    })
    runTests(() => browser)
  })
})
