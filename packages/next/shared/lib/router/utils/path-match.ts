import type { Key } from 'next/dist/compiled/path-to-regexp'
import { pathToRegexp } from 'next/dist/compiled/path-to-regexp'
import { regexpToFunction } from 'next/dist/compiled/path-to-regexp'

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
}

/**
 * Generates a path matcher function for a given path and options based on
 * path-to-regexp. By default the match will be case insensitive, non strict
 * and delimited by `/`.
 */
export function getPathMatch(path: string, options?: Options) {
  const keys: Key[] = []
  const regexp = pathToRegexp(path, keys, {
    delimiter: '/',
    sensitive: false,
    strict: options?.strict,
  })

  const matcher = regexpToFunction(
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
  return <T extends { [key: string]: any }>(
    pathname?: string | null,
    params?: any
  ): false | T => {
    const res = pathname == null ? false : matcher(pathname)
    if (!res) {
      return false
    }

    /**
     * If unnamed params are not allowed they must be removed from
     * the matched parameters. path-to-regexp uses "string" for named and
     * "number" for unnamed parameters.
     */
    if (options?.removeUnnamedParams) {
      for (const key of keys) {
        if (typeof key.name === 'number') {
          delete (res.params as any)[key.name]
        }
      }
    }

    return { ...params, ...res.params }
  }
}
