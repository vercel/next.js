import { nextTestSetup } from 'e2e-utils'

describe('symbolic-links', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render a route whose page is a file symlink', async () => {
    const browser = await next.browser('/file-symlink')
    expect(await browser.elementByCss('p').text()).toBe(
      'hello from a file symlink'
    )
  })

  it('should render a route that imports through a directory symlink', async () => {
    const html = await next.render('/directory-symlink')
    expect(html).toContain('hello from a directory symlink')
  })

  it('should render a route that imports through chained directory symlinks', async () => {
    const html = await next.render('/directory-symlink-chain')
    expect(html).toContain('hello from a directory symlink')
  })
})
