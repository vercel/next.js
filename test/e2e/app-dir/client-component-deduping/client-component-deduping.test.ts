import { nextTestSetup } from 'e2e-utils'

describe('client-component-deduping', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should load the client component', async () => {
    const html = await next.render('/')
    expect(html).toContain('hello world')
  })
})
