import type { Playwright } from 'e2e-utils'
import { retry } from 'next-test-utils'

/**
 * Asserts that the window has scrolled to the element returned by
 * `getElementJs` (a JS expression evaluated in the browser). The expected
 * offset is computed from the element's live layout position rather than a
 * hardcoded pixel value, so the assertion is independent of font metrics,
 * which vary with the fonts installed on the host.
 */
export async function expectScrolledTo(
  browser: Playwright,
  getElementJs: string
) {
  await retry(async () => {
    const { expected, actual } = await browser.eval<{
      expected: number
      actual: number
    }>(`(() => {
      const el = ${getElementJs}
      // Scrolling to an anchor near the bottom of the page is clamped to the
      // maximum scroll position.
      const expected = Math.min(
        el.getBoundingClientRect().top + window.pageYOffset,
        document.documentElement.scrollHeight - window.innerHeight
      )
      return { expected, actual: window.pageYOffset }
    })()`)
    expect(expected).toBeGreaterThan(0)
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1)
  })
}
