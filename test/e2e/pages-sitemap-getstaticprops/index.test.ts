import { nextTestSetup } from 'e2e-utils'

describe('pages sitemap with getStaticProps', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render sitemap page with getStaticProps successfully', async () => {
    const browser = await next.browser('/sitemap')
    expect(await browser.elementById('message').text()).toBe(
      'Hello from sitemap getStaticProps'
    )
  })
})
