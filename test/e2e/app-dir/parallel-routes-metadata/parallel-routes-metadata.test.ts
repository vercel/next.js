import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app-dir - parallel-routes-metadata', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should apply layout title template to parallel slot metadata', async () => {
    // When both children and @parallel slots define metadata,
    // the parallel slot title wins because it is processed after children.
    // The key fix (#77888) is that the layout's title template is preserved
    // and applied, rather than being reset to null by intermediate pages.
    const browser = await next.browser('/test')

    await retry(async () => {
      const title = await browser.eval('document.title')
      // The parallel slot title "Parallel Test" takes precedence, and the
      // layout's template "%s | My App" is correctly applied to it.
      expect(title).toBe('Parallel Test | My App')
    })
  })

  it('should apply layout title template to parallel slot when children has no metadata', async () => {
    // When only the @parallel slot defines metadata (children page has none),
    // the parallel slot's title should be used with the layout's template.
    // This proves the template propagates correctly to parallel slots.
    const browser = await next.browser('/no-children-meta')

    await retry(async () => {
      const title = await browser.eval('document.title')
      expect(title).toBe('Only Parallel | My App')
    })
  })
})
