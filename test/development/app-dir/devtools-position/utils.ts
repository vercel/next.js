import type { Playwright } from '../../../lib/next-webdriver'

export async function getDevIndicatorPosition(browser: Playwright) {
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
