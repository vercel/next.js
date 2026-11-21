import { nextTestSetup } from 'e2e-utils'

// `experimental.turbopackSingleDevModuleGraph` only affects `next dev` with Turbopack.
// @force-gate dev && turbopack
describe('single-dev-module-graph-app-only', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('renders the Pages Router fallback error page without a pages directory', async () => {
    expect((await next.fetch('/')).status).toBe(200)

    // The middleware error is rendered with the fallback `/_error` page, whose endpoints are not
    // listed as routes when there is no `pages` directory.
    const res = await next.fetch('/middleware-error')
    expect(res.status).toBe(500)
    expect(next.cliOutput).toContain('middleware error')
    expect(next.cliOutput).not.toContain('is not in graph')
    expect(next.cliOutput).not.toContain('FATAL')

    expect((await next.fetch('/')).status).toBe(200)
  })
})
