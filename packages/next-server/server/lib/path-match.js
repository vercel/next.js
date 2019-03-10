const regexparam = require('regexparam')

module.exports = function () {
  return function (path) {
    var result = regexparam(path)

    return function (pathname) {
      let i = 0

      let out = {}
      let matches = result.pattern.exec(pathname)
      if (!matches) return false
      while (i < result.keys.length) {
        const baseKey = result.keys[i]
        const key = baseKey === 'wild' ? 'path' : baseKey
        const value = matches[++i]
        out[key] = key === 'path' ? segmentize(value).map(decodeParam) : value
      }
      return out
    }
  }
}

// https://github.com/developit/preact-router/blob/458b62be57ffd69f8338c0b5f2743401575ed5ea/src/util.js#L68
function segmentize (url) {
  return url.replace(/(^\/+|\/+$)/g, '').split('/')
}

function decodeParam (param) {
  try {
    return decodeURIComponent(param)
  } catch (_) {
    const err = new Error('failed to decode param')
    err.code = 'DECODE_FAILED'
    throw err
  }
}
