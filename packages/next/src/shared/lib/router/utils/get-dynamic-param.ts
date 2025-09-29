import type { DynamicParam } from '../../../../server/app-render/app-render'
import type { OpaqueFallbackRouteParams } from '../../../../server/request/fallback-params'
import type { Params } from '../../../../server/request/params'
import type { DynamicParamTypesShort } from '../../app-router-types'
import { InvariantError } from '../../invariant-error'

/**
 * Gets the value of a param from the params object. This correctly handles the
 * case where the param is a fallback route param and encodes the resulting
 * value.
 *
 * @param params - The params object.
 * @param segmentKey - The key of the segment.
 * @param fallbackRouteParams - The fallback route params.
 * @returns The value of the param.
 */
function getParamValue(
  params: Params,
  segmentKey: string,
  fallbackRouteParams: OpaqueFallbackRouteParams | null
) {
  let value = params[segmentKey]

  if (fallbackRouteParams && fallbackRouteParams.has(segmentKey)) {
    // We know that the fallback route params has the segment key because we
    // checked that above.
    const [searchValue] = fallbackRouteParams.get(segmentKey)!
    value = searchValue
  } else if (Array.isArray(value)) {
    value = value.map((i) => encodeURIComponent(i))
  } else if (typeof value === 'string') {
    value = encodeURIComponent(value)
  }

  return value
}

/**
 *
 * Shared logic on client and server for creating a dynamic param value.
 *
 * This code needs to be shared with the client so it can extract dynamic route
 * params from the URL without a server request.
 *
 * Because everything in this module is sent to the client, we should aim to
 * keep this code as simple as possible. The special case handling for catchall
 * and optional is, alas, unfortunate.
 */
export function getDynamicParam(
  params: Params,
  segmentKey: string,
  dynamicParamType: DynamicParamTypesShort,
  pagePath: string,
  fallbackRouteParams: OpaqueFallbackRouteParams | null
): DynamicParam {
  let value: string | string[] | undefined = getParamValue(
    params,
    segmentKey,
    fallbackRouteParams
  )

  if (!value) {
    const isCatchall = dynamicParamType === 'c'
    const isOptionalCatchall = dynamicParamType === 'oc'

    if (isCatchall || isOptionalCatchall) {
      // handle the case where an optional catchall does not have a value,
      // e.g. `/dashboard/[[...slug]]` when requesting `/dashboard`
      if (isOptionalCatchall) {
        return {
          param: segmentKey,
          value: null,
          type: dynamicParamType,
          treeSegment: [segmentKey, '', dynamicParamType],
        }
      }

      // handle the case where a catchall or optional catchall does not have a value,
      // e.g. `/foo/bar/hello` and `@slot/[...catchall]` or `@slot/[[...catchall]]` is matched
      // FIXME: (NAR-335) this should handle prefixed segments
      value = pagePath
        .split('/')
        // remove the first empty string
        .slice(1)
        // replace any dynamic params with the actual values
        .flatMap((pathSegment) => {
          const param = parseParameter(pathSegment)

          // if the segment matches a param, return the param value
          // otherwise, it's a static segment, so just return that
          return (
            getParamValue(params, param.key, fallbackRouteParams) ?? param.key
          )
        })

      if (!value) {
        throw new InvariantError(
          `No value found for segment key: "${segmentKey}"`
        )
      }

      return {
        param: segmentKey,
        value,
        type: dynamicParamType,
        // This value always has to be a string.
        treeSegment: [segmentKey, value.join('/'), dynamicParamType],
      }
    } else {
      throw new InvariantError(
        `Unexpected dynamic param type: ${dynamicParamType}`
      )
    }
  }

  return {
    param: segmentKey,
    // The value that is passed to user code.
    value,
    // The value that is rendered in the router tree.
    treeSegment: [
      segmentKey,
      Array.isArray(value) ? value.join('/') : value,
      dynamicParamType,
    ],
    type: dynamicParamType,
  }
}

/**
 * Regular expression pattern used to match route parameters.
 * Matches both single parameters and parameter groups.
 * Examples:
 *   - `[[...slug]]` matches parameter group with key 'slug', repeat: true, optional: true
 *   - `[...slug]` matches parameter group with key 'slug', repeat: true, optional: false
 *   - `[[foo]]` matches parameter with key 'foo', repeat: false, optional: true
 *   - `[bar]` matches parameter with key 'bar', repeat: false, optional: false
 */
export const PARAMETER_PATTERN = /^([^[]*)\[((?:\[[^\]]*\])|[^\]]+)\](.*)$/

/**
 * Parses a given parameter from a route to a data structure that can be used
 * to generate the parametrized route.
 * Examples:
 *   - `[[...slug]]` -> `{ key: 'slug', repeat: true, optional: true }`
 *   - `[...slug]` -> `{ key: 'slug', repeat: true, optional: false }`
 *   - `[[foo]]` -> `{ key: 'foo', repeat: false, optional: true }`
 *   - `[bar]` -> `{ key: 'bar', repeat: false, optional: false }`
 *   - `fizz` -> `{ key: 'fizz', repeat: false, optional: false }`
 * @param param - The parameter to parse.
 * @returns The parsed parameter as a data structure.
 */
export function parseParameter(param: string) {
  const match = param.match(PARAMETER_PATTERN)

  if (!match) {
    return parseMatchedParameter(param)
  }

  return parseMatchedParameter(match[2])
}

/**
 * Parses a matched parameter from the PARAMETER_PATTERN regex to a data structure that can be used
 * to generate the parametrized route.
 * Examples:
 *   - `[...slug]` -> `{ key: 'slug', repeat: true, optional: true }`
 *   - `...slug` -> `{ key: 'slug', repeat: true, optional: false }`
 *   - `[foo]` -> `{ key: 'foo', repeat: false, optional: true }`
 *   - `bar` -> `{ key: 'bar', repeat: false, optional: false }`
 * @param param - The matched parameter to parse.
 * @returns The parsed parameter as a data structure.
 */
export function parseMatchedParameter(param: string) {
  const optional = param.startsWith('[') && param.endsWith(']')
  if (optional) {
    param = param.slice(1, -1)
  }
  const repeat = param.startsWith('...')
  if (repeat) {
    param = param.slice(3)
  }
  return { key: param, repeat, optional }
}
