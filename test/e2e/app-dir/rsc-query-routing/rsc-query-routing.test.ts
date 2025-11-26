import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('rsc-query-routing', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should contain rsc query in rsc request when redirect the page', async () => {
    const browser = await next.browser('/redirect')

    const rscRequestUrls: string[] = []
    browser.on('request', (req) => {
      if (req.url().includes('?_rsc=')) {
        rscRequestUrls.push(req.url())
      }
    })

    // Click redirect link
    const link = await browser.elementByCss('a')
    await link.click()

    // Wait for the page load to be completed
    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe('Redirect Dest')
    })

    // The redirect source and dest urls should both contain the rsc query
    expect(rscRequestUrls[0]).toContain('/redirect/source')
    expect(rscRequestUrls[1]).toContain('/redirect/dest')
  })

  it('should contain rsc query in rsc request when rewrite the page', async () => {
    const browser = await next.browser('/rewrite')

    const rscRequestUrls: string[] = []
    browser.on('request', (req) => {
      if (req.url().includes('?_rsc=')) {
        rscRequestUrls.push(req.url())
      }
    })

    // Click redirect link
    const link = await browser.elementByCss('a')
    await link.click()

    // Wait for the page load to be completed
    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe('Rewrite Dest')
    })

    // The rewrite source url should contain the rsc query
    expect(rscRequestUrls[0]).toContain('/rewrite/source')
  })
})
