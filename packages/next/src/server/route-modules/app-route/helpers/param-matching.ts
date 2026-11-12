import type { RouteHandlerParamMatching } from '../../../../build/static-paths/types'
import type { Params } from '../../../request/params'

/** Compare the exact prepared values that will be passed to the handler. */
export function isRouteHandlerParamMatchingAllowed(
  params: Params | undefined,
  matching: RouteHandlerParamMatching
): boolean {
  return matching.tuples.some((tuple) =>
    matching.paramNames.every((paramName, index) => {
      const actual = params?.[paramName]
      const expected = tuple[index]
      if (typeof expected === 'string') return actual === expected
      // An absent optional catch-all and its generated empty array are the
      // same parameter value. Required catch-alls cannot match an absent URL.
      if (actual === undefined) return expected.length === 0
      return (
        Array.isArray(actual) &&
        actual.length === expected.length &&
        actual.every((part, partIndex) => part === expected[partIndex])
      )
    })
  )
}
