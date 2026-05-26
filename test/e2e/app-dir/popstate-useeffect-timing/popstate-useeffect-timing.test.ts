import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('popstate-useeffect-timing', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('useEffect should fire synchronously after browser back navigation', async () => {
    const browser = await next.browser('/')

    // Wait for the initial useEffect to fire.
    await retry(async () => {
      expect(await browser.elementById('effect-status').text()).toBe(
        'effect-fired'
      )
    })

    // Navigate to the target page via client-side navigation (Link).
    await browser.elementByCss('a[href="/navigation-target"]').click()

    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe('Navigation Target')
    })

    // Set up a MutationObserver BEFORE navigating back, then trigger
    // history.back() from inside the same eval. This avoids the race where
    // the observer starts after the deferred commit already happened.
    const elapsed = await browser.eval<number>(`
      new Promise((resolve) => {
        const start = performance.now()
        const observer = new MutationObserver(() => {
          const el = document.getElementById('effect-status')
          if (el && el.textContent === 'effect-fired') {
            observer.disconnect()
            resolve(performance.now() - start)
          }
        })
        observer.observe(document.body, { childList: true, subtree: true, characterData: true })

        // Trigger the back navigation. The popstate handler fires
        // synchronously during this call.
        window.history.back()

        // Safety timeout
        setTimeout(() => { observer.disconnect(); resolve(9999) }, 3000)
      })
    `)

    // With the fix, the effect fires within a single React commit (~0-50ms).
    // With the bug, startTransition defers by 100-200ms+ (scheduler tick).
    // 500ms is generous enough for CI but tight enough to catch deferral.
    expect(elapsed).toBeLessThan(500)
  })

  it('useEffect should fire synchronously after repeated back/forward navigations', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      expect(await browser.elementById('effect-status').text()).toBe(
        'effect-fired'
      )
    })

    // Navigate to the target page.
    await browser.elementByCss('a[href="/navigation-target"]').click()

    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe('Navigation Target')
    })

    // First back navigation.
    await browser.back()

    await retry(async () => {
      expect(await browser.elementById('effect-status').text()).toBe(
        'effect-fired'
      )
    })

    // Forward navigation.
    await browser.forward()

    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe('Navigation Target')
    })

    // Second back navigation — measure timing.
    const elapsed = await browser.eval<number>(`
      new Promise((resolve) => {
        const start = performance.now()
        const observer = new MutationObserver(() => {
          const el = document.getElementById('effect-status')
          if (el && el.textContent === 'effect-fired') {
            observer.disconnect()
            resolve(performance.now() - start)
          }
        })
        observer.observe(document.body, { childList: true, subtree: true, characterData: true })
        window.history.back()
        setTimeout(() => { observer.disconnect(); resolve(9999) }, 3000)
      })
    `)

    expect(elapsed).toBeLessThan(500)
  })
})
