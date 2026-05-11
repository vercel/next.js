import { nextTestSetup } from 'e2e-utils'

describe('Dynamic require', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      react: '19.3.0-canary-fef12a01-20260413',
      'react-dom': '19.3.0-canary-fef12a01-20260413',
    },
  })

  it('should not throw error when dynamic require is used', async () => {
    const html = await next.render('/')
    expect(html).toMatch(/If you can see this then we are good/)
  })
})
