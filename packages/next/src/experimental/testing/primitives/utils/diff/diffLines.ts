/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { DiffOptions, DiffOptionsNormalized } from './types'
import diffSequences from 'diff-sequences'
import { Diff, DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT } from './cleanupSemantic'
import {
  joinAlignedDiffsExpand,
  joinAlignedDiffsNoExpand,
} from './joinAlignedDiffs'
import { normalizeDiffOptions } from './normalizeDiffOptions'

function isEmptyString(lines: Array<string>) {
  return lines.length === 1 && lines[0].length === 0
}

interface ChangeCounts {
  a: number
  b: number
}

function countChanges(diffs: Array<Diff>): ChangeCounts {
  let a = 0
  let b = 0

  diffs.forEach((diff) => {
    switch (diff[0]) {
      case DIFF_DELETE:
        a += 1
        break

      case DIFF_INSERT:
        b += 1
        break
    }
  })

  return { a, b }
}

function printAnnotation(
  {
    aAnnotation,
    aColor,
    aIndicator,
    bAnnotation,
    bColor,
    bIndicator,
    includeChangeCounts,
    omitAnnotationLines,
  }: DiffOptionsNormalized,
  changeCounts: ChangeCounts
): string {
  if (omitAnnotationLines) {
    return ''
  }

  let aRest = ''
  let bRest = ''

  if (includeChangeCounts) {
    const aCount = String(changeCounts.a)
    const bCount = String(changeCounts.b)

    // Padding right aligns the ends of the annotations.
    const baAnnotationLengthDiff = bAnnotation.length - aAnnotation.length
    const aAnnotationPadding = ' '.repeat(Math.max(0, baAnnotationLengthDiff))
    const bAnnotationPadding = ' '.repeat(Math.max(0, -baAnnotationLengthDiff))

    // Padding left aligns the ends of the counts.
    const baCountLengthDiff = bCount.length - aCount.length
    const aCountPadding = ' '.repeat(Math.max(0, baCountLengthDiff))
    const bCountPadding = ' '.repeat(Math.max(0, -baCountLengthDiff))

    aRest = `${aAnnotationPadding}  ${aIndicator} ${aCountPadding}${aCount}`
    bRest = `${bAnnotationPadding}  ${bIndicator} ${bCountPadding}${bCount}`
  }

  const a = `${aIndicator} ${aAnnotation}${aRest}`
  const b = `${bIndicator} ${bAnnotation}${bRest}`
  return `${aColor(a)}\n${bColor(b)}\n\n`
}

export function printDiffLines(
  diffs: Array<Diff>,
  truncated: boolean,
  options: DiffOptionsNormalized
): string {
  return (
    printAnnotation(options, countChanges(diffs)) +
    (options.expand
      ? joinAlignedDiffsExpand(diffs, options)
      : joinAlignedDiffsNoExpand(diffs, options)) +
    (truncated
      ? options.truncateAnnotationColor(`\n${options.truncateAnnotation}`)
      : '')
  )
}

// Compare two arrays of strings line-by-line. Format as comparison lines.
export function diffLinesUnified(
  aLines: Array<string>,
  bLines: Array<string>,
  options?: DiffOptions
): string {
  const normalizedOptions = normalizeDiffOptions(options)
  const [diffs, truncated] = diffLinesRaw(
    isEmptyString(aLines) ? [] : aLines,
    isEmptyString(bLines) ? [] : bLines,
    normalizedOptions
  )
  return printDiffLines(diffs, truncated, normalizedOptions)
}

// Given two pairs of arrays of strings:
// Compare the pair of comparison arrays line-by-line.
// Format the corresponding lines in the pair of displayable arrays.
export function diffLinesUnified2(
  aLinesDisplay: Array<string>,
  bLinesDisplay: Array<string>,
  aLinesCompare: Array<string>,
  bLinesCompare: Array<string>,
  options?: DiffOptions
): string {
  if (isEmptyString(aLinesDisplay) && isEmptyString(aLinesCompare)) {
    aLinesDisplay = []
    aLinesCompare = []
  }
  if (isEmptyString(bLinesDisplay) && isEmptyString(bLinesCompare)) {
    bLinesDisplay = []
    bLinesCompare = []
  }

  if (
    aLinesDisplay.length !== aLinesCompare.length ||
    bLinesDisplay.length !== bLinesCompare.length
  ) {
    // Fall back to diff of display lines.
    return diffLinesUnified(aLinesDisplay, bLinesDisplay, options)
  }

  const [diffs, truncated] = diffLinesRaw(aLinesCompare, bLinesCompare, options)

  // Replace comparison lines with displayable lines.
  let aIndex = 0
  let bIndex = 0
  diffs.forEach((diff: Diff) => {
    switch (diff[0]) {
      case DIFF_DELETE:
        diff[1] = aLinesDisplay[aIndex]
        aIndex += 1
        break

      case DIFF_INSERT:
        diff[1] = bLinesDisplay[bIndex]
        bIndex += 1
        break

      default:
        diff[1] = bLinesDisplay[bIndex]
        aIndex += 1
        bIndex += 1
    }
  })

  return printDiffLines(diffs, truncated, normalizeDiffOptions(options))
}

// Compare two arrays of strings line-by-line.
export function diffLinesRaw(
  aLines: Array<string>,
  bLines: Array<string>,
  options?: DiffOptions
): [Array<Diff>, boolean] {
  const truncate = options?.truncateThreshold ?? false
  const truncateThreshold = Math.max(
    Math.floor(options?.truncateThreshold ?? 0),
    0
  )
  const aLength = truncate
    ? Math.min(aLines.length, truncateThreshold)
    : aLines.length
  const bLength = truncate
    ? Math.min(bLines.length, truncateThreshold)
    : bLines.length
  const truncated = aLength !== aLines.length || bLength !== bLines.length

  const isCommon = (aIndex: number, bIndex: number) =>
    aLines[aIndex] === bLines[bIndex]

  const diffs: Array<Diff> = []
  let aIndex = 0
  let bIndex = 0

  const foundSubsequence = (
    nCommon: number,
    aCommon: number,
    bCommon: number
  ) => {
    for (; aIndex !== aCommon; aIndex += 1) {
      diffs.push(new Diff(DIFF_DELETE, aLines[aIndex]))
    }

    for (; bIndex !== bCommon; bIndex += 1) {
      diffs.push(new Diff(DIFF_INSERT, bLines[bIndex]))
    }

    for (; nCommon !== 0; nCommon -= 1, aIndex += 1, bIndex += 1) {
      diffs.push(new Diff(DIFF_EQUAL, bLines[bIndex]))
    }
  }

  diffSequences(aLength, bLength, isCommon, foundSubsequence)

  // After the last common subsequence, push remaining change items.
  for (; aIndex !== aLength; aIndex += 1) {
    diffs.push(new Diff(DIFF_DELETE, aLines[aIndex]))
  }

  for (; bIndex !== bLength; bIndex += 1) {
    diffs.push(new Diff(DIFF_INSERT, bLines[bIndex]))
  }

  return [diffs, truncated]
}
