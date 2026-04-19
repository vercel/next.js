import { nextTestSetup } from 'e2e-utils'

describe('esm-client-module-without-exports', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render without errors', async () => {
    const html = await next.render('/')
    expect(html).toContain('hello world')
  })
})
