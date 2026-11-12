/* !
 * Chai - pathval utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * @see https://github.com/logicalparadox/filtr
 * MIT Licensed
 */

export function hasProperty(obj, name) {
  if (typeof obj === 'undefined' || obj === null) {
    return false
  }

  // The `in` operator does not work with primitives.
  return name in Object(obj)
}

/* !
 * ## parsePath(path)
 *
 * Helper function used to parse string object
 * paths. Use in conjunction with `internalGetPathValue`.
 *
 *      var parsed = parsePath('myobject.property.subprop');
 *
 * ### Paths:
 *
 * * Can be infinitely deep and nested.
 * * Arrays are also valid using the formal `myobject.document[3].property`.
 * * Literal dots and brackets (not delimiter) must be backslash-escaped.
 *
 * @param {String} path
 * @returns {Object} parsed
 * @api private
 */

function parsePath(path) {
  const str = path.replace(/([^\\])\[/g, '$1.[')
  const parts = str.match(/(\\\.|[^.]+?)+/g)
  return parts.map((value) => {
    if (
      value === 'constructor' ||
      value === '__proto__' ||
      value === 'prototype'
    ) {
      return {}
    }
    const regexp = /^\[(\d+)\]$/
    const mArr = regexp.exec(value)
    let parsed = null
    if (mArr) {
      parsed = { i: parseFloat(mArr[1]) }
    } else {
      parsed = { p: value.replace(/\\([.[\]])/g, '$1') }
    }

    return parsed
  })
}

/* !
 * ## internalGetPathValue(obj, parsed[, pathDepth])
 *
 * Helper companion function for `.parsePath` that returns
 * the value located at the parsed address.
 *
 *      var value = getPathValue(obj, parsed);
 *
 * @param {Object} object to search against
 * @param {Object} parsed definition from `parsePath`.
 * @param {Number} depth (nesting level) of the property we want to retrieve
 * @returns {Object|Undefined} value
 * @api private
 */

function internalGetPathValue(obj, parsed, pathDepth) {
  let temporaryValue = obj
  let res = null
  pathDepth = typeof pathDepth === 'undefined' ? parsed.length : pathDepth

  for (let i = 0; i < pathDepth; i++) {
    const part = parsed[i]
    if (temporaryValue) {
      if (typeof part.p === 'undefined') {
        temporaryValue = temporaryValue[part.i]
      } else {
        temporaryValue = temporaryValue[part.p]
      }

      if (i === pathDepth - 1) {
        res = temporaryValue
      }
    }
  }

  return res
}

/* !
 * ## internalSetPathValue(obj, value, parsed)
 *
 * Companion function for `parsePath` that sets
 * the value located at a parsed address.
 *
 *  internalSetPathValue(obj, 'value', parsed);
 *
 * @param {Object} object to search and define on
 * @param {*} value to use upon set
 * @param {Object} parsed definition from `parsePath`
 * @api private
 */

function internalSetPathValue(obj, val, parsed) {
  let tempObj = obj
  const pathDepth = parsed.length
  let part = null
  // Here we iterate through every part of the path
  for (let i = 0; i < pathDepth; i++) {
    let propName = null
    let propVal = null
    part = parsed[i]

    // If it's the last part of the path, we set the 'propName' value with the property name
    if (i === pathDepth - 1) {
      propName = typeof part.p === 'undefined' ? part.i : part.p
      // Now we set the property with the name held by 'propName' on object with the desired val
      tempObj[propName] = val
    } else if (typeof part.p !== 'undefined' && tempObj[part.p]) {
      tempObj = tempObj[part.p]
    } else if (typeof part.i !== 'undefined' && tempObj[part.i]) {
      tempObj = tempObj[part.i]
    } else {
      // If the obj doesn't have the property we create one with that name to define it
      const next = parsed[i + 1]
      // Here we set the name of the property which will be defined
      propName = typeof part.p === 'undefined' ? part.i : part.p
      // Here we decide if this property will be an array or a new object
      propVal = typeof next.p === 'undefined' ? [] : {}
      tempObj[propName] = propVal
      tempObj = tempObj[propName]
    }
  }
}

export function getPathInfo(obj, path) {
  const parsed = parsePath(path)
  const last = parsed[parsed.length - 1]
  const info = {
    parent:
      parsed.length > 1
        ? internalGetPathValue(obj, parsed, parsed.length - 1)
        : obj,
    name: last.p || last.i,
    value: internalGetPathValue(obj, parsed),
  }
  info.exists = hasProperty(info.parent, info.name)

  return info
}

export function getPathValue(obj, path) {
  const info = getPathInfo(obj, path)
  return info.value
}

export function setPathValue(obj, path, val) {
  const parsed = parsePath(path)
  internalSetPathValue(obj, val, parsed)
  return obj
}
