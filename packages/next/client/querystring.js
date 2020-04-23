// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707

// This is a modified version of querystring-es3 to allow passing
// an option for custom decodeURIComponent logic which matches
// the built-in node options https://nodejs.org/api/querystring.html#querystring_querystring_parse_str_sep_eq_options

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop)
}

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v

    case 'boolean':
      return v ? 'true' : 'false'

    case 'number':
      return isFinite(v) ? v : ''

    default:
      return ''
  }
}

export function encode(obj, sep, eq, name) {
  sep = sep || '&'
  eq = eq || '='
  if (obj === null) {
    obj = undefined
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq
      if (isArray(obj[k])) {
        return map(obj[k], function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v))
        }).join(sep)
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]))
      }
    }).join(sep)
  }

  if (!name) return ''
  return (
    encodeURIComponent(stringifyPrimitive(name)) +
    eq +
    encodeURIComponent(stringifyPrimitive(obj))
  )
}

var isArray =
  Array.isArray ||
  function(xs) {
    return Object.prototype.toString.call(xs) === '[object Array]'
  }

function map(xs, f) {
  if (xs.map) return xs.map(f)
  var res = []
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i))
  }
  return res
}

var objectKeys =
  Object.keys ||
  function(obj) {
    var res = []
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key)
    }
    return res
  }

export function decode(qs, sep, eq, options) {
  sep = sep || '&'
  eq = eq || '='
  var obj = {}
  options = options || {}

  var decodeComponent = options.decodeURIComponent || decodeURIComponent

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj
  }

  var regexp = /\+/g
  qs = qs.split(sep)

  var maxKeys = 1000
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys
  }

  var len = qs.length
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
      idx = x.indexOf(eq),
      kstr,
      vstr,
      k,
      v

    if (idx >= 0) {
      kstr = x.substr(0, idx)
      vstr = x.substr(idx + 1)
    } else {
      kstr = x
      vstr = ''
    }

    k = decodeComponent(kstr)
    v = decodeComponent(vstr)

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v
    } else if (isArray(obj[k])) {
      obj[k].push(v)
    } else {
      obj[k] = [obj[k], v]
    }
  }

  return obj
}

export const parse = decode
export const stringify = encode
