/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { DiffOptionsColor } from './types'
import { Diff, DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT } from './cleanupSemantic'

// Given change op and array of diffs, return concatenated string:
// * include common strings
// * include change strings which have argument op with changeColor
// * exclude change strings which have opposite op
function concatenateRelevantDiffs(
  op: number,
  diffs: Array<Diff>,
  changeColor: DiffOptionsColor
): string {
  return diffs.reduce(
    (reduced: string, diff: Diff): string =>
      reduced +
      (diff[0] === DIFF_EQUAL
        ? diff[1]
        : diff[0] === op && diff[1].length !== 0 // empty if change is newline
          ? changeColor(diff[1])
          : ''),
    ''
  )
}

// Encapsulate change lines until either a common newline or the end.
class ChangeBuffer {
  private readonly op: number
  private line: Array<Diff> // incomplete line
  private lines: Array<Diff> // complete lines
  private readonly changeColor: DiffOptionsColor

  constructor(op: number, changeColor: DiffOptionsColor) {
    this.op = op
    this.line = []
    this.lines = []
    this.changeColor = changeColor
  }

  private pushSubstring(substring: string): void {
    this.pushDiff(new Diff(this.op, substring))
  }

  private pushLine(): void {
    // Assume call only if line has at least one diff,
    // therefore an empty line must have a diff which has an empty string.

    // If line has multiple diffs, then assume it has a common diff,
    // therefore change diffs have change color;
    // otherwise then it has line color only.
    this.lines.push(
      this.line.length !== 1
        ? new Diff(
            this.op,
            concatenateRelevantDiffs(this.op, this.line, this.changeColor)
          )
        : this.line[0][0] === this.op
          ? this.line[0] // can use instance
          : new Diff(this.op, this.line[0][1]) // was common diff
    )
    this.line.length = 0
  }

  isLineEmpty() {
    return this.line.length === 0
  }

  // Minor input to buffer.
  pushDiff(diff: Diff): void {
    this.line.push(diff)
  }

  // Main input to buffer.
  align(diff: Diff): void {
    const string = diff[1]

    if (string.includes('\n')) {
      const substrings = string.split('\n')
      const iLast = substrings.length - 1
      substrings.forEach((substring, i) => {
        if (i < iLast) {
          // The first substring completes the current change line.
          // A middle substring is a change line.
          this.pushSubstring(substring)
          this.pushLine()
        } else if (substring.length !== 0) {
          // The last substring starts a change line, if it is not empty.
          // Important: This non-empty condition also automatically omits
          // the newline appended to the end of expected and received strings.
          this.pushSubstring(substring)
        }
      })
    } else {
      // Append non-multiline string to current change line.
      this.pushDiff(diff)
    }
  }

  // Output from buffer.
  moveLinesTo(lines: Array<Diff>): void {
    if (!this.isLineEmpty()) {
      this.pushLine()
    }

    lines.push(...this.lines)
    this.lines.length = 0
  }
}

// Encapsulate common and change lines.
class CommonBuffer {
  private readonly deleteBuffer: ChangeBuffer
  private readonly insertBuffer: ChangeBuffer
  private readonly lines: Array<Diff>

  constructor(deleteBuffer: ChangeBuffer, insertBuffer: ChangeBuffer) {
    this.deleteBuffer = deleteBuffer
    this.insertBuffer = insertBuffer
    this.lines = []
  }

  private pushDiffCommonLine(diff: Diff): void {
    this.lines.push(diff)
  }

  private pushDiffChangeLines(diff: Diff): void {
    const isDiffEmpty = diff[1].length === 0

    // An empty diff string is redundant, unless a change line is empty.
    if (!isDiffEmpty || this.deleteBuffer.isLineEmpty()) {
      this.deleteBuffer.pushDiff(diff)
    }

    if (!isDiffEmpty || this.insertBuffer.isLineEmpty()) {
      this.insertBuffer.pushDiff(diff)
    }
  }

  private flushChangeLines(): void {
    this.deleteBuffer.moveLinesTo(this.lines)
    this.insertBuffer.moveLinesTo(this.lines)
  }

  // Input to buffer.
  align(diff: Diff): void {
    const op = diff[0]
    const string = diff[1]

    if (string.includes('\n')) {
      const substrings = string.split('\n')
      const iLast = substrings.length - 1
      substrings.forEach((substring, i) => {
        if (i === 0) {
          const subdiff = new Diff(op, substring)
          if (
            this.deleteBuffer.isLineEmpty() &&
            this.insertBuffer.isLineEmpty()
          ) {
            // If both current change lines are empty,
            // then the first substring is a common line.
            this.flushChangeLines()
            this.pushDiffCommonLine(subdiff)
          } else {
            // If either current change line is non-empty,
            // then the first substring completes the change lines.
            this.pushDiffChangeLines(subdiff)
            this.flushChangeLines()
          }
        } else if (i < iLast) {
          // A middle substring is a common line.
          this.pushDiffCommonLine(new Diff(op, substring))
        } else if (substring.length !== 0) {
          // The last substring starts a change line, if it is not empty.
          // Important: This non-empty condition also automatically omits
          // the newline appended to the end of expected and received strings.
          this.pushDiffChangeLines(new Diff(op, substring))
        }
      })
    } else {
      // Append non-multiline string to current change lines.
      // Important: It cannot be at the end following empty change lines,
      // because newline appended to the end of expected and received strings.
      this.pushDiffChangeLines(diff)
    }
  }

  // Output from buffer.
  getLines(): Array<Diff> {
    this.flushChangeLines()
    return this.lines
  }
}

// Given diffs from expected and received strings,
// return new array of diffs split or joined into lines.
//
// To correctly align a change line at the end, the algorithm:
// * assumes that a newline was appended to the strings
// * omits the last newline from the output array
//
// Assume the function is not called:
// * if either expected or received is empty string
// * if neither expected nor received is multiline string
function getAlignedDiffs(
  diffs: Array<Diff>,
  changeColor: DiffOptionsColor
): Array<Diff> {
  const deleteBuffer = new ChangeBuffer(DIFF_DELETE, changeColor)
  const insertBuffer = new ChangeBuffer(DIFF_INSERT, changeColor)
  const commonBuffer = new CommonBuffer(deleteBuffer, insertBuffer)

  diffs.forEach((diff) => {
    switch (diff[0]) {
      case DIFF_DELETE:
        deleteBuffer.align(diff)
        break

      case DIFF_INSERT:
        insertBuffer.align(diff)
        break

      default:
        commonBuffer.align(diff)
    }
  })

  return commonBuffer.getLines()
}

export default getAlignedDiffs
