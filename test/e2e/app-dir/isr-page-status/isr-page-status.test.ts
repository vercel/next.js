import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app dir - isr page status', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should response cache status when the status changed', async () => {
    // visit a slug doesn't exist yet
    const browser = await next.browser('/bar')
    expect(await browser.elementByCss('h1').text()).toBe('404')

    await next.patchFile(
      'public/articles.json',
      JSON.stringify([{ slug: 'bar', title: 'Bar' }])
    )

    // visit the slug again
    await retry(async () => {
      const { status: status2 } = await next.fetch('/bar')
      expect(status2).toBe(200)
      const $2 = await next.render$('/bar')
      expect($2('p').text()).toBe('Bar')
    })
  })
})
