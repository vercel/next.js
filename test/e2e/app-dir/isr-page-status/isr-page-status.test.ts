import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app dir - isr page status', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should response new cache status when isr response change from 404 to 200', async () => {
    // visit a slug doesn't exist yet
    const browser = await next.browser('/foo1')
    expect(await browser.elementByCss('h1').text()).toBe('404')

    await next.patchFile('public/articles.json', (content: string) => {
      const json = JSON.parse(content)
      // Update foo to foo1
      json[0] = {
        slug: 'foo1',
        title: 'Foo1',
      }
      return JSON.stringify(json)
    })

    // visit the slug again
    await retry(async () => {
      const { status: status2 } = await next.fetch('/foo1')
      expect(status2).toBe(200)
      const $ = await next.render$('/foo1')
      expect($('p').text()).toBe('Foo1')
    })
  })

  it('should response new cache status when isr response change from 200 to 404', async () => {
    const browser = await next.browser('/bar')
    expect(await browser.elementByCss('p').text()).toBe('Bar')

    await next.patchFile('public/articles.json', (content: string) => {
      const json = JSON.parse(content)
      json[1] = {
        slug: 'bar1',
        title: 'Bar1',
      }
      return JSON.stringify(json)
    })

    // visit the slug again
    await retry(async () => {
      const { status: status2 } = await next.fetch('/bar')
      expect(status2).toBe(404)
    })
  })
})
