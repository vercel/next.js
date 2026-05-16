import { nextTestSetup } from 'e2e-utils'

describe('useSelectedLayoutSegment(s) in Pages Router', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('Should render with `useSelectedLayoutSegment(s) hooks', async () => {
    const browser = await next.browser('/')

    await browser.waitForElementByCss('#hello-world')
    expect(await browser.elementByCss('#hello-world').text()).toBe(
      'Hello World'
    )
  })
})
