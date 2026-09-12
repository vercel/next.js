import { nextTestSetup } from 'e2e-utils'
import { waitForNoRedbox, retry } from 'next-test-utils'

describe('cache-components', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should not fail decoding server action arguments', async () => {
    const browser = await next.browser('/server-action')
    expect(await browser.elementByCss('p').text()).toBe('initial')
    await browser.elementByCss('button').click()

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe('result')
    })
  })

  it('should return a complete MPA response after a server action', async () => {
    const browser = await next.browser('/server-action-mpa-partial', {
      disableJavaScript: true,
    })

    expect(await browser.elementByCss('#action-state').text()).toBe('initial')
    const cachedTimestamp = await browser
      .elementByCss('#cached-timestamp')
      .text()
    await browser.elementByCss('#submit-button').click()

    await retry(async () => {
      expect(await browser.elementByCss('#action-state').text()).toBe('result')
      expect(await browser.elementByCss('#cached-timestamp').text()).toBe(
        cachedTimestamp
      )
    })
  })

  it('should revalidate cached data in a complete MPA response', async () => {
    const browser = await next.browser('/server-action-mpa-partial', {
      disableJavaScript: true,
    })

    const cachedTimestamp = await browser
      .elementByCss('#cached-timestamp')
      .text()
    await browser.elementByCss('#revalidate-button').click()

    await retry(async () => {
      expect(await browser.elementByCss('#revalidation-state').text()).toBe(
        'revalidated'
      )
      expect(await browser.elementByCss('#cached-timestamp').text()).not.toBe(
        cachedTimestamp
      )
    })
  })

  it('should return complete HTML for an unrelated urlencoded POST', async () => {
    const response = await next.fetch('/server-action-mpa-partial', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'foo=bar',
    })
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toStartWith('<!DOCTYPE html>')
    expect(html).toContain('id="cached-timestamp"')
    expect(html).toEndWith('</body></html>')
  })

  it('should not have cache components errors when encoding bound args for inline server actions', async () => {
    const browser = await next.browser('/server-action-inline')
    expect(await browser.elementByCss('p').text()).toBe('initial')
    if (isNextDev) {
      await waitForNoRedbox(browser)
    }

    await browser.elementByCss('button').click()
    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe(
        'result and more and even more'
      )
    })

    expect(next.cliOutput).not.toInclude('Error: Route "/server-action-inline"')
  })

  it('should prerender pages with inline server actions', async () => {
    let $ = await next.render$('/server-action-inline', {})

    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    }
  })
})
