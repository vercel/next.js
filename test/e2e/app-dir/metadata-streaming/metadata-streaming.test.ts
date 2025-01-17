import { nextTestSetup } from 'e2e-utils'
import { retry, createMultiDomMatcher } from 'next-test-utils'

describe('app-dir - metadata-streaming', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should load the page without delayed metadata', async () => {
    const $ = await next.render$('/')
    expect($('title').length).toBe(0)
  })

  it('should still load viewport meta tags even if metadata is delayed', async () => {
    const $ = await next.render$('/slow')

    expect($('meta[name="viewport"]').attr('content')).toBe(
      'width=device-width, initial-scale=1'
    )
    expect($('meta[charset]').attr('charset')).toBe('utf-8')
  })

  it('should render the metadata in the browser', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementByCss('title').text()).toBe('index page')
    })
  })

  it('should load the initial html without slow metadata during navigation', async () => {
    // navigate from / to /slow, the metadata should be empty first, e.g. no title.
    // then the metadata should be loaded after few seconds.
    const browser = await next.browser('/')
    await browser.elementByCss('#to-slow').click()

    await retry(async () => {
      expect(await browser.elementByCss('title').text()).toBe('slow page')
      const matchMultiDom = createMultiDomMatcher(browser)

      await matchMultiDom('meta', 'name', 'content', {
        description: 'slow page description',
        generator: 'next.js',
        'application-name': 'test',
        referrer: 'origin-when-cross-origin',
        keywords: 'next.js,react,javascript',
        author: ['huozhi'],
        viewport: 'width=device-width, initial-scale=1',
        creator: 'huozhi',
        publisher: 'vercel',
        robots: 'index, follow',
      })
    })
  })

  it('should send the blocking response for html limited bots', async () => {
    const $ = await next.render$(
      '/',
      undefined, // no query
      {
        headers: {
          'user-agent': 'Twitterbot',
        },
      }
    )
    expect(await $('title').text()).toBe('index page')
  })

  it('should send streaming response for headless browser bots', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementByCss('title').text()).toBe('index page')
    })
  })

  it('should not insert metadata twice or inject into body', async () => {
    const browser = await next.browser('/slow')

    // each metadata should be inserted only once

    expect(await browser.hasElementByCssSelector('body meta')).toBe(false)
    expect(await browser.hasElementByCssSelector('body title')).toBe(false)
  })
})
