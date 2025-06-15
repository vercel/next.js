import { nextTestSetup } from 'e2e-utils'

describe('externalize-node-binary', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render correctly when node_modules require node binary module', async () => {
    const { status } = await next.fetch('/')
    expect(status).toBe(200)

    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('I am foo')
  })
})
