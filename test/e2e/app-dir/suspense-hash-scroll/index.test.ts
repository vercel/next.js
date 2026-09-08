import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

describe('app-dir - suspense hash scroll', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should scroll to target element within Suspense boundary after it resolves', async () => {
    const browser = await next.browser('/')

    // Navigate to page with Suspense containing anchor target #category-42
    await browser.elementByCss('#link-products-with-suspense').click()

    // Wait for the Suspense boundary to resolve and mount the target element
    await retry(async () => {
      const scrollY = await browser.eval('window.scrollY')
      const targetTop = await browser.eval(
        'document.getElementById("category-42") ? document.getElementById("category-42").getBoundingClientRect().top : null'
      )
      expect(scrollY).toBeGreaterThan(100)
      expect(targetTop).not.toBeNull()
      expect(Math.abs(targetTop)).toBeLessThan(150)
    }, 6000)
  })

  it('should scroll immediately to target element when not in Suspense boundary', async () => {
    const browser = await next.browser('/')

    // Navigate to page without Suspense containing anchor target #category-42
    await browser.elementByCss('#link-products-no-suspense').click()

    await retry(async () => {
      const scrollY = await browser.eval('window.scrollY')
      const targetTop = await browser.eval(
        'document.getElementById("category-42") ? document.getElementById("category-42").getBoundingClientRect().top : null'
      )
      expect(scrollY).toBeGreaterThan(100)
      expect(targetTop).not.toBeNull()
      expect(Math.abs(targetTop)).toBeLessThan(150)
    }, 6000)
  })

  it('should scroll to target inside nested Suspense boundaries', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('#link-nested-suspense').click()

    await retry(async () => {
      const scrollY = await browser.eval('window.scrollY')
      const targetTop = await browser.eval(
        'document.getElementById("nested-target") ? document.getElementById("nested-target").getBoundingClientRect().top : null'
      )
      expect(scrollY).toBeGreaterThan(100)
      expect(targetTop).not.toBeNull()
      expect(Math.abs(targetTop)).toBeLessThan(150)
    }, 6000)
  })

  it('should gracefully handle non-existent hash without errant scroll-to-top or errors', async () => {
    const browser = await next.browser('/')

    // Navigate to page with non-existent hash
    await browser.elementByCss('#link-nonexistent-hash').click()
    await browser.waitForElementByCss('#products-page-title')

    // Wait a brief moment to ensure observer safety timeout / no errant jump occurs
    await waitFor(1000)

    const scrollY = await browser.eval('window.scrollY')
    expect(scrollY).toBe(0)
  })

  it('should cancel observer on rapid navigation and prevent stale scroll', async () => {
    const browser = await next.browser('/')

    // Rapidly click Suspense link then immediate home link
    await browser.elementByCss('#link-products-with-suspense').click()
    await browser.elementByCss('#link-home').click()

    // Wait for the Suspense delay window
    await waitFor(1000)

    // Ensure we are on home and scroll position remained 0
    const scrollY = await browser.eval('window.scrollY')
    expect(scrollY).toBe(0)
  })
})
