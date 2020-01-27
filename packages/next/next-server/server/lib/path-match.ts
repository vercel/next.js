import * as pathToRegexp from 'path-to-regexp'

export { pathToRegexp }

export default (customRoute = false) => {
  return (path: string) => {
    const keys: pathToRegexp.Key[] = []
    const matcherOptions = {
      sensitive: false,
      delimiter: '/',
      ...(customRoute ? { strict: true } : undefined),
      decode: decodeParam,
    }
    const matcherRegex = pathToRegexp.pathToRegexp(path, keys, matcherOptions)
    const matcher = pathToRegexp.regexpToFunction(
      matcherRegex,
      keys,
      matcherOptions
    )

    const wrappedMatcher = (
      pathname: string | null | undefined,
      params?: any
    ) => {
      const res = pathname == null ? false : matcher(pathname)
      if (!res) {
        return false
      }

      return { ...params, ...res.params }
    }
    ;(wrappedMatcher as any).keys = keys as any
    return wrappedMatcher
  }
}

function decodeParam(param: string) {
  try {
    return decodeURIComponent(param)
  } catch (_) {
    const err = new Error('failed to decode param')
    // @ts-ignore DECODE_FAILED is handled
    err.code = 'DECODE_FAILED'
    throw err
  }
}
