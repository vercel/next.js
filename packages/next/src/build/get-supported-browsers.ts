import browserslist from 'next/dist/compiled/browserslist'
import { MODERN_BROWSERSLIST_TARGET } from '../shared/lib/constants'

export function getSupportedBrowsers(
  dir: string,
  isDevelopment: boolean
): string[] {
  let browsers: any
  try {
    const browsersListConfig = browserslist.loadConfig({
      path: dir,
      env: isDevelopment ? 'development' : 'production',
    })
    // Running `browserslist` resolves `extends` and other config features into a list of browsers
    if (browsersListConfig && browsersListConfig.length > 0) {
      browsers = browserslist(browsersListConfig)
    }
  } catch {}

  // When user has browserslist use that target
  if (browsers && browsers.length > 0) {
    return browsers
  }

  // Uses modern browsers as the default.
  return MODERN_BROWSERSLIST_TARGET
}
