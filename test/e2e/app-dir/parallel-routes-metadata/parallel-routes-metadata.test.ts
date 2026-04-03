import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app-dir - parallel-routes-metadata', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should apply layout title template to parallel slot metadata', async () => {
    // Only the @parallel slot defines metadata on this route (children has none).
    // The key fix (#77888) is that the layout's title template is preserved
    // and applied to the parallel slot's title, rather than being reset to null.
    const browser = await next.browser('/test')

    await retry(async () => {
      const title = await browser.eval('document.title')
      // The parallel slot title "Parallel Test" is used, and the
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
