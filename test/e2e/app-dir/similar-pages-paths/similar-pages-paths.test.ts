import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
describe('app-dir similar pages paths', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not have conflicts for similar pattern page paths between app and pages', async () => {
    // pages/page and app/page
    const res1 = await next.fetch('/')
    expect(res1.status).toBe(200)
    expect(await res1.text()).toContain('(app/page.js)')

    const res2 = await next.fetch('/page')
    expect(res2.status).toBe(200)
    expect(await res2.text()).toContain('(pages/page.js)')
  })
})
