// We borrow this code from https://github.com/pillarjs/path-match
// That's because, ^^^ package comes with very old version of path-to-regexp
// So, it'll give us issues when the app has used a newer version of path-to-regexp
// (When webpack resolving packages)
var pathToRegexp = require('path-to-regexp')

module.exports = function (options) {
  options = options || {}

  return function (path) {
    var keys = []
    var re = pathToRegexp(path, keys, options)

    return function (pathname, params) {
      var m = re.exec(pathname)
      if (!m) return false

      params = params || {}

      var key, param
      for (var i = 0; i < keys.length; i++) {
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

function decodeParam (param) {
  try {
    return decodeURIComponent(param)
  } catch (_) {
    const err = new Error('failed to decode param')
    err.code = 'DECODE_FAILED'
    throw err
  }
}
