import { nextTestSetup } from 'e2e-utils'

describe('styled-jsx external tracing with pnpm', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // @gate turbopack
  it('does not warn that the internal styled-jsx runtime cannot be resolved', () => {
    expect(next.cliOutput).not.toContain(
      "Module not found: Can't resolve 'styled-jsx/style.js'"
    )
  })

  // @gate turbopack
  it('still renders global styled-jsx styles during SSR', async () => {
    const html = await next.render('/')
    expect(html).toContain('--x:')
  })
})
