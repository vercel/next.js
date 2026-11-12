/*
Copyright (c) 2008-2016 Pivotal Labs

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { AsymmetricMatcher } from './jest-asymmetric-matchers'
import type { Tester, TesterContext } from './types'
import { isObject } from '../utils/helpers'

// Extracted out of jasmine 2.5.2
export function equals(
  a: unknown,
  b: unknown,
  customTesters?: Array<Tester>,
  strictCheck?: boolean
): boolean {
  customTesters = customTesters || []
  return eq(a, b, [], [], customTesters, strictCheck ? hasKey : hasDefinedKey)
}

const functionToString = Function.prototype.toString

export function isAsymmetric(obj: any): obj is AsymmetricMatcher<any> {
  return (
    !!obj &&
    typeof obj === 'object' &&
    'asymmetricMatch' in obj &&
    isA('Function', obj.asymmetricMatch)
  )
}

export function hasAsymmetric(obj: any, seen: Set<any> = new Set()): boolean {
  if (seen.has(obj)) {
    return false
  }
  seen.add(obj)
  if (isAsymmetric(obj)) {
    return true
  }
  if (Array.isArray(obj)) {
    return obj.some((i) => hasAsymmetric(i, seen))
  }
  if (obj instanceof Set) {
    return Array.from(obj).some((i) => hasAsymmetric(i, seen))
  }
  if (isObject(obj)) {
    return Object.values(obj).some((v) => hasAsymmetric(v, seen))
  }
  return false
}

function asymmetricMatch(a: any, b: any, customTesters: Array<Tester>) {
  const asymmetricA = isAsymmetric(a)
  const asymmetricB = isAsymmetric(b)

  if (asymmetricA && asymmetricB) {
    return undefined
  }

  // Asymmetric matchers define their own subset semantics.
  const testers = customTesters.filter(
    (tester) => !isSubsetEqualityTester(tester)
  )

  if (asymmetricA) {
    return a.asymmetricMatch(b, testers)
  }

  if (asymmetricB) {
    return b.asymmetricMatch(a, testers)
  }
}

// https://github.com/jestjs/jest/blob/905bcbced3d40cdf7aadc4cdf6fb731c4bb3dbe3/packages/expect-utils/src/utils.ts#L509
export function isError(value: unknown): value is Error {
  if (typeof Error.isError === 'function') {
    return Error.isError(value)
  }
  switch (Object.prototype.toString.call(value)) {
    case '[object Error]':
    case '[object Exception]':
    case '[object DOMException]':
      return true
    default:
      return value instanceof Error
  }
}

// Equality function lovingly adapted from isEqual in
//   [Underscore](http://underscorejs.org)
function eq(
  a: any,
  b: any,
  aStack: Array<unknown>,
  bStack: Array<unknown>,
  customTesters: Array<Tester>,
  hasKeyPredicate: any
): boolean {
  let result = true

  const asymmetricResult = asymmetricMatch(a, b, customTesters)
  if (asymmetricResult !== undefined) {
    return asymmetricResult
  }

  const testerContext: TesterContext = { equals }
  for (let i = 0; i < customTesters.length; i++) {
    const customTesterResult = customTesters[i].call(
      testerContext,
      a,
      b,
      customTesters
    )
    if (customTesterResult !== undefined) {
      return customTesterResult
    }
  }

  if (typeof URL === 'function' && a instanceof URL && b instanceof URL) {
    return a.href === b.href
  }

  if (Object.is(a, b)) {
    return true
  }

  // A strict comparison is necessary because `null == undefined`.
  if (a === null || b === null) {
    return a === b
  }

  const className = Object.prototype.toString.call(a)
  if (className !== Object.prototype.toString.call(b)) {
    return false
  }

  switch (className) {
    case '[object Boolean]':
    case '[object String]':
    case '[object Number]':
      if (typeof a !== typeof b) {
        // One is a primitive, one a `new Primitive()`
        return false
      } else if (typeof a !== 'object' && typeof b !== 'object') {
        // both are proper primitives
        return Object.is(a, b)
      } else {
        // both are `new Primitive()`s
        return Object.is(a.valueOf(), b.valueOf())
      }
    case '[object Date]': {
      const numA = +a
      const numB = +b
      // Coerce dates to numeric primitive values. Dates are compared by their
      // millisecond representations. Note that invalid dates with millisecond representations
      // of `NaN` are equivalent.
      return numA === numB || (Number.isNaN(numA) && Number.isNaN(numB))
    }
    // RegExps are compared by their source patterns and flags.
    case '[object RegExp]':
      return a.source === b.source && a.flags === b.flags
    case '[object Temporal.Instant]':
    case '[object Temporal.ZonedDateTime]':
    case '[object Temporal.PlainDateTime]':
    case '[object Temporal.PlainDate]':
    case '[object Temporal.PlainTime]':
    case '[object Temporal.PlainYearMonth]':
    case '[object Temporal.PlainMonthDay]':
      return a.equals(b)
    case '[object Temporal.Duration]':
      return a.toString() === b.toString()
  }
  if (typeof a !== 'object' || typeof b !== 'object') {
    return false
  }

  // Use DOM3 method isEqualNode (IE>=9)
  if (isDomNode(a) && isDomNode(b)) {
    return a.isEqualNode(b)
  }

  // Used to detect circular references.
  let length = aStack.length
  while (length--) {
    // Linear search. Performance is inversely proportional to the number of
    // unique nested structures.
    // circular references at same depth are equal
    // circular reference is not equal to non-circular one
    if (aStack[length] === a) {
      return bStack[length] === b
    } else if (bStack[length] === b) {
      return false
    }
  }
  // Add the first object to the stack of traversed objects.
  aStack.push(a)
  bStack.push(b)
  // Recursively compare objects and arrays.
  // Compare array lengths to determine if a deep comparison is necessary.
  if (className === '[object Array]' && a.length !== b.length) {
    return false
  }

  if (isError(a) && isError(b)) {
    try {
      return isErrorEqual(a, b, aStack, bStack, customTesters, hasKeyPredicate)
    } finally {
      aStack.pop()
      bStack.pop()
    }
  }

  // Deep compare objects.
  const aKeys = keys(a, hasKeyPredicate)
  let key
  let size = aKeys.length

  // Ensure that both objects contain the same number of properties before comparing deep equality.
  if (keys(b, hasKeyPredicate).length !== size) {
    return false
  }

  while (size--) {
    key = aKeys[size]

    // Deep compare each member
    result =
      hasKeyPredicate(b, key) &&
      eq(a[key], b[key], aStack, bStack, customTesters, hasKeyPredicate)

    if (!result) {
      return false
    }
  }
  // Remove the first object from the stack of traversed objects.
  aStack.pop()
  bStack.pop()

  return result
}

function isErrorEqual(
  a: Error,
  b: Error,
  aStack: Array<unknown>,
  bStack: Array<unknown>,
  customTesters: Array<Tester>,
  hasKeyPredicate: any
) {
  // https://nodejs.org/docs/latest-v22.x/api/assert.html#comparison-details
  // - [[Prototype]] of objects are compared using the === operator.
  // - Only enumerable "own" properties are considered.
  // - Error names, messages, causes, and errors are always compared, even if these are not enumerable properties. errors is also compared.

  let result =
    Object.prototype.toString.call(a) === Object.prototype.toString.call(b) &&
    a.name === b.name &&
    a.message === b.message
  // check Error.cause asymmetrically
  if (typeof b.cause !== 'undefined') {
    result &&= eq(
      a.cause,
      b.cause,
      aStack,
      bStack,
      customTesters,
      hasKeyPredicate
    )
  }
  // AggregateError.errors
  if (a instanceof AggregateError && b instanceof AggregateError) {
    result &&= eq(
      a.errors,
      b.errors,
      aStack,
      bStack,
      customTesters,
      hasKeyPredicate
    )
  }
  // spread to compare enumerable properties
  result &&= eq(
    { ...a },
    { ...b },
    aStack,
    bStack,
    customTesters,
    hasKeyPredicate
  )
  return result
}

function keys(
  obj: object,
  hasKeyPredicate: (obj: object, key: string) => boolean
) {
  const result = []

  for (const key in obj) {
    if (hasKeyPredicate(obj, key)) {
      result.push(key)
    }
  }
  return result.concat(
    (Object.getOwnPropertySymbols(obj) as Array<any>).filter(
      (symbol) =>
        (Object.getOwnPropertyDescriptor(obj, symbol) as PropertyDescriptor)
          .enumerable
    )
  )
}

function hasDefinedKey(obj: any, key: string) {
  return hasKey(obj, key) && obj[key] !== undefined
}

function hasKey(obj: any, key: string) {
  return Object.hasOwn(obj, key)
}

export function isA(typeName: string, value: unknown): boolean {
  return Object.prototype.toString.apply(value) === `[object ${typeName}]`
}

function isDomNode(obj: any): boolean {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'nodeType' in obj &&
    typeof obj.nodeType === 'number' &&
    'nodeName' in obj &&
    typeof obj.nodeName === 'string' &&
    'isEqualNode' in obj &&
    typeof obj.isEqualNode === 'function'
  )
}

export function fnNameFor(func: Function): string {
  if (func.name) {
    return func.name
  }

  const matches = functionToString
    .call(func)
    .match(/^(?:async)?\s*function\s*(?:\*\s*)?([\w$]+)\s*\(/)
  return matches ? matches[1] : '<anonymous>'
}

function getPrototype(obj: object) {
  if (Object.getPrototypeOf) {
    return Object.getPrototypeOf(obj)
  }

  if (obj.constructor.prototype === obj) {
    return null
  }

  return obj.constructor.prototype
}

export function hasProperty(obj: object | null, property: string): boolean {
  if (!obj) {
    return false
  }

  if (Object.hasOwn(obj, property)) {
    return true
  }

  return hasProperty(getPrototype(obj), property)
}

// SENTINEL constants are from https://github.com/immutable-js/immutable-js
const IS_KEYED_SENTINEL = '@@__IMMUTABLE_KEYED__@@'
const IS_SET_SENTINEL = '@@__IMMUTABLE_SET__@@'
const IS_LIST_SENTINEL = '@@__IMMUTABLE_LIST__@@'
const IS_ORDERED_SENTINEL = '@@__IMMUTABLE_ORDERED__@@'
const IS_RECORD_SYMBOL = '@@__IMMUTABLE_RECORD__@@'

export function isImmutableUnorderedKeyed(maybeKeyed: any): boolean {
  return !!(
    maybeKeyed &&
    maybeKeyed[IS_KEYED_SENTINEL] &&
    !maybeKeyed[IS_ORDERED_SENTINEL]
  )
}

export function isImmutableUnorderedSet(maybeSet: any): boolean {
  return !!(
    maybeSet &&
    maybeSet[IS_SET_SENTINEL] &&
    !maybeSet[IS_ORDERED_SENTINEL]
  )
}

function isObjectLiteral(source: unknown): source is Record<string, unknown> {
  return source != null && typeof source === 'object' && !Array.isArray(source)
}

function isImmutableList(source: unknown): boolean {
  return Boolean(source && isObjectLiteral(source) && source[IS_LIST_SENTINEL])
}

function isImmutableOrderedKeyed(source: unknown): boolean {
  return Boolean(
    source &&
      isObjectLiteral(source) &&
      source[IS_KEYED_SENTINEL] &&
      source[IS_ORDERED_SENTINEL]
  )
}

function isImmutableOrderedSet(source: unknown): boolean {
  return Boolean(
    source &&
      isObjectLiteral(source) &&
      source[IS_SET_SENTINEL] &&
      source[IS_ORDERED_SENTINEL]
  )
}

function isImmutableRecord(source: unknown): boolean {
  return Boolean(source && isObjectLiteral(source) && source[IS_RECORD_SYMBOL])
}

/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
const IteratorSymbol = Symbol.iterator

function hasIterator(object: any) {
  return !!(object != null && object[IteratorSymbol])
}

export function iterableEquality(
  a: any,
  b: any,
  customTesters: Array<Tester> = [],
  aStack: Array<any> = [],
  bStack: Array<any> = []
): boolean | undefined {
  if (
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    Array.isArray(a) ||
    Array.isArray(b) ||
    !hasIterator(a) ||
    !hasIterator(b)
  ) {
    return undefined
  }

  if (a.constructor !== b.constructor) {
    return false
  }

  let length = aStack.length
  while (length--) {
    // Linear search. Performance is inversely proportional to the number of
    // unique nested structures.
    // circular references at same depth are equal
    // circular reference is not equal to non-circular one
    if (aStack[length] === a) {
      return bStack[length] === b
    }
  }
  aStack.push(a)
  bStack.push(b)

  const filteredCustomTesters: Array<Tester> = [
    ...customTesters.filter((t) => t !== iterableEquality),
    iterableEqualityWithStack,
  ]

  function iterableEqualityWithStack(left: any, right: any) {
    return iterableEquality(
      left,
      right,
      [...customTesters],
      [...aStack],
      [...bStack]
    )
  }

  if (a.size !== undefined) {
    if (a.size !== b.size) {
      return false
    } else if (isA('Set', a) || isImmutableUnorderedSet(a)) {
      let allFound = true
      for (const aValue of a) {
        if (!b.has(aValue)) {
          let has = false
          for (const bValue of b) {
            const isEqual = equals(aValue, bValue, filteredCustomTesters)
            if (isEqual === true) {
              has = true
            }
          }

          if (has === false) {
            allFound = false
            break
          }
        }
      }
      // Remove the first value from the stack of traversed values.
      aStack.pop()
      bStack.pop()
      return allFound
    } else if (isA('Map', a) || isImmutableUnorderedKeyed(a)) {
      let allFound = true
      for (const aEntry of a) {
        if (
          !b.has(aEntry[0]) ||
          !equals(aEntry[1], b.get(aEntry[0]), filteredCustomTesters)
        ) {
          let has = false
          for (const bEntry of b) {
            const matchedKey = equals(
              aEntry[0],
              bEntry[0],
              filteredCustomTesters
            )

            let matchedValue = false
            if (matchedKey === true) {
              matchedValue = equals(aEntry[1], bEntry[1], filteredCustomTesters)
            }

            if (matchedValue === true) {
              has = true
            }
          }

          if (has === false) {
            allFound = false
            break
          }
        }
      }
      // Remove the first value from the stack of traversed values.
      aStack.pop()
      bStack.pop()
      return allFound
    }
  }

  const bIterator = b[IteratorSymbol]()

  for (const aValue of a) {
    const nextB = bIterator.next()
    if (nextB.done || !equals(aValue, nextB.value, filteredCustomTesters)) {
      return false
    }
  }
  if (!bIterator.next().done) {
    return false
  }

  if (
    !isImmutableList(a) &&
    !isImmutableOrderedKeyed(a) &&
    !isImmutableOrderedSet(a) &&
    !isImmutableRecord(a)
  ) {
    const aEntries = Object.entries(a)
    const bEntries = Object.entries(b)
    if (!equals(aEntries, bEntries, filteredCustomTesters)) {
      return false
    }
  }

  // Remove the first value from the stack of traversed values.
  aStack.pop()
  bStack.pop()
  return true
}

/**
 * Checks if `hasOwnProperty(object, key)` up the prototype chain, stopping at `Object.prototype`.
 */
function hasPropertyInObject(object: object, key: string | symbol): boolean {
  const shouldTerminate =
    !object || typeof object !== 'object' || object === Object.prototype

  if (shouldTerminate) {
    return false
  }

  return (
    Object.hasOwn(object, key) ||
    hasPropertyInObject(Object.getPrototypeOf(object), key)
  )
}

function isObjectWithKeys(a: any) {
  return (
    isObject(a) &&
    !isError(a) &&
    !Array.isArray(a) &&
    !(a instanceof Date) &&
    !(a instanceof Set) &&
    !(a instanceof Map)
  )
}

// Recursive subset testers are closures, so track them by identity.
const subsetEqualityTesters = new WeakSet<Tester>()

function registerSubsetEqualityTester<T extends Tester>(tester: T): T {
  subsetEqualityTesters.add(tester)
  return tester
}

function isSubsetEqualityTester(tester: Tester): boolean {
  return tester === subsetEquality || subsetEqualityTesters.has(tester)
}

export function subsetEquality(
  object: unknown,
  subset: unknown,
  customTesters: Array<Tester> = []
): boolean | undefined {
  const filteredCustomTesters = customTesters.filter(
    (t) => t !== subsetEquality
  )
  // subsetEquality needs to keep track of the references
  // it has already visited to avoid infinite loops in case
  // there are circular references in the subset passed to it.
  const subsetEqualityWithContext = (
    seenReferences: WeakMap<object, boolean> = new WeakMap()
  ) =>
    registerSubsetEqualityTester(
      (candidate: any, expectedSubset: any): boolean | undefined => {
        if (!isObjectWithKeys(expectedSubset)) {
          return undefined
        }

        return Object.keys(expectedSubset).every((key) => {
          if (
            expectedSubset[key] != null &&
            typeof expectedSubset[key] === 'object'
          ) {
            if (seenReferences.has(expectedSubset[key])) {
              return equals(
                candidate[key],
                expectedSubset[key],
                filteredCustomTesters
              )
            }

            seenReferences.set(expectedSubset[key], true)
          }
          const result =
            candidate != null &&
            hasPropertyInObject(candidate, key) &&
            equals(candidate[key], expectedSubset[key], [
              ...filteredCustomTesters,
              subsetEqualityWithContext(seenReferences),
            ])
          // The main goal of using seenReference is to avoid circular node on tree.
          // It will only happen within a parent and its child, not a node and nodes next to it (same level)
          // We should keep the reference for a parent and its child only
          // Thus we should delete the reference immediately so that it doesn't interfere
          // other nodes within the same level on tree.
          seenReferences.delete(expectedSubset[key])
          return result
        })
      }
    )

  return subsetEqualityWithContext()(object, subset)
}

export function typeEquality(a: any, b: any): boolean | undefined {
  if (a == null || b == null || a.constructor === b.constructor) {
    return undefined
  }

  return false
}

export function arrayBufferEquality(
  a: unknown,
  b: unknown
): boolean | undefined {
  let dataViewA = a as DataView
  let dataViewB = b as DataView

  if (!(a instanceof DataView && b instanceof DataView)) {
    if (!(a instanceof ArrayBuffer) || !(b instanceof ArrayBuffer)) {
      return undefined
    }

    try {
      dataViewA = new DataView(a)
      dataViewB = new DataView(b)
    } catch {
      return undefined
    }
  }

  // Buffers are not equal when they do not have the same byte length
  if (dataViewA.byteLength !== dataViewB.byteLength) {
    return false
  }

  // Check if every byte value is equal to each other
  for (let i = 0; i < dataViewA.byteLength; i++) {
    if (dataViewA.getUint8(i) !== dataViewB.getUint8(i)) {
      return false
    }
  }

  return true
}

export function sparseArrayEquality(
  a: unknown,
  b: unknown,
  customTesters: Array<Tester> = []
): boolean | undefined {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    return undefined
  }

  // A sparse array [, , 1] will have keys ["2"] whereas [undefined, undefined, 1] will have keys ["0", "1", "2"]
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  const filteredCustomTesters = customTesters.filter(
    (t) => t !== sparseArrayEquality
  )
  return equals(a, b, filteredCustomTesters, true) && equals(aKeys, bKeys)
}

export function generateToBeMessage(
  deepEqualityName: string,
  expected = '#{this}',
  actual = '#{exp}'
): string {
  const toBeMessage = `expected ${expected} to be ${actual} // Object.is equality`

  if (['toStrictEqual', 'toEqual'].includes(deepEqualityName)) {
    return `${toBeMessage}\n\nIf it should pass with deep equality, replace "toBe" with "${deepEqualityName}"\n\nExpected: ${expected}\nReceived: serializes to the same string\n`
  }

  return toBeMessage
}

export function pluralize(word: string, count: number): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export function getObjectKeys(object: object): Array<string | symbol> {
  return [
    ...Object.keys(object),
    ...Object.getOwnPropertySymbols(object).filter(
      (s) => Object.getOwnPropertyDescriptor(object, s)?.enumerable
    ),
  ]
}

export function getObjectSubset(
  object: any,
  subset: any,
  customTesters: Array<Tester>
): { subset: any; stripped: number } {
  let stripped = 0

  const getObjectSubsetWithContext =
    (seenReferences: WeakMap<object, boolean> = new WeakMap()) =>
    (candidate: any, expectedSubset: any): any => {
      if (Array.isArray(candidate)) {
        if (
          Array.isArray(expectedSubset) &&
          expectedSubset.length === candidate.length
        ) {
          // The map method returns correct subclass of subset.
          return expectedSubset.map((sub: any, i: number) =>
            getObjectSubsetWithContext(seenReferences)(candidate[i], sub)
          )
        }
      } else if (candidate instanceof Date) {
        return candidate
      } else if (isObject(candidate) && isObject(expectedSubset)) {
        if (
          equals(candidate, expectedSubset, [
            ...customTesters,
            iterableEquality,
            subsetEquality,
          ])
        ) {
          // return "expected" subset to avoid showing irrelevant toMatchObject diff
          return expectedSubset
        }

        const trimmed: any = {}
        seenReferences.set(candidate, trimmed)

        // preserve constructor for toMatchObject diff
        if (
          typeof candidate.constructor === 'function' &&
          typeof candidate.constructor.name === 'string'
        ) {
          Object.defineProperty(trimmed, 'constructor', {
            enumerable: false,
            value: candidate.constructor,
          })
        }

        for (const key of getObjectKeys(candidate)) {
          if (hasPropertyInObject(expectedSubset, key)) {
            trimmed[key] = seenReferences.has(candidate[key])
              ? seenReferences.get(candidate[key])
              : getObjectSubsetWithContext(seenReferences)(
                  candidate[key],
                  expectedSubset[key]
                )
          } else {
            if (!seenReferences.has(candidate[key])) {
              stripped += 1
              if (isObject(candidate[key])) {
                stripped += getObjectKeys(candidate[key]).length
              }

              getObjectSubsetWithContext(seenReferences)(
                candidate[key],
                expectedSubset[key]
              )
            }
          }
        }

        if (getObjectKeys(trimmed).length > 0) {
          return trimmed
        }
      }

      return candidate
    }

  return { subset: getObjectSubsetWithContext()(object, subset), stripped }
}

/**
 * Detects if an object is a Standard Schema V1 compatible schema
 */
export function isStandardSchema(obj: any): obj is StandardSchemaV1 {
  return (
    !!obj &&
    (typeof obj === 'object' || typeof obj === 'function') &&
    obj['~standard'] &&
    typeof obj['~standard'].validate === 'function'
  )
}
