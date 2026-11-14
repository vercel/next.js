import { nextTestSetup } from 'e2e-utils'

describe('build-explicit-cpus', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  if (!isNextStart) {
    it('is only relevant for next build', () => {})
    return
  }

  it('should honor an explicit experimental.cpus for static generation', async () => {
    // The app only has a handful of routes, but one of them prerenders many
    // paths, so the worker count must not be capped by the route count.
    expect(next.cliOutput).toContain('Generating static pages using 8 workers')
  })

  it('should prerender all generated params', async () => {
    const $ = await next.render$('/item-49')
    expect($('p').text()).toBe('item-49')
  })
})
