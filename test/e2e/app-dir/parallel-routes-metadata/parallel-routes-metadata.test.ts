import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app-dir - parallel-routes-metadata', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should use metadata from the parallel slot when layout renders parallel slot', async () => {
    // When the layout only renders the @parallel slot (not {children}),
    // metadata should come from @parallel/test/page.tsx, not from test/page.tsx.
    // Bug #77888: children slot metadata always overrides parallel slot metadata
    // because resolve-metadata.ts iterates all slots and children comes last.
    const browser = await next.browser('/test')

    await retry(async () => {
      const title = await browser.eval('document.title')
      // Expected: "Parallel Test | My App" (template from layout + title from @parallel/test/page.tsx)
      // Actual (bug): metadata from the parallel slot is not properly resolved
      expect(title).toBe('Parallel Test | My App')
    })
  })
})
