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

  it('should not serve cached HTML for server action POST on optional catch-all routes', async () => {
    // Regression: with cacheComponents enabled, POST requests for server
    // actions on dynamic routes (e.g. [[...slug]]) were incorrectly served
    // the cached fallback shell HTML instead of executing the action.
    // This verifies the response to a server action POST is NOT text/html.
    const res = await next.fetch('/server-action-dynamic', {
      method: 'POST',
      headers: {
        'next-action': 'test-action-id',
        'content-type': 'text/plain;charset=UTF-8',
      },
      body: '',
    })

    const contentType = res.headers.get('content-type') || ''
    expect(contentType).not.toContain('text/html')
  })

  it('should not serve cached HTML for server action POST on optional catch-all routes with params', async () => {
    // Same regression but when the catch-all has actual path segments.
    const res = await next.fetch('/server-action-dynamic/foo/bar', {
      method: 'POST',
      headers: {
        'next-action': 'test-action-id',
        'content-type': 'text/plain;charset=UTF-8',
      },
      body: '',
    })

    const contentType = res.headers.get('content-type') || ''
    expect(contentType).not.toContain('text/html')
  })
})
