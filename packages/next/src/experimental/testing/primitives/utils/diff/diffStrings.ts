/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { DiffOptions } from './types'
import diffSequences from 'diff-sequences'
import { Diff, DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT } from './cleanupSemantic'

// platforms compatible
function getNewLineSymbol(string: string) {
  return string.includes('\r\n') ? '\r\n' : '\n'
}

function diffStrings(
  a: string,
  b: string,
  options?: DiffOptions
): [Array<Diff>, boolean] {
  const truncate = options?.truncateThreshold ?? false
  const truncateThreshold = Math.max(
    Math.floor(options?.truncateThreshold ?? 0),
    0
  )
  let aLength = a.length
  let bLength = b.length
  if (truncate) {
    const aMultipleLines = a.includes('\n')
    const bMultipleLines = b.includes('\n')
    const aNewLineSymbol = getNewLineSymbol(a)
    const bNewLineSymbol = getNewLineSymbol(b)
    // multiple-lines string expects a newline to be appended at the end
    const _a = aMultipleLines
      ? `${a.split(aNewLineSymbol, truncateThreshold).join(aNewLineSymbol)}\n`
      : a
    const _b = bMultipleLines
      ? `${b.split(bNewLineSymbol, truncateThreshold).join(bNewLineSymbol)}\n`
      : b
    aLength = _a.length
    bLength = _b.length
  }
  const truncated = aLength !== a.length || bLength !== b.length

  const isCommon = (aIndex: number, bIndex: number) => a[aIndex] === b[bIndex]

  let aIndex = 0
  let bIndex = 0
  const diffs: Array<Diff> = []

  const foundSubsequence = (
    nCommon: number,
    aCommon: number,
    bCommon: number
  ) => {
    if (aIndex !== aCommon) {
      diffs.push(new Diff(DIFF_DELETE, a.slice(aIndex, aCommon)))
    }

    if (bIndex !== bCommon) {
      diffs.push(new Diff(DIFF_INSERT, b.slice(bIndex, bCommon)))
    }

    aIndex = aCommon + nCommon // number of characters compared in a
    bIndex = bCommon + nCommon // number of characters compared in b
    diffs.push(new Diff(DIFF_EQUAL, b.slice(bCommon, bIndex)))
  }

  diffSequences(aLength, bLength, isCommon, foundSubsequence)

  // After the last common subsequence, push remaining change items.
  if (aIndex !== aLength) {
    diffs.push(new Diff(DIFF_DELETE, a.slice(aIndex)))
  }

  if (bIndex !== bLength) {
    diffs.push(new Diff(DIFF_INSERT, b.slice(bIndex)))
  }

  return [diffs, truncated]
}

export default diffStrings
