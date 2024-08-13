/**
 * Describes the different fallback modes that a given page can have.
 */
export const enum FallbackMode {
  /**
   * A BLOCKING_STATIC_RENDER fallback will block the request until the page is
   * generated. No fallback page will be rendered, and users will have to wait
   * to render the page.
   */
  BLOCKING_STATIC_RENDER = 'BLOCKING_STATIC_RENDER',

  /**
   * When set to PRERENDER, a fallback page will be sent to users in place of
   * forcing them to wait for the page to be generated. This allows the user to
   * see a rendered page earlier.
   */
  STATIC_PRERENDER = 'STATIC_PRERENDER',

  /**
   * When set to NOT_FOUND, pages that are not already prerendered will result
   * in a not found response.
   */
  NOT_FOUND = 'NOT_FOUND',
}

/**
 * The fallback value returned from the `getStaticPaths` function.
 */
export type GetStaticPathsFallback = boolean | 'blocking'

/**
 * Parses the fallback field from the prerender manifest.
 *
 * @param fallbackField The fallback field from the prerender manifest.
 * @returns The fallback mode.
 */
export function parseFallbackField(
  fallbackField: string | false | null | undefined
): FallbackMode | undefined {
  if (typeof fallbackField === 'string') {
    return FallbackMode.STATIC_PRERENDER
  } else if (fallbackField === null) {
    return FallbackMode.BLOCKING_STATIC_RENDER
  } else if (fallbackField === false) {
    return FallbackMode.NOT_FOUND
  } else if (fallbackField === undefined) {
    return undefined
  } else {
    throw new Error(
      `Invalid fallback option: ${fallbackField}. Fallback option must be a string, null, undefined, or false.`
    )
  }
}

/**
 * Parses the fallback from the static paths result.
 *
 * @param result The result from the static paths function.
 * @returns The fallback mode.
 */
export function parseFallbackStaticPathsResult(
  result: GetStaticPathsFallback
): FallbackMode {
  if (result === true) {
    return FallbackMode.STATIC_PRERENDER
  } else if (result === 'blocking') {
    return FallbackMode.BLOCKING_STATIC_RENDER
  } else {
    return FallbackMode.NOT_FOUND
  }
}

/**
 * Converts the fallback mode to a static paths result.
 *
 * @param fallback The fallback mode.
 * @returns The static paths fallback result.
 */
export function fallbackToStaticPathsResult(
  fallback: FallbackMode
): GetStaticPathsFallback {
  switch (fallback) {
    case FallbackMode.STATIC_PRERENDER:
      return true
    case FallbackMode.BLOCKING_STATIC_RENDER:
      return 'blocking'
    case FallbackMode.NOT_FOUND:
    default:
      return false
  }
}
