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
  PRERENDER = 'PRERENDER',

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
  fallbackField: string | boolean | null | undefined
): FallbackMode | undefined {
  if (typeof fallbackField === 'string') {
    return FallbackMode.PRERENDER
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

export function fallbackModeToFallbackField(
  fallback: FallbackMode,
  page: string | undefined
): string | false | null {
  switch (fallback) {
    case FallbackMode.BLOCKING_STATIC_RENDER:
      return null
    case FallbackMode.NOT_FOUND:
      return false
    case FallbackMode.PRERENDER:
      if (!page) {
        throw new Error(
          `Invariant: expected a page to be provided when fallback mode is "${fallback}"`
        )
      }

      return page
    default:
      throw new Error(`Invalid fallback mode: ${fallback}`)
  }
}

/**
 * Parses the fallback from the static paths result.
 *
 * @param result The result from the static paths function.
 * @returns The fallback mode.
 */
export function parseStaticPathsResult(
  result: GetStaticPathsFallback
): FallbackMode {
  if (result === true) {
    return FallbackMode.PRERENDER
  } else if (result === 'blocking') {
    return FallbackMode.BLOCKING_STATIC_RENDER
  } else {
    return FallbackMode.NOT_FOUND
  }
}
