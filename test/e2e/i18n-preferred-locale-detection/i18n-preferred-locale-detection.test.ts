import { join } from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'

describe('i18-preferred-locale-redirect', () => {
  const { next } = nextTestSetup({
    files: new FileRef(join(__dirname, './app/')),
  })

  it('should request a path prefixed with my preferred detected locale when accessing index', async () => {
    const browser = await next.browser('/new', {
      locale: 'id',
    })

    let requestedPreferredLocalePathCount = 0
    browser.on('request', (request) => {
      if (new URL(request.url(), 'http://n').pathname === '/id') {
        requestedPreferredLocalePathCount++
      }
    })

    const goToIndex = async () => {
      await browser.get(next.url)
    }

    await expect(goToIndex()).resolves.not.toThrow(/ERR_TOO_MANY_REDIRECTS/)

    await browser.waitForElementByCss('#index')

    expect(await browser.elementByCss('#index').text()).toBe('Index')
    expect(await browser.elementByCss('#current-locale').text()).toBe('id')

    expect(requestedPreferredLocalePathCount).toBe(1)
  })

  it('should not request a path prefixed with my preferred detected locale when clicking link to index from a non-locale-prefixed path', async () => {
    const browser = await next.browser('/new', {
      locale: 'id',
    })

    await browser
      .waitForElementByCss('#to-index')
      .click()
      .waitForElementByCss('#index')

    expect(await browser.elementByCss('#index').text()).toBe('Index')
    expect(await browser.elementByCss('#current-locale').text()).toBe('en')
  })

  it('should request a path prefixed with my preferred detected locale when clicking link to index from a locale-prefixed path', async () => {
    const browser = await next.browser('/id/new', {
      locale: 'id',
    })

    await browser
      .waitForElementByCss('#to-index')
      .click()
      .waitForElementByCss('#index')

    expect(await browser.elementByCss('#index').text()).toBe('Index')
    expect(await browser.elementByCss('#current-locale').text()).toBe('id')
  })
})
