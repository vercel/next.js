import browserslist from 'next/dist/compiled/browserslist'
import {
  assertTestingDefaultConfiguration,
  assertTestingDefaultConfigurationEnvironment,
  type TestingDefaultConfiguration,
} from '../server/config-testing-policy'
import { MODERN_BROWSERSLIST_TARGET } from '../shared/lib/constants'

export function getSupportedBrowsers(
  dir: string,
  isDevelopment: boolean,
  testingDefaultConfiguration?: TestingDefaultConfiguration
): string[] {
  assertTestingDefaultConfiguration(testingDefaultConfiguration)
  if (testingDefaultConfiguration !== undefined) {
    assertTestingDefaultConfigurationEnvironment(testingDefaultConfiguration)
    if (isDevelopment) {
      throw new Error(
        'ERR_NEXT_TEST_DEFAULT_CONFIGURATION: only production browser targets are available'
      )
    }
    // loadConfig reads configuration data; resolving that data can load packages.
    const selected = browserslist.loadConfig({ path: dir, env: 'production' })
    if (selected !== undefined) {
      throw new Error(
        'ERR_NEXT_TEST_DEFAULT_CONFIGURATION: project Browserslist selection is unavailable'
      )
    }
    // Do not resolve undefined: that would permit a later project config rescan.
    return MODERN_BROWSERSLIST_TARGET
  }
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
