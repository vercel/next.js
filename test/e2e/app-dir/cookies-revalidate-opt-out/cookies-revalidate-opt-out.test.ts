import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { Playwright } from 'next-webdriver'

describe('cookies-revalidate-opt-out', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  function getBrowserCookie(browser: Playwright, name: string) {
    return browser.eval<string | null>(
      `document.cookie.match(/(?:^|; )${name}=([^;]+)/)?.[1] ?? null`
    )
  }

  async function waitForActionResult(
    browser: Playwright,
    prefix: string,
    previousResult = 'no-result'
  ) {
    let result = ''
    await retry(async () => {
      result = await browser.elementByCss('#action-result').text()
      expect(result).toMatch(new RegExp(`^${prefix}:`))
      expect(result).not.toBe(previousResult)
    })
    return result.slice(prefix.length + 1)
  }

  it('re-renders the page when a cookie is set in a server action', async () => {
    const browser = await next.browser('/')
    const initialRenderId = await browser.elementByCss('#render-id').text()

    await browser.elementByCss('#set-cookie').click()
    const value = await waitForActionResult(browser, 'set-cookie')

    await retry(async () => {
      expect(await browser.elementByCss('#render-id').text()).not.toBe(
        initialRenderId
      )
    })
    expect(await browser.elementByCss('#rendered-cookie-value').text()).toBe(
      value
    )
    expect(await getBrowserCookie(browser, 'test-cookie')).toBe(value)
  })

  it('does not re-render the page when a cookie is set with revalidate: false', async () => {
    const browser = await next.browser('/')
    const initialRenderId = await browser.elementByCss('#render-id').text()
    const initialRenderedCookie = await browser
      .elementByCss('#rendered-cookie-value')
      .text()

    await browser.elementByCss('#set-cookie-without-revalidate').click()
    const value = await waitForActionResult(
      browser,
      'set-cookie-without-revalidate'
    )

    // The cookie must still reach the browser via the Set-Cookie header.
    await retry(async () => {
      expect(await getBrowserCookie(browser, 'test-cookie')).toBe(value)
    })

    // Run a second action roundtrip so that any erroneously scheduled refresh
    // from the first action would have been applied by the time it completes.
    await browser.elementByCss('#set-cookie-without-revalidate').click()
    const secondValue = await waitForActionResult(
      browser,
      'set-cookie-without-revalidate',
      `set-cookie-without-revalidate:${value}`
    )
    expect(secondValue).not.toBe(value)

    // The page was not re-rendered: the server skipped rendering and the
    // client router caches were not invalidated.
    expect(await browser.elementByCss('#render-id').text()).toBe(
      initialRenderId
    )
    expect(await browser.elementByCss('#rendered-cookie-value').text()).toBe(
      initialRenderedCookie
    )

    // The cookie is visible to the server on the next request.
    await browser.refresh()
    await retry(async () => {
      expect(await browser.elementByCss('#rendered-cookie-value').text()).toBe(
        secondValue
      )
    })
  })

  it('does not re-render the page when a cookie is set with revalidate: false in the object form', async () => {
    const browser = await next.browser('/')
    const initialRenderId = await browser.elementByCss('#render-id').text()

    await browser.elementByCss('#set-cookie-object-form').click()
    const value = await waitForActionResult(browser, 'set-cookie-object-form')

    await retry(async () => {
      expect(await getBrowserCookie(browser, 'test-cookie')).toBe(value)
    })

    // Run a second action roundtrip so that any erroneously scheduled refresh
    // from the first action would have been applied by the time it completes.
    await browser.elementByCss('#set-cookie-object-form').click()
    await waitForActionResult(
      browser,
      'set-cookie-object-form',
      `set-cookie-object-form:${value}`
    )

    expect(await browser.elementByCss('#render-id').text()).toBe(
      initialRenderId
    )
  })

  it('re-renders the page when a cookie is deleted in a server action', async () => {
    const browser = await next.browser('/')

    // Set the cookie first so the page renders its value.
    await browser.elementByCss('#set-cookie').click()
    const value = await waitForActionResult(browser, 'set-cookie')
    await retry(async () => {
      expect(await browser.elementByCss('#rendered-cookie-value').text()).toBe(
        value
      )
    })

    await browser.elementByCss('#delete-cookie').click()
    await waitForActionResult(browser, 'delete-cookie')

    await retry(async () => {
      expect(await browser.elementByCss('#rendered-cookie-value').text()).toBe(
        'no-cookie'
      )
    })
    expect(await getBrowserCookie(browser, 'test-cookie')).toBe(null)
  })

  it('does not re-render the page when a cookie is deleted with revalidate: false', async () => {
    const browser = await next.browser('/')

    // Set the cookie first so the page renders its value.
    await browser.elementByCss('#set-cookie').click()
    const value = await waitForActionResult(browser, 'set-cookie')
    let renderId = ''
    await retry(async () => {
      expect(await browser.elementByCss('#rendered-cookie-value').text()).toBe(
        value
      )
      renderId = await browser.elementByCss('#render-id').text()
    })

    await browser.elementByCss('#delete-cookie-without-revalidate').click()
    const token = await waitForActionResult(
      browser,
      'delete-cookie-without-revalidate'
    )

    // The deletion must still reach the browser via the Set-Cookie header.
    await retry(async () => {
      expect(await getBrowserCookie(browser, 'test-cookie')).toBe(null)
    })

    // Run a second action roundtrip so that any erroneously scheduled refresh
    // from the first action would have been applied by the time it completes.
    await browser.elementByCss('#delete-cookie-without-revalidate').click()
    await waitForActionResult(
      browser,
      'delete-cookie-without-revalidate',
      `delete-cookie-without-revalidate:${token}`
    )

    // But the page was not re-rendered, so it still shows the stale value.
    expect(await browser.elementByCss('#render-id').text()).toBe(renderId)
    expect(await browser.elementByCss('#rendered-cookie-value').text()).toBe(
      value
    )
  })

  it('re-renders the page when a revalidating mutation follows an opted-out one', async () => {
    const browser = await next.browser('/')
    const initialRenderId = await browser.elementByCss('#render-id').text()

    await browser.elementByCss('#set-cookies-mixed').click()
    const value = await waitForActionResult(browser, 'set-cookies-mixed')

    await retry(async () => {
      expect(await browser.elementByCss('#render-id').text()).not.toBe(
        initialRenderId
      )
    })
    expect(await browser.elementByCss('#rendered-cookie-value').text()).toBe(
      value
    )
  })

  it('re-renders the page when revalidatePath is called alongside an opted-out cookie mutation', async () => {
    const browser = await next.browser('/')
    const initialRenderId = await browser.elementByCss('#render-id').text()

    await browser.elementByCss('#set-cookie-and-revalidate-path').click()
    const value = await waitForActionResult(
      browser,
      'set-cookie-and-revalidate-path'
    )

    await retry(async () => {
      expect(await browser.elementByCss('#render-id').text()).not.toBe(
        initialRenderId
      )
    })
    expect(await browser.elementByCss('#rendered-cookie-value').text()).toBe(
      value
    )
  })

  it('omits the x-action-revalidated header for opted-out mutations and sends it for plain ones', async () => {
    const browser = await next.browser('/')

    // Record the x-action-revalidated response header of action POSTs.
    await browser.eval(`(() => {
      window.__actionRevalidatedHeader = 'none'
      const originalFetch = window.fetch.bind(window)
      window.fetch = async (...args) => {
        const response = await originalFetch(...args)
        try {
          const method = (
            (args[1] && args[1].method) ||
            'GET'
          ).toUpperCase()
          if (method === 'POST') {
            window.__actionRevalidatedHeader =
              response.headers.get('x-action-revalidated') ?? 'absent'
          }
        } catch {}
        return response
      }
    })()`)

    await browser.elementByCss('#set-cookie-without-revalidate').click()
    const value = await waitForActionResult(
      browser,
      'set-cookie-without-revalidate'
    )
    expect(await browser.eval('window.__actionRevalidatedHeader')).toBe(
      'absent'
    )

    await browser.elementByCss('#set-cookie').click()
    await waitForActionResult(browser, 'set-cookie', `set-cookie:${value}`)
    expect(await browser.eval('window.__actionRevalidatedHeader')).toBe('1')
  })

  it('accepts the revalidate option in a route handler and still emits Set-Cookie', async () => {
    const res = await next.fetch('/route-handler', { method: 'POST' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    const setCookieHeader = res.headers.get('set-cookie') ?? ''
    expect(setCookieHeader).toContain('route-handler-cookie=route-value')
    expect(setCookieHeader).toContain('other-cookie=;')
    // The Next.js-specific option must not leak into the header.
    expect(setCookieHeader).not.toContain('revalidate')
  })
})
