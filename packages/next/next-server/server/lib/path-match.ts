// We borrow this code from https://github.com/pillarjs/path-match
// That's because, ^^^ package comes with very old version of path-to-regexp
// So, it'll give us issues when the app has used a newer version of path-to-regexp
// (When webpack resolving packages)
const pathToRegexp = require('path-to-regexp')

export default () => {
  return (path: string) => {
    const keys: any[] = []
    const re = pathToRegexp(path, keys, {})

    return (pathname: string | undefined, params?: any) => {
      const m = re.exec(pathname)
      if (!m) return false

      params = params || {}

      let key
      let param
      for (let i = 0; i < keys.length; i++) {
        key = keys[i]
        param = m[i + 1]
        if (!param) continue
        params[key.name] = decodeParam(param)
        if (key.repeat) params[key.name] = params[key.name].split(key.delimiter)
      }

      return params
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
