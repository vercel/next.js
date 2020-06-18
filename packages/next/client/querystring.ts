function stringifyPrimitive(v: any) {
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

const stringify: typeof import('querystring').stringify = (
  obj,
  sep,
  eq,
  name
) => {
  sep = sep || '&'
  eq = eq || '='

  if (obj && typeof obj === 'object') {
    return Object.keys(obj)
      .map(function (k) {
        var ks = encodeURIComponent(stringifyPrimitive(k)) + eq
        if (Array.isArray(obj[k])) {
          return (obj[k] as any[])
            .map(function (v: any) {
              return ks + encodeURIComponent(stringifyPrimitive(v))
            })
            .join(sep)
        } else {
          return ks + encodeURIComponent(stringifyPrimitive(obj[k]))
        }
      })
      .join(sep)
  }

  if (!name) return ''
  return (
    encodeURIComponent(stringifyPrimitive(name)) +
    eq +
    encodeURIComponent(stringifyPrimitive(obj))
  )
}

function hasOwnProperty(obj: any, prop: string) {
  return Object.prototype.hasOwnProperty.call(obj, prop)
}

const parse: typeof import('querystring').parse = (qs, sep, eq, options) => {
  // use URLSearchParams if no legacy options provided
  if (!sep && !eq && !options) {
    const parsed = new URLSearchParams(qs)
    return Array.from(parsed.keys()).reduce((prev, key) => {
      prev[key] = parsed.getAll(key)

      if (prev[key].length === 1) {
        prev[key] = prev[key].pop()
      }
      return prev
    }, {} as any)
  }

  sep = sep || '&'
  eq = eq || '='

  const obj: ReturnType<typeof import('querystring').decode> = {}

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj
  }

  var regexp = /\+/g
  const qsParts = qs.split(sep)

  var maxKeys = 1000
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys
  }

  var len = qsParts.length
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys
  }

  for (var i = 0; i < len; ++i) {
    var x = qsParts[i].replace(regexp, '%20'),
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

    k = decodeURIComponent(kstr)
    v = decodeURIComponent(vstr)

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v
    } else if (Array.isArray(obj[k])) {
      ;(obj[k] as string[]).push(v)
    } else {
      obj[k] = [obj[k] as string, v]
    }
  }

  return obj
}

export { parse, parse as decode, stringify, stringify as encode }
