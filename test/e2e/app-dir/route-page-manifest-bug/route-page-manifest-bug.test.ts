import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('route-page-manifest-bug', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Recommended for tests that check HTML. Cheerio is a HTML parser that has a jQuery like API.
  it('should work when requesting route handler after page', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#page-title').text()).toBe(
      'Page that would break'
    )
    await browser.eval('window.location.href = "/abc"')
    await retry(async () => {
      expect(await browser.eval('document.body.textContent')).toEqual(
        '{"url":"https://www.example.com"}'
      )
    })
    await browser.refresh()
    await retry(async () => {
      expect(await browser.eval('document.body.textContent')).toEqual(
        '{"url":"https://www.example.com"}'
      )
    })
    await browser.refresh()
    await retry(async () => {
      expect(await browser.eval('document.body.textContent')).toEqual(
        '{"url":"https://www.example.com"}'
      )
    })
    await browser.refresh()
    await retry(async () => {
      expect(await browser.eval('document.body.textContent')).toEqual(
        '{"url":"https://www.example.com"}'
      )
    })

    await browser.back()
    expect(await browser.waitForElementByCss('#page-title').text()).toBe(
      'Page that would break'
    )
    await browser.refresh()
    expect(await browser.waitForElementByCss('#page-title').text()).toBe(
      'Page that would break'
    )
    await browser.refresh()
    expect(await browser.waitForElementByCss('#page-title').text()).toBe(
      'Page that would break'
    )
  })
})
