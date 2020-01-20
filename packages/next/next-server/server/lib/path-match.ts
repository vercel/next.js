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

    return (pathname: string | null | undefined, params?: any) => {
      const res = pathname == null ? false : matcher(pathname)
      if (!res) {
        return false
      }

      if (customRoute) {
        const newParams: { [k: string]: string } = {}
        for (const key of keys) {
          // unnamed matches should always be a number while named
          // should be a string
          if (typeof key.name === 'number') {
            newParams[key.name + 1 + ''] = (res.params as any)[key.name + '']
            delete (res.params as any)[key.name + '']
          }
        }
        res.params = {
          ...res.params,
          ...newParams,
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
    const err = new Error('failed to decode param')
    // @ts-ignore DECODE_FAILED is handled
    err.code = 'DECODE_FAILED'
    throw err
  }
}
