/**
 * If set to `incremental`, only those leaf pages that export
 * `experimental_ppr = true` will have partial prerendering enabled. If any
 * page exports this value as `false` or does not export it at all will not
 * have partial prerendering enabled. If set to a boolean, it the options for
 * `experimental_ppr` will be ignored.
 */

export type ExperimentalPPRConfig = boolean | 'incremental'

/**
 * Returns true if partial prerendering is enabled for the application.
 */
export function isPPREnabled(
  config: ExperimentalPPRConfig | undefined
): boolean {
  // If the config is undefined, partial prerendering is disabled.
  if (typeof config === 'undefined') return false

  // If the config is a boolean, use it directly.
  if (typeof config === 'boolean') return config

  // If the config is a string, it must be 'incremental' to enable partial
  // prerendering.
  if (config === 'incremental') return true

  return false
}

/**
 * Returns true if partial prerendering is supported for the current page with
 * the provided app configuration.
 */
export function isPPRSupported(
  config: ExperimentalPPRConfig | undefined,
  appConfig: {
    experimental_ppr?: boolean
  }
): boolean {
  // If the config is undefined or false, partial prerendering is disabled.
  if (typeof config === 'undefined' || config === false) {
    return false
  }

  // If the config is set to true, then the page supports partial prerendering.
  if (config === true) {
    return true
  }

  // If the config is a string, it must be 'incremental' to enable partial
  // prerendering.
  if (config === 'incremental' && appConfig.experimental_ppr === true) {
    return true
  }

  return false
}
