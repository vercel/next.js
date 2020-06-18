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

// Query String Utilities

// This applies a patch to the original node querystring to ensure the
// query parsing behavior matches the whatwg standard
// https://github.com/nodejs/node/issues/33892

const hexTable = new Array(256)

for (let i = 0; i < 256; ++i) {
  hexTable[i] = '%' + ((i < 16 ? '0' : '') + i.toString(16)).toUpperCase()
}

function encodeStr(str: string, noEscapeTable: any, curHexTable: any) {
  const len = str.length
  if (len === 0) return ''

  let out = ''
  let lastPos = 0

  for (let i = 0; i < len; i++) {
    let c = str.charCodeAt(i)

    // ASCII
    if (c < 0x80) {
      if (noEscapeTable[c] === 1) continue
      if (lastPos < i) out += str.slice(lastPos, i)
      lastPos = i + 1
      out += curHexTable[c]
      continue
    }

    if (lastPos < i) out += str.slice(lastPos, i)

    // Multi-byte characters ...
    if (c < 0x800) {
      lastPos = i + 1
      out += curHexTable[0xc0 | (c >> 6)] + curHexTable[0x80 | (c & 0x3f)]
      continue
    }
    if (c < 0xd800 || c >= 0xe000) {
      lastPos = i + 1
      out +=
        curHexTable[0xe0 | (c >> 12)] +
        curHexTable[0x80 | ((c >> 6) & 0x3f)] +
        curHexTable[0x80 | (c & 0x3f)]
      continue
    }
    // Surrogate pair
    ++i

    // This branch should never happen because all URLSearchParams entries
    // should already be converted to USVString. But, included for
    // completion's sake anyway.
    if (i >= len) {
      const error = new Error('URI malformed')
      ;(error as any).code = 'ERR_INVALID_URI'
      throw error
    }

    const c2 = str.charCodeAt(i) & 0x3ff

    lastPos = i + 1
    c = 0x10000 + (((c & 0x3ff) << 10) | c2)
    out +=
      curHexTable[0xf0 | (c >> 18)] +
      curHexTable[0x80 | ((c >> 12) & 0x3f)] +
      curHexTable[0x80 | ((c >> 6) & 0x3f)] +
      curHexTable[0x80 | (c & 0x3f)]
  }
  if (lastPos === 0) return str
  if (lastPos < len) return out + str.slice(lastPos)
  return out
}

const isHexChar = (charCode: number) => {
  return (
    // 0 - 9
    (charCode >= 48 && charCode <= 57) ||
    // A - F
    (charCode >= 65 && charCode <= 70) ||
    // a - f
    (charCode >= 97 && charCode <= 102)
  )
}

// A safe fast alternative to decodeURIComponent
function unescapeBuffer(s: string, decodeSpaces?: boolean) {
  const out = Buffer.allocUnsafe(s.length)
  let index = 0
  let outIndex = 0
  let currentChar
  const maxLength = s.length - 2

  // Flag to know if some hex chars have been decoded
  let hasHex = false
  while (index < s.length) {
    currentChar = s.charCodeAt(index)
    if (currentChar === 43 /* '+' */ && decodeSpaces) {
      out[outIndex++] = 32 // ' '
      index++
      continue
    }
    if (currentChar === 37 /* '%' */ && index < maxLength) {
      const charN1 = s.charCodeAt(index + 1)
      const charN2 = s.charCodeAt(index + 2)

      if (isHexChar(charN1) && isHexChar(charN2)) {
        const decodedChar = parseInt(
          String.fromCharCode(charN1) + String.fromCharCode(charN2),
          16
        )
        hasHex = true
        index += 3
        out[outIndex++] = decodedChar // decoded hex value
        continue
      }
    }
    out[outIndex++] = currentChar
    index++
  }
  return hasHex ? out.slice(0, outIndex) : out
}

function qsUnescape(s: string, decodeSpaces?: boolean) {
  try {
    return decodeURIComponent(s)
  } catch (err) {
    return unescapeBuffer(s, decodeSpaces).toString()
  }
}

// These characters do not need escaping when generating query strings:
// ! - . _ ~
// ' ( ) *
// digits
// alpha (uppercase)
// alpha (lowercase)
const noEscape = [
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0, // 0 - 15
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0, // 16 - 31
  0,
  1,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  0,
  0,
  1,
  1,
  0, // 32 - 47
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  0,
  0,
  0,
  0,
  0,
  0, // 48 - 63
  0,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1, // 64 - 79
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  0,
  0,
  0,
  0,
  1, // 80 - 95
  0,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1, // 96 - 111
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  0,
  0,
  0,
  1,
  0, // 112 - 127
]
// escape() replaces encodeURIComponent()
// http://www.ecma-international.org/ecma-262/5.1/#sec-15.1.3.4
function qsEscape(str: any) {
  if (typeof str !== 'string') {
    if (typeof str === 'object') str = String(str)
    else str += ''
  }

  return encodeStr(str, noEscape, hexTable)
}

function stringifyPrimitive(v: any) {
  if (typeof v === 'string') return v
  if (typeof v === 'number' && isFinite(v)) return '' + v
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return ''
}

function stringify(
  obj: any,
  sep: string,
  eq: string,
  options: import('querystring').StringifyOptions
) {
  sep = sep || '&'
  eq = eq || '='

  let encode = qsEscape
  if (options && typeof options.encodeURIComponent === 'function') {
    encode = options.encodeURIComponent
  }

  if (obj !== null && typeof obj === 'object') {
    const keys = Object.keys(obj)
    const len = keys.length
    const flast = len - 1
    let fields = ''
    for (let i = 0; i < len; ++i) {
      const k = keys[i]
      const v = obj[k]
      let ks = encode(stringifyPrimitive(k))
      ks += eq

      if (Array.isArray(v)) {
        const vlen = v.length
        if (vlen === 0) continue
        const vlast = vlen - 1
        for (let j = 0; j < vlen; ++j) {
          fields += ks
          fields += encode(stringifyPrimitive(v[j]))
          if (j < vlast) fields += sep
        }
      } else {
        fields += ks
        fields += encode(stringifyPrimitive(v))
      }

      if (i < flast) fields += sep
    }
    return fields
  }
  return ''
}

function charCodes(str: string) {
  if (str.length === 0) return []
  if (str.length === 1) return [str.charCodeAt(0)]
  const ret = new Array(str.length)
  for (let i = 0; i < str.length; ++i) ret[i] = str.charCodeAt(i)
  return ret
}
const defSepCodes = [38] // &
const defEqCodes = [61] // =

function addKeyVal(
  obj: any,
  key: string,
  value: string,
  keyEncoded: boolean,
  valEncoded: boolean,
  decode: any
) {
  if (key.length > 0 && keyEncoded) key = decodeStr(key, decode)
  if (value.length > 0 && valEncoded) value = decodeStr(value, decode)

  if (obj[key] === undefined) {
    obj[key] = value
  } else {
    const curValue = obj[key]
    // A simple Array-specific property check is enough here to
    // distinguish from a string value and is faster and still safe
    // since we are generating all of the values being assigned.
    if (curValue.pop) curValue[curValue.length] = value
    else obj[key] = [curValue, value]
  }
}

// Parse a key/val string.
function parse(
  qs: string,
  sep?: string,
  eq?: string,
  options?: import('querystring').ParseOptions
) {
  const obj = Object.create(null)

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj
  }

  const sepCodes = !sep ? defSepCodes : charCodes(sep + '')
  const eqCodes = !eq ? defEqCodes : charCodes(eq + '')
  const sepLen = sepCodes.length
  const eqLen = eqCodes.length

  let pairs = 1000
  if (options && typeof options.maxKeys === 'number') {
    // -1 is used in place of a value like Infinity for meaning
    // "unlimited pairs" because of additional checks V8 (at least as of v5.4)
    // has to do when using variables that contain values like Infinity. Since
    // `pairs` is always decremented and checked explicitly for 0, -1 works
    // effectively the same as Infinity, while providing a significant
    // performance boost.
    pairs = options.maxKeys > 0 ? options.maxKeys : -1
  }

  let decode = qsUnescape
  if (options && typeof options.decodeURIComponent === 'function') {
    decode = options.decodeURIComponent
  }
  const customDecode = decode !== qsUnescape

  let lastPos = 0
  let sepIdx = 0
  let eqIdx = 0
  let key = ''
  let value = ''
  let keyEncoded = customDecode
  let valEncoded = customDecode
  const plusChar = customDecode ? '%20' : ' '
  let encodeCheck = 0
  for (let i = 0; i < qs.length; ++i) {
    const code = qs.charCodeAt(i)

    // Try matching key/value pair separator (e.g. '&')
    if (code === sepCodes[sepIdx]) {
      if (++sepIdx === sepLen) {
        // Key/value pair separator match!
        const end = i - sepIdx + 1
        if (eqIdx < eqLen) {
          // We didn't find the (entire) key/value separator
          if (lastPos < end) {
            // Treat the substring as part of the key instead of the value
            key += qs.slice(lastPos, end)
          } else if (key.length === 0) {
            // We saw an empty substring between separators
            if (--pairs === 0) return obj
            lastPos = i + 1
            sepIdx = eqIdx = 0
            continue
          }
        } else if (lastPos < end) {
          value += qs.slice(lastPos, end)
        }

        addKeyVal(obj, key, value, keyEncoded, valEncoded, decode)

        if (--pairs === 0) return obj
        keyEncoded = valEncoded = customDecode
        key = value = ''
        encodeCheck = 0
        lastPos = i + 1
        sepIdx = eqIdx = 0
      }
    } else {
      sepIdx = 0
      // Try matching key/value separator (e.g. '=') if we haven't already
      if (eqIdx < eqLen) {
        if (code === eqCodes[eqIdx]) {
          if (++eqIdx === eqLen) {
            // Key/value separator match!
            const end = i - eqIdx + 1
            if (lastPos < end) key += qs.slice(lastPos, end)
            encodeCheck = 0
            lastPos = i + 1
          }
          continue
        } else {
          eqIdx = 0
          if (!keyEncoded) {
            // Try to match an (valid) encoded byte once to minimize unnecessary
            // calls to string decoding functions
            if (code === 37 /* % */) {
              encodeCheck = 1
              continue
            } else if (encodeCheck > 0) {
              if (isHexChar(code)) {
                if (++encodeCheck === 3) keyEncoded = true
                continue
              } else {
                encodeCheck = 0
              }
            }
          }
        }
        if (code === 43 /* + */) {
          if (lastPos < i) key += qs.slice(lastPos, i)
          key += plusChar
          lastPos = i + 1
          continue
        }
      }
      if (code === 43 /* + */) {
        if (lastPos < i) value += qs.slice(lastPos, i)
        value += plusChar
        lastPos = i + 1
      } else if (!valEncoded) {
        // Try to match an (valid) encoded byte (once) to minimize unnecessary
        // calls to string decoding functions
        if (code === 37 /* % */) {
          encodeCheck = 1
        } else if (encodeCheck > 0) {
          if (isHexChar(code)) {
            if (++encodeCheck === 3) valEncoded = true
          } else {
            encodeCheck = 0
          }
        }
      }
    }
  }

  // Deal with any leftover key or value data
  if (lastPos < qs.length) {
    if (eqIdx < eqLen) key += qs.slice(lastPos)
    else if (sepIdx < sepLen) value += qs.slice(lastPos)
  } else if (eqIdx === 0 && key.length === 0) {
    // We ended on an empty substring
    return obj
  }

  addKeyVal(obj, key, value, keyEncoded, valEncoded, decode)

  return obj
}

// v8 does not optimize functions with try-catch blocks, so we isolate them here
// to minimize the damage (Note: no longer true as of V8 5.4 -- but still will
// not be inlined).
function decodeStr(s: string, decoder: any) {
  try {
    return decoder(s)
  } catch (err) {
    return qsUnescape(s)
  }
}

export {
  unescapeBuffer,
  // `unescape()` is a JS global, so we need to use a different local name
  qsUnescape as unescape,
  // `escape()` is a JS global, so we need to use a different local name
  qsEscape as escape,
  stringify,
  stringify as encode,
  parse,
  parse as decode,
}

export {
  StringifyOptions,
  ParseOptions,
  ParsedUrlQuery,
  ParsedUrlQueryInput,
} from 'querystring'
