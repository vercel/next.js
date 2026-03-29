import { nextTestSetup } from 'e2e-utils'

describe('force-dynamic-scoping', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname + '/fixtures',
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  /**
   * Regression test for https://github.com/vercel/next.js/issues/86424
   *
   * A layout marked `force-static` must remain statically rendered even when a
   * nested page is marked `force-dynamic`. Before the fix, `workStore` mutations
   * from the child leaked back to the parent, causing all ancestor layouts to
   * incorrectly enter the PPR postpone path as if they were force-dynamic.
   */
  it('renders a force-static layout at buildtime when a nested page is force-dynamic', async () => {
    const $ = await next.render$(
      '/force-static-parent/force-dynamic-child',
      {},
      {}
    )

    if (isNextDev) {
      // In dev every segment re-renders on every request.
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      // The layout is force-static: it must be prerendered at build time.
      expect($('#layout').text()).toBe('at buildtime')
      // The page is force-dynamic: it must be rendered at runtime.
      expect($('#page').text()).toBe('at runtime')
    }
  })
})
