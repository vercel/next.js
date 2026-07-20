import { nextTestSetup } from 'e2e-utils'
import { waitForNoRedbox } from 'next-test-utils'

describe('App assetPrefix config', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render correctly with assetPrefix: "/"', async () => {
    const browser = await next.browser('/')
    await waitForNoRedbox(browser)
    const title = await browser.elementById('title').text()
    expect(title).toBe('IndexPage')
  })
})
