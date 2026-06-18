/**
 * Returns true if partial prerendering is enabled for the application. It does
 * not tell you if a given route has PPR enabled, as that requires analysis of
 * the route's configuration.
 *
 * @see {@link checkIsRoutePPREnabled} - for checking if a specific route has PPR enabled.
 */
export function checkIsAppPPREnabled(config: {
  cacheComponents: boolean
}): boolean {
  return Boolean(config.cacheComponents)
}

/**
 * Returns true if partial prerendering is supported for the current page with
 * the provided app configuration. If the application doesn't have partial
 * prerendering enabled, this function will always return false. If you want to
 * check if the application has partial prerendering enabled
 *
 * @see {@link checkIsAppPPREnabled} for checking if the application has PPR enabled.
 */
export function checkIsRoutePPREnabled(config: {
  cacheComponents: boolean
}): boolean {
  return Boolean(config.cacheComponents)
}
