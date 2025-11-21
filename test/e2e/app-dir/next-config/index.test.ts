import { nextTestSetup } from 'e2e-utils'

describe('app dir - next config', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // https://github.com/vercel/next.js/issues/52366
  it('should support importing webpack in next.config', async () => {
    const html = await next.render('/')
    expect(html).toContain('hello from page')
  })
})
