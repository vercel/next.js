import type { AppConfig } from '../build/utils'

/**
 * Describes the different fallback modes that a given page can have.
 */
export const enum FallbackMode {
  /**
   * A BLOCKING_RENDER fallback will block the request until the page is\
   * generated. No fallback page will be rendered, and users will have to wait
   * to render the page.
   */
  BLOCKING_RENDER = 'BLOCKING_RENDER',

  /**
   * When set to NOT_FOUND, pages that are not already prerendered will result
   * in a not found response.
   */
  NOT_FOUND = 'NOT_FOUND',

  /**
   * When set to PRERENDER, a fallback page will be sent to users in place of
   * forcing them to wait for the page to be generated. This allows the user to
   * see a rendered page earlier.
   */
  SERVE_PRERENDER = 'SERVE_PRERENDER',
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
  fallbackField: string | false | null
): FallbackMode {
  if (typeof fallbackField === 'string') {
    return FallbackMode.SERVE_PRERENDER
  } else if (fallbackField === null) {
    return FallbackMode.BLOCKING_RENDER
  } else {
    return FallbackMode.NOT_FOUND
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
    return FallbackMode.SERVE_PRERENDER
  } else if (result === 'blocking') {
    return FallbackMode.BLOCKING_RENDER
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
    case FallbackMode.SERVE_PRERENDER:
      return true
    case FallbackMode.BLOCKING_RENDER:
      return 'blocking'
    case FallbackMode.NOT_FOUND:
    default:
      return false
  }
}

/**
 * Parses the fallback field from the app config.
 *
 * @param appConfig The app config.
 * @returns The fallback mode.
 */
export function parseFallbackAppConfig(appConfig: AppConfig): FallbackMode {
  if (appConfig.dynamicParams === false) {
    return FallbackMode.NOT_FOUND
  } else {
    return FallbackMode.BLOCKING_RENDER
  }
}
