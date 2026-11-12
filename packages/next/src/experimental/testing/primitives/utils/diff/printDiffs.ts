/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { Diff } from './cleanupSemantic'
import type { DiffOptions } from './types'
import { cleanupSemantic, DIFF_EQUAL } from './cleanupSemantic'
import { diffLinesUnified, printDiffLines } from './diffLines'
import diffStrings from './diffStrings'
import getAlignedDiffs from './getAlignedDiffs'
import { normalizeDiffOptions } from './normalizeDiffOptions'

function hasCommonDiff(diffs: Array<Diff>, isMultiline: boolean): boolean {
  if (isMultiline) {
    // Important: Ignore common newline that was appended to multiline strings!
    const iLast = diffs.length - 1
    return diffs.some(
      (diff, i) => diff[0] === DIFF_EQUAL && (i !== iLast || diff[1] !== '\n')
    )
  }

  return diffs.some((diff) => diff[0] === DIFF_EQUAL)
}

// Compare two strings character-by-character.
// Format as comparison lines in which changed substrings have inverse colors.
export function diffStringsUnified(
  a: string,
  b: string,
  options?: DiffOptions
): string {
  if (a !== b && a.length !== 0 && b.length !== 0) {
    const isMultiline = a.includes('\n') || b.includes('\n')

    // getAlignedDiffs assumes that a newline was appended to the strings.
    const [diffs, truncated] = diffStringsRaw(
      isMultiline ? `${a}\n` : a,
      isMultiline ? `${b}\n` : b,
      true, // cleanupSemantic
      options
    )

    if (hasCommonDiff(diffs, isMultiline)) {
      const optionsNormalized = normalizeDiffOptions(options)
      const lines = getAlignedDiffs(diffs, optionsNormalized.changeColor)
      return printDiffLines(lines, truncated, optionsNormalized)
    }
  }

  // Fall back to line-by-line diff.
  return diffLinesUnified(a.split('\n'), b.split('\n'), options)
}

// Compare two strings character-by-character.
// Optionally clean up small common substrings, also known as chaff.
export function diffStringsRaw(
  a: string,
  b: string,
  cleanup: boolean,
  options?: DiffOptions
): [Array<Diff>, boolean] {
  const [diffs, truncated] = diffStrings(a, b, options)

  if (cleanup) {
    cleanupSemantic(diffs)
  } // impure function

  return [diffs, truncated]
}
