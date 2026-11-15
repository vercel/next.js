import type { NextConfigComplete } from '../../config-shared'

export const STRICT_ROUTE_MATCHING_DEFAULT_WARNING =
  "Strict route matching is enabled by default. This validation indicates a bug in your app's route structure, but you can temporarily restore loose route matching by setting `deprecated.looseRouteMatching` to `true` in your Next.js config."

export function getStrictRouteMatchingDefaultWarning(
  config: NextConfigComplete
): string | undefined {
  return config.experimental.strictRouteMatching
    ? STRICT_ROUTE_MATCHING_DEFAULT_WARNING
    : undefined
}
