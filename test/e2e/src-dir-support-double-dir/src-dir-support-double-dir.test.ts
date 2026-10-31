import { nextTestSetup } from 'e2e-utils'

describe('src-dir-support-double-dir', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render from pages', async () => {
    const html = await next.render('/')
    expect(html).toMatch(/PAGES/)
  })

  it('should not render from src/pages', async () => {
    const html = await next.render('/hello')
    expect(html).toMatch(/404/)
  })
})
