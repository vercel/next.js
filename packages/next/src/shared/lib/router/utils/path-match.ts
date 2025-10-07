import type { Key } from 'next/dist/compiled/path-to-regexp'
import { regexpToFunction } from 'next/dist/compiled/path-to-regexp'
import { pathToRegexp } from 'next/dist/compiled/path-to-regexp'

interface Options {
  /**
   * A transformer function that will be applied to the regexp generated
   * from the provided path and path-to-regexp.
   */
  regexModifier?: (regex: string) => string
  /**
   * When true the function will remove all unnamed parameters
   * from the matched parameters.
   */
  removeUnnamedParams?: boolean
  /**
   * When true the regexp won't allow an optional trailing delimiter
   * to match.
   */
  strict?: boolean

  /**
   * When true the matcher will be case-sensitive, defaults to false
   */
  sensitive?: boolean
}

export type PatchMatcher = (
  pathname: string,
  params?: Record<string, any>
) => Record<string, any> | false

/**
 * Generates a path matcher function for a given path and options based on
 * path-to-regexp. By default the match will be case insensitive, non strict
 * and delimited by `/`.
 */
export function getPathMatch(path: string, options?: Options): PatchMatcher {
  const keys: Key[] = []
  const regexp = pathToRegexp(path, keys, {
    delimiter: '/',
    sensitive:
      typeof options?.sensitive === 'boolean' ? options.sensitive : false,
    strict: options?.strict,
  })

  const matcher = regexpToFunction<Record<string, any>>(
    options?.regexModifier
      ? new RegExp(options.regexModifier(regexp.source), regexp.flags)
      : regexp,
    keys
  )

  /**
   * A matcher function that will check if a given pathname matches the path
   * given in the builder function. When the path does not match it will return
   * `false` but if it does it will return an object with the matched params
   * merged with the params provided in the second argument.
   */
  return (pathname, params) => {
    // If no pathname is provided it's not a match.
    if (typeof pathname !== 'string') return false

    const match = matcher(pathname)

    // If the path did not match `false` will be returned.
    if (!match) return false

    /**
     * If unnamed params are not allowed they must be removed from
     * the matched parameters. path-to-regexp uses "string" for named and
     * "number" for unnamed parameters.
     */
    if (options?.removeUnnamedParams) {
      for (const key of keys) {
        if (typeof key.name === 'number') {
          delete match.params[key.name]
        }
      }
    }

    return { ...params, ...match.params }
  }
}
