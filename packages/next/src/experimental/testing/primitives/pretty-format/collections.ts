/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type { CompareKeys, Config, Printer, Refs } from './types'

function getKeysOfEnumerableProperties(
  object: Record<string, unknown>,
  compareKeys: CompareKeys
) {
  const rawKeys = Object.keys(object)
  const keys: Array<string | symbol> =
    compareKeys === null ? rawKeys : rawKeys.sort(compareKeys)

  if (Object.getOwnPropertySymbols) {
    for (const symbol of Object.getOwnPropertySymbols(object)) {
      if (Object.getOwnPropertyDescriptor(object, symbol)!.enumerable) {
        keys.push(symbol)
      }
    }
  }

  return keys
}

/**
 * Return entries (for example, of a map)
 * with spacing, indentation, and comma
 * without surrounding punctuation (for example, braces)
 */
export function printIteratorEntries(
  iterator: Iterator<[unknown, unknown]>,
  config: Config,
  indentation: string,
  depth: number,
  refs: Refs,
  printer: Printer,
  separator = ': ',
  length?: number
): string {
  let result = ''
  let width = 0
  let current = iterator.next()

  if (!current.done) {
    result += config.spacingOuter

    const indentationNext = indentation + config.indent

    while (!current.done) {
      result += indentationNext

      if (width++ === config.maxWidth) {
        result += typeof length === 'number' ? `…(${length - width + 1})` : '…'
        break
      }

      const name = printer(
        current.value[0],
        config,
        indentationNext,
        depth,
        refs
      )
      const value = printer(
        current.value[1],
        config,
        indentationNext,
        depth,
        refs
      )

      result += name + separator + value

      current = iterator.next()

      if (!current.done) {
        result += `,${config.spacingInner}`
      } else if (!config.min) {
        result += ','
      }
    }

    result += config.spacingOuter + indentation
  }

  return result
}

/**
 * Return values (for example, of a set)
 * with spacing, indentation, and comma
 * without surrounding punctuation (braces or brackets)
 */
export function printIteratorValues(
  iterator: Iterator<unknown>,
  config: Config,
  indentation: string,
  depth: number,
  refs: Refs,
  printer: Printer,
  length?: number
): string {
  let result = ''
  let width = 0
  let current = iterator.next()

  if (!current.done) {
    result += config.spacingOuter

    const indentationNext = indentation + config.indent

    while (!current.done) {
      result += indentationNext

      if (width++ === config.maxWidth) {
        result += typeof length === 'number' ? `…(${length - width + 1})` : '…'
        break
      }

      result += printer(current.value, config, indentationNext, depth, refs)

      current = iterator.next()

      if (!current.done) {
        result += `,${config.spacingInner}`
      } else if (!config.min) {
        result += ','
      }
    }

    result += config.spacingOuter + indentation
  }

  return result
}

/**
 * Return items (for example, of an array)
 * with spacing, indentation, and comma
 * without surrounding punctuation (for example, brackets)
 */
export function printListItems(
  list: ArrayLike<unknown> | DataView | ArrayBuffer,
  config: Config,
  indentation: string,
  depth: number,
  refs: Refs,
  printer: Printer
): string {
  let result = ''
  list = list instanceof ArrayBuffer ? new DataView(list) : list
  const isDataView = (l: unknown): l is DataView => l instanceof DataView
  const length = isDataView(list) ? list.byteLength : list.length

  if (length > 0) {
    result += config.spacingOuter

    const indentationNext = indentation + config.indent

    for (let i = 0; i < length; i++) {
      result += indentationNext

      if (i === config.maxWidth) {
        result += `…(${length - i})`
        break
      }

      if (isDataView(list) || i in list) {
        result += printer(
          isDataView(list) ? list.getInt8(i) : list[i],
          config,
          indentationNext,
          depth,
          refs
        )
      }

      if (i < length - 1) {
        result += `,${config.spacingInner}`
      } else if (!config.min) {
        result += ','
      }
    }

    result += config.spacingOuter + indentation
  }

  return result
}

/**
 * Return properties of an object
 * with spacing, indentation, and comma
 * without surrounding punctuation (for example, braces)
 */
export function printObjectProperties(
  val: Record<string | symbol, unknown>,
  config: Config,
  indentation: string,
  depth: number,
  refs: Refs,
  printer: Printer,
  compareKeysOverride: CompareKeys = config.compareKeys
): string {
  let result = ''
  const keys = getKeysOfEnumerableProperties(val, compareKeysOverride)

  if (keys.length > 0) {
    result += config.spacingOuter

    const indentationNext = indentation + config.indent

    for (let i = 0; i < keys.length; i++) {
      result += indentationNext

      if (i === config.maxWidth) {
        result += `…(${keys.length - i})`
        break
      }

      const key = keys[i]
      const name =
        !config.quoteKeys && isUnquotableKey(key)
          ? (key as string)
          : printer(key, config, indentationNext, depth, refs)
      const value = printer(val[key], config, indentationNext, depth, refs)

      result += `${name}: ${value}`

      if (i < keys.length - 1) {
        result += `,${config.spacingInner}`
      } else if (!config.min) {
        result += ','
      }
    }

    result += config.spacingOuter + indentation
  }

  return result
}

// https://github.com/nodejs/node/blob/61102cdbb3d59155ad5bb4fc9419627a31e63f7a/lib/internal/util/inspect.js#L249
// /^[a-zA-Z_][a-zA-Z_0-9]*$/
const keyStrRegExp = /^[a-z_]\w*$/i

function isUnquotableKey(key: string | symbol): boolean {
  return (
    typeof key === 'string' && key !== '__proto__' && keyStrRegExp.test(key)
  )
}
