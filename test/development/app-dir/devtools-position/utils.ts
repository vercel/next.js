import type { Playwright } from '../../../lib/next-webdriver'
import { assertHasDevToolsIndicator } from '../../../lib/next-test-utils'

export async function getDevIndicatorPosition(browser: Playwright) {
  const indicator = await assertHasDevToolsIndicator(browser)
  const style = await indicator.getAttribute('style')
  return style || ''
}
