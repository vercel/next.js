import { nextTestSetup } from 'e2e-utils'

describe('PORT environment variable', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('should serve on the configured port', async () => {
    const html = await next.render('/')
    expect(html).toContain('hello from index')
  })
})
