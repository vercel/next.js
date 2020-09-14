import * as pathToRegexp from 'next/dist/compiled/path-to-regexp'

export { pathToRegexp }

export const matcherOptions = {
  sensitive: false,
  delimiter: '/',
  decode: decodeParam,
}

export const customRouteMatcherOptions = {
  ...matcherOptions,
  strict: true,
}

export default (customRoute = false) => {
  return (path: string) => {
    const keys: pathToRegexp.Key[] = []
    const matcherRegex = pathToRegexp.pathToRegexp(
      path,
      keys,
      customRoute ? customRouteMatcherOptions : matcherOptions
    )
    const matcher = pathToRegexp.regexpToFunction(
      matcherRegex,
      keys,
      matcherOptions
    )

    return (pathname: string | null | undefined, params?: any) => {
      const res = pathname == null ? false : matcher(pathname)
      if (!res) {
        return false
      }

      if (customRoute) {
        for (const key of keys) {
          // unnamed params should be removed as they
          // are not allowed to be used in the destination
          if (typeof key.name === 'number') {
            delete (res.params as any)[key.name]
          }
        }
      }

      return { ...params, ...res.params }
    }
  }
}

function decodeParam(param: string) {
  try {
    return decodeURIComponent(param)
  } catch (_) {
    const err: Error & { code?: string } = new Error('failed to decode param')
    err.code = 'DECODE_FAILED'
    throw err
  }
}
