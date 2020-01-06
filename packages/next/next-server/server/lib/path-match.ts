import * as pathToRegexp from 'path-to-regexp'

export { pathToRegexp }

export default (customRoute = false) => {
  return (path: string) => {
    const matcher = pathToRegexp.match(path, {
      sensitive: false,
      delimiter: '/',
      ...(customRoute ? { strict: true } : undefined),
      decode: decodeParam,
    })

    return (pathname: string | null | undefined, params?: any) => {
      const res = pathname == null ? false : matcher(pathname)
      if (!res) {
        return false
      }

      if (customRoute) {
        const newParams: { [k: string]: string } = {}
        Object.keys(res.params).forEach((key, idx) => {
          if (key === idx + '') {
            newParams[idx + 1 + ''] = (res.params as any)[key]
          }
        })
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
