import type { Playwright } from '../../../lib/next-webdriver'
import { assertHasDevToolsIndicator } from 'next-test-utils'

export async function getDevIndicatorPosition(browser: Playwright) {
  // assert before eval() to prevent race condition
  await assertHasDevToolsIndicator(browser)

  const style = await browser.eval(() => {
    return (
      [].slice
        .call(document.querySelectorAll('nextjs-portal'))
        .find((p) => p.shadowRoot.querySelector('[data-nextjs-toast]'))
        // portal
        ?.shadowRoot?.querySelector('[data-nextjs-toast]')
        ?.getAttribute('style') || ''
    )
  })
  return style || ''
}
