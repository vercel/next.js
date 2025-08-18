import type { DynamicParam } from '../../../../server/app-render/app-render'
import type { DynamicParamTypesShort } from '../../../../server/app-render/types'
import type { FallbackRouteParams } from '../../../../server/request/fallback-params'

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
  params: { [key: string]: any },
  segmentKey: string,
  dynamicParamType: DynamicParamTypesShort,
  pagePath: string,
  fallbackRouteParams: FallbackRouteParams | null
): DynamicParam {
  let value = params[segmentKey]

  if (fallbackRouteParams && fallbackRouteParams.has(segmentKey)) {
    value = fallbackRouteParams.get(segmentKey)
  } else if (Array.isArray(value)) {
    value = value.map((i) => encodeURIComponent(i))
  } else if (typeof value === 'string') {
    value = encodeURIComponent(value)
  }

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
      value = pagePath
        .split('/')
        // remove the first empty string
        .slice(1)
        // replace any dynamic params with the actual values
        .flatMap((pathSegment) => {
          const param = parseParameter(pathSegment)
          // if the segment matches a param, return the param value
          // otherwise, it's a static segment, so just return that
          return params[param.key] ?? param.key
        })

      return {
        param: segmentKey,
        value,
        type: dynamicParamType,
        // This value always has to be a string.
        treeSegment: [segmentKey, value.join('/'), dynamicParamType],
      }
    }
  }

  return {
    param: segmentKey,
    // The value that is passed to user code.
    value: value,
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
