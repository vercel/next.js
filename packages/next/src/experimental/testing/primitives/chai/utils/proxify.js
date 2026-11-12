import { config } from '../config.js'
import { inheritAssertionIdentity } from '../assertion-identity.js'
import { flag } from './flag.js'
import { getProperties } from './getProperties.js'
import { isProxyEnabled } from './isProxyEnabled.js'

/*!
 * Chai - proxify utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

/** @type {PropertyKey[]} */
const builtins = ['__flags', '__methods', '_obj', 'assert']

export function proxify(obj, nonChainableMethodName) {
  if (!isProxyEnabled()) return obj

  const proxy = new Proxy(obj, {
    get: function proxyGetter(target, property) {
      // This check is here because we should not throw errors on Symbol properties
      // such as `Symbol.toStringTag`.
      // The values for which an error should be thrown can be configured using
      // the `config.proxyExcludedKeys` setting.
      if (
        typeof property === 'string' &&
        config.proxyExcludedKeys.indexOf(property) === -1 &&
        !Reflect.has(target, property)
      ) {
        // Special message for invalid property access of non-chainable methods.
        if (nonChainableMethodName) {
          throw Error(
            'Invalid Chai property: ' +
              String(nonChainableMethodName) +
              '.' +
              property +
              '. See docs for proper usage of "' +
              String(nonChainableMethodName) +
              '".'
          )
        }

        // If the property is reasonably close to an existing Chai property,
        // suggest that property to the user. Only suggest properties with a
        // distance less than 4.
        let suggestion = null
        let suggestionDistance = 4
        getProperties(target).forEach(function (prop) {
          if (
            // we actually mean to check `Object.prototype` here
            !Object.prototype.hasOwnProperty(prop) &&
            builtins.indexOf(prop) === -1
          ) {
            let dist = stringDistanceCapped(property, prop, suggestionDistance)
            if (dist < suggestionDistance) {
              suggestion = prop
              suggestionDistance = dist
            }
          }
        })

        if (suggestion !== null) {
          throw Error(
            'Invalid Chai property: ' +
              property +
              '. Did you mean "' +
              suggestion +
              '"?'
          )
        } else {
          throw Error('Invalid Chai property: ' + property)
        }
      }

      // Use this proxy getter as the starting point for removing implementation
      // frames from the stack trace of a failed assertion. For property
      // assertions, this prevents the proxy getter from showing up in the stack
      // trace since it's invoked before the property getter. For method and
      // chainable method assertions, this flag will end up getting changed to
      // the method wrapper, which is good since this frame will no longer be in
      // the stack once the method is invoked. Note that Chai builtin assertion
      // properties such as `__flags` are skipped since this is only meant to
      // capture the starting point of an assertion. This step is also skipped
      // if the `lockSsfi` flag is set, thus indicating that this assertion is
      // being called from within another assertion. In that case, the `ssfi`
      // flag is already set to the outer assertion's starting point.
      if (builtins.indexOf(property) === -1 && !flag(target, 'lockSsfi')) {
        flag(target, 'ssfi', proxyGetter)
      }

      return Reflect.get(target, property)
    },
  })
  inheritAssertionIdentity(obj, proxy)
  return proxy
}

function stringDistanceCapped(strA, strB, cap) {
  if (Math.abs(strA.length - strB.length) >= cap) {
    return cap
  }

  let memo = []
  // `memo` is a two-dimensional array containing distances.
  // memo[i][j] is the distance between strA.slice(0, i) and
  // strB.slice(0, j).
  for (let i = 0; i <= strA.length; i++) {
    memo[i] = Array(strB.length + 1).fill(0)
    memo[i][0] = i
  }
  for (let j = 0; j < strB.length; j++) {
    memo[0][j] = j
  }

  for (let i = 1; i <= strA.length; i++) {
    let ch = strA.charCodeAt(i - 1)
    for (let j = 1; j <= strB.length; j++) {
      if (Math.abs(i - j) >= cap) {
        memo[i][j] = cap
        continue
      }
      memo[i][j] = Math.min(
        memo[i - 1][j] + 1,
        memo[i][j - 1] + 1,
        memo[i - 1][j - 1] + (ch === strB.charCodeAt(j - 1) ? 0 : 1)
      )
    }
  }

  return memo[strA.length][strB.length]
}
