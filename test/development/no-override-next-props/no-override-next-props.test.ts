import { nextTestSetup } from 'e2e-utils'

describe('no-override-next-props', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should show error when a Next prop is returned in _app.getInitialProps', async () => {
    const html = await next.render('/')
    expect(html).toMatch(/\/cant-override-next-props/)
  })
})
