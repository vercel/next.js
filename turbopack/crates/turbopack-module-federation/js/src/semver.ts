/*
 * MIT License http://www.opensource.org/licenses/mit-license.php
 * Author Tobias Koppers @sokra
 *
 * Adapted from webpack/lib/util/semver.js. Keeping Webpack's range encoding
 * and comparison rules is intentional: share scopes cross bundler runtimes,
 * so npm-semver-like behavior is not close enough for interoperability.
 *
 * Treat the compact range arrays below as compatibility data, not a general-purpose public
 * representation. Changes should be checked against Webpack's implementation and the differential
 * cases in `js/tests/runtime.test.ts`.
 */

/* eslint-disable eqeqeq, no-sparse-arrays */

type SemVerValue = any
export type SemVerRange = SemVerValue[]

export function parseVersion(value: string): SemVerValue[] {
  const splitAndConvert = (part: string): SemVerValue[] =>
    part.split('.').map((item) => (+item == (item as any) ? +item : item))

  const match = /^([^-+]+)?(?:-([^+]+))?(?:\+(.+))?$/.exec(value)!
  const version = match[1] ? splitAndConvert(match[1]) : []

  if (match[2]) {
    version.length++
    version.push(...splitAndConvert(match[2]))
  }
  if (match[3]) {
    version.push([])
    version.push(...splitAndConvert(match[3]))
  }
  return version
}

export function versionLt(a: string, b: string): boolean {
  const left = parseVersion(a)
  const right = parseVersion(b)
  let index = 0

  for (;;) {
    if (index >= left.length) {
      return index < right.length && typeof right[index] !== 'undefined'
    }

    const leftValue = left[index]
    const leftType = typeof leftValue
    if (index >= right.length) return leftType === 'undefined'

    const rightValue = right[index]
    const rightType = typeof rightValue
    if (leftType === rightType) {
      if (
        leftType !== 'object' &&
        leftType !== 'undefined' &&
        leftValue != rightValue
      ) {
        return leftValue < rightValue
      }
      index++
    } else {
      if (leftType === 'object' && rightType === 'number') return true
      return rightType === 'string' || leftType === 'undefined'
    }
  }
}

export function parseRange(value: string): SemVerRange {
  const splitAndConvert = (part: string): SemVerValue[] =>
    part
      .split('.')
      .map((item) => (item !== 'NaN' && `${+item}` === item ? +item : item))

  const parsePartial = (part: string): SemVerRange => {
    const match = /^([^-+]+)?(?:-([^+]+))?(?:\+(.+))?$/.exec(part)!
    const version: SemVerRange = match[1]
      ? [0, ...splitAndConvert(match[1])]
      : [0]

    if (match[2]) {
      version.length++
      version.push(...splitAndConvert(match[2]))
    }

    let last = version[version.length - 1]
    while (
      version.length > 0 &&
      (last === undefined || /^[*xX]$/.test(last as string))
    ) {
      version.pop()
      last = version[version.length - 1]
    }
    return version
  }

  const toFixed = (range: SemVerRange): SemVerRange => {
    if (range.length === 1) return [0]
    if (range.length === 2) return [1, ...range.slice(1)]
    if (range.length === 3) return [2, ...range.slice(1)]
    return [range.length, ...range.slice(1)]
  }

  const negate = (range: SemVerRange): SemVerRange => [
    -(range[0] as number) - 1,
    ...range.slice(1),
  ]

  const parseSimple = (part: string): SemVerRange => {
    const match = /^(\^|~|<=|<|>=|>|=|v|!)/.exec(part)
    const start = match ? match[0] : ''
    const remainder = parsePartial(
      start.length > 0 ? part.slice(start.length).trim() : part.trim()
    )

    switch (start) {
      case '^':
        if (remainder.length > 1 && remainder[1] === 0) {
          if (remainder.length > 2 && remainder[2] === 0) {
            return [3, ...remainder.slice(1)]
          }
          return [2, ...remainder.slice(1)]
        }
        return [1, ...remainder.slice(1)]
      case '~':
        if (remainder.length === 2 && remainder[0] === 0) {
          return [1, ...remainder.slice(1)]
        }
        return [2, ...remainder.slice(1)]
      case '>=':
        return remainder
      case '=':
      case 'v':
      case '':
        return toFixed(remainder)
      case '<':
        return negate(remainder)
      case '>': {
        const fixed = toFixed(remainder)
        return [, fixed, 0, remainder, 2]
      }
      case '<=':
        return [, toFixed(remainder), negate(remainder), 1]
      case '!': {
        const fixed = toFixed(remainder)
        return [, fixed, 0]
      }
      default:
        throw new Error(`Unexpected semver range prefix "${start}"`)
    }
  }

  const combine = (items: SemVerRange[], operation: 1 | 2): SemVerRange => {
    if (items.length === 1) return items[0]!

    const combined: SemVerRange = []
    for (const item of items.slice().reverse()) {
      if (0 in item) combined.push(item)
      else combined.push(...item.slice(1))
    }
    return [, ...combined, ...items.slice(1).map(() => operation)]
  }

  const parseJoinedRange = (part: string): SemVerRange => {
    const hyphenated = part.split(/\s+-\s+/)
    if (hyphenated.length === 1) {
      part = part.trim()
      const items: SemVerRange[] = []
      const separator = /[-0-9A-Za-z]\s+/g
      let start = 0
      let match: RegExpExecArray | null
      while ((match = separator.exec(part))) {
        const end = match.index + 1
        items.push(parseSimple(part.slice(start, end).trim()))
        start = end
      }
      items.push(parseSimple(part.slice(start).trim()))
      return combine(items, 2)
    }

    const left = parsePartial(hyphenated[0]!)
    const right = parsePartial(hyphenated[1]!)
    return [, toFixed(right), negate(right), 1, left, 2]
  }

  return combine(value.split(/\s*\|\|\s*/).map(parseJoinedRange), 1)
}

export function satisfy(
  range: SemVerRange,
  versionValue: string | SemVerValue[]
): boolean {
  if (0 in range) {
    const version = Array.isArray(versionValue)
      ? versionValue
      : parseVersion(versionValue)
    let fixCount = range[0] as number
    const negated = fixCount < 0
    if (negated) fixCount = -fixCount - 1

    for (let versionIndex = 0, rangeIndex = 1, equal = true; ; ) {
      const rangeType =
        rangeIndex < range.length ? typeof range[rangeIndex] : ''
      let versionItem: SemVerValue
      let versionType: string | undefined

      if (
        versionIndex >= version.length ||
        ((versionItem = version[versionIndex]),
        (versionType = typeof versionItem),
        versionType === 'object')
      ) {
        if (!equal) return true
        if (rangeType === 'undefined') {
          return rangeIndex > fixCount && !negated
        }
        return (rangeType === '') !== negated
      }

      if (versionType === 'undefined') {
        if (!equal || rangeType !== 'undefined') return false
      } else if (equal) {
        if (rangeType === versionType) {
          if (rangeIndex <= fixCount) {
            if (versionItem != range[rangeIndex]) return false
          } else {
            if (
              negated
                ? versionItem > range[rangeIndex]
                : versionItem < range[rangeIndex]
            ) {
              return false
            }
            if (versionItem != range[rangeIndex]) equal = false
          }
        } else if (rangeType !== 'string' && rangeType !== 'number') {
          if (negated || rangeIndex <= fixCount) return false
          equal = false
          rangeIndex--
        } else {
          const typeComesBeforeRange = versionType < rangeType
          if (rangeIndex <= fixCount || typeComesBeforeRange !== negated) {
            return false
          }
          equal = false
        }
      } else if (rangeType !== 'string' && rangeType !== 'number') {
        equal = false
        rangeIndex--
      }

      rangeIndex++
      versionIndex++
    }
  }

  const stack: Array<boolean | number> = []
  const pop = (): boolean | number => stack.pop()!
  for (let index = 1; index < range.length; index++) {
    const item = range[index] as SemVerRange | 0 | 1 | 2
    stack.push(
      item == 1
        ? Number(pop()) | Number(pop())
        : item == 2
          ? Number(pop()) & Number(pop())
          : item
            ? satisfy(item, versionValue)
            : !pop()
    )
  }
  return Boolean(pop())
}

export function versionSatisfies(range: string, version: string): boolean {
  return satisfy(parseRange(range), version)
}

/* eslint-enable eqeqeq, no-sparse-arrays */
