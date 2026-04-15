import { nextTestSetup } from 'e2e-utils'

describe('Dynamic require', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('should not throw error when dynamic require is used', async () => {
    const html = await next.render('/')
    expect(html).toMatch(/If you can see this then we are good/)
  })
})
