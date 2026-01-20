import { nextTestSetup } from 'e2e-utils'
import { createMultiDomMatcher } from 'next-test-utils'

describe('metadata spread types', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should allow spreading resolved parent metadata into child metadata', async () => {
    const browser = await next.browser('/')
    const matchMultiDom = createMultiDomMatcher(browser)

    // Verify page title from child's generateMetadata
    expect(await browser.eval(`document.title`)).toBe('Page title')

    // Verify openGraph metadata is correctly merged
    await matchMultiDom('meta', 'property', 'content', {
      'og:title': 'Page OG title',
      'og:description': 'Page OG description',
      'og:url': 'https://example.com',
      'og:site_name': 'Example Site',
    })

    // Verify twitter metadata is correctly merged
    await matchMultiDom('meta', 'name', 'content', {
      'twitter:title': 'Page Twitter title',
      'twitter:description': 'Page Twitter description',
      'twitter:site': '@example',
      'twitter:creator': '@creator',
    })
  })

  it('should allow spreading entire resolved parent metadata', async () => {
    const browser = await next.browser('/spread-all')

    // Verify page title is overridden
    expect(await browser.eval(`document.title`)).toBe('Spread all page')

    // Verify parent metadata is inherited
    expect(
      await browser.eval(
        `document.querySelector('meta[name="description"]')?.content`
      )
    ).toBe('Layout description')
  })
})
