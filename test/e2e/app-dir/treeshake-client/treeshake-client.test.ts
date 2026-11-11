import { nextTestSetup } from 'e2e-utils'

// A pure client reexport can have its evaluation fragment pruned. Its facade
// must expose the same references to the graph and codegen so the removed
// dependency does not leave an import to a fragment without a module ID.
describe('treeshake-client', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('builds a client re-export of a side-effect-free external barrel', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementById('motion').text()).toBe('k')
  })
})
