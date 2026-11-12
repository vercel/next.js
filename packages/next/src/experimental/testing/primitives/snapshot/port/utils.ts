/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { OptionsReceived as PrettyFormatOptions } from '../../pretty-format/index'
import type { SnapshotData } from '../types'
import type { SnapshotEnvironment } from '../types/environment'
import { format as prettyFormat } from '../../pretty-format/index'
import { isObject } from '../../utils/helpers'
import naturalCompare from 'natural-compare'
import { getSerializers } from './plugins'

// TODO: rewrite and clean up

export function testNameToKey(testName: string, count: number): string {
  return `${testName} ${count}`
}

export function keyToTestName(key: string): string {
  if (!/ \d+$/.test(key)) {
    throw new Error('Snapshot keys must end with a number.')
  }

  return key.replace(/ \d+$/, '')
}

// Evaluate a snapshot file's content into its snapshot key/value pairs.
export function evaluateSnapshotFile(
  filepath: string,
  content: string
): SnapshotData {
  const data = Object.create(null)
  try {
    // eslint-disable-next-line no-new-func -- Snapshot modules populate the provided exports object.
    const populate = new Function('exports', content)
    populate(data)
  } catch (cause) {
    throw new Error(
      `Invalid snapshot file, please manually fix or delete it: ${filepath}`,
      {
        cause,
      }
    )
  }
  return data
}

// Add extra line breaks at beginning and end of multiline snapshot
// to make the content easier to read.
export function addExtraLineBreaks(string: string): string {
  return string.includes('\n') ? `\n${string}\n` : string
}

// Remove extra line breaks at beginning and end of multiline snapshot.
// Instead of trim, which can remove additional newlines or spaces
// at beginning or end of the content from a custom serializer.
export function removeExtraLineBreaks(string: string): string {
  return string.length > 2 && string[0] === '\n' && string.endsWith('\n')
    ? string.slice(1, -1)
    : string
}

// export const removeLinesBeforeExternalMatcherTrap = (stack: string): string => {
//   const lines = stack.split('\n')

//   for (let i = 0; i < lines.length; i += 1) {
//     // It's a function name specified in `packages/expect/src/index.ts`
//     // for external custom matchers.
//     if (lines[i].includes('__EXTERNAL_MATCHER_TRAP__'))
//       return lines.slice(i + 1).join('\n')
//   }

//   return stack
// }

const escapeRegex = true
const printFunctionName = false

export function serialize(
  val: unknown,
  indent = 2,
  formatOverrides: PrettyFormatOptions = {}
): string {
  return normalizeNewlines(
    prettyFormat(val, {
      escapeRegex,
      indent,
      plugins: getSerializers(),
      printFunctionName,
      ...formatOverrides,
    })
  )
}

function escapeBacktickString(str: string): string {
  // a raw CR inside a template literal is read back as LF
  return str.replace(/`|\\|\$\{/g, '\\$&').replace(/\r/g, '\\r')
}

function printBacktickString(str: string): string {
  return `\`${escapeBacktickString(str)}\``
}

export function normalizeNewlines(string: string): string {
  return string.replace(/\r\n|\r/g, '\n')
}

export async function saveSnapshotFile(
  environment: SnapshotEnvironment,
  snapshotData: SnapshotData,
  snapshotPath: string
): Promise<void> {
  const snapshots = Object.keys(snapshotData)
    .sort(naturalCompare)
    .map(
      (key) =>
        `exports[${printBacktickString(key)}] = ${printBacktickString(
          normalizeNewlines(snapshotData[key])
        )};`
    )

  const content = `${environment.getHeader()}\n\n${snapshots.join('\n\n')}\n`
  const oldContent = await environment.readSnapshotFile(snapshotPath)
  const skipWriting = oldContent != null && oldContent === content

  if (skipWriting) {
    return
  }

  await environment.saveSnapshotFile(snapshotPath, content)
}

function deepMergeArray(target: any[] = [], source: any[] = []) {
  const mergedOutput = Array.from(target)

  source.forEach((sourceElement, index) => {
    const targetElement = mergedOutput[index]

    if (Array.isArray(target[index])) {
      mergedOutput[index] = deepMergeArray(target[index], sourceElement)
    } else if (isObject(targetElement)) {
      mergedOutput[index] = deepMergeSnapshot(target[index], sourceElement)
    } else {
      // Source does not exist in target or target is primitive and cannot be deep merged
      mergedOutput[index] = sourceElement
    }
  })

  return mergedOutput
}

/**
 * Deep merge, but considers asymmetric matchers. Unlike base util's deep merge,
 * will merge any object-like instance.
 * Compatible with Jest's snapshot matcher. Should not be used outside of snapshot.
 *
 * @example
 * ```ts
 * toMatchSnapshot({
 *   name: expect.stringContaining('text')
 * })
 * ```
 */
export function deepMergeSnapshot(target: any, source: any): any {
  if (isObject(target) && isObject(source)) {
    const mergedOutput = { ...target }
    Object.keys(source).forEach((key) => {
      if (isObject(source[key]) && !source[key].$$typeof) {
        if (!(key in target)) {
          Object.assign(mergedOutput, { [key]: source[key] })
        } else {
          mergedOutput[key] = deepMergeSnapshot(target[key], source[key])
        }
      } else if (Array.isArray(source[key])) {
        mergedOutput[key] = deepMergeArray(target[key], source[key])
      } else {
        Object.assign(mergedOutput, { [key]: source[key] })
      }
    })

    return mergedOutput
  } else if (Array.isArray(target) && Array.isArray(source)) {
    return deepMergeArray(target, source)
  }
  return target
}

export class DefaultMap<K, V> extends Map<K, V> {
  constructor(
    private defaultFn: (key: K) => V,
    entries?: Iterable<readonly [K, V]>
  ) {
    super(entries)
  }

  override get(key: K): V {
    if (!this.has(key)) {
      this.set(key, this.defaultFn(key))
    }
    return super.get(key)!
  }
}

export class CounterMap<K> extends DefaultMap<K, number> {
  constructor() {
    super(() => 0)
  }

  // compat for jest-image-snapshot https://github.com/vitest-dev/vitest/issues/7322
  // `valueOf` and `Snapshot.added` setter allows
  //   snapshotState.added = snapshotState.added + 1
  // to function as
  //   snapshotState.added.total_ = snapshotState.added.total() + 1
  _total: number | undefined

  valueOf(): number {
    return (this._total = this.total())
  }

  increment(key: K): void {
    if (typeof this._total !== 'undefined') {
      this._total++
    }
    this.set(key, this.get(key) + 1)
  }

  total(): number {
    if (typeof this._total !== 'undefined') {
      return this._total
    }
    let total = 0
    for (const x of this.values()) {
      total += x
    }
    return total
  }
}

/* @__NO_SIDE_EFFECTS__ */
export function memo<T, U>(fn: (arg: T) => U): (arg: T) => U {
  const cache = new Map<T, U>()
  return (arg: T) => {
    if (!cache.has(arg)) {
      cache.set(arg, fn(arg))
    }
    return cache.get(arg)!
  }
}
