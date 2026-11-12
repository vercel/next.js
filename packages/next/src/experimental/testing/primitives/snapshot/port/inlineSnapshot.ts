import type MagicString from '../../utils/magic-string'
import type { SnapshotEnvironment } from '../types'
import { getCallLastIndex } from '../../utils/helpers'
import {
  lineSplitRE,
  offsetToLineNumber,
  positionToOffset,
} from '../../utils/offset'
import { memo } from './utils'

export interface InlineSnapshot {
  snapshot: string
  testId: string
  file: string
  line: number
  column: number
  // it maybe possible to accurately extract this from `ParsedStack.method`,
  // but for now, we ask higher level assertion to pass it explicitly
  // since this is useful for certain error messages before we extract stack.
  assertionName?: string
}

export async function saveInlineSnapshots(
  environment: SnapshotEnvironment,
  snapshots: Array<InlineSnapshot>
): Promise<void> {
  const MagicString = (await import('../../utils/magic-string/index.js'))
    .default
  const files = new Set(snapshots.map((i) => i.file))
  await Promise.all(
    Array.from(files).map(async (file) => {
      const snaps = snapshots.filter((i) => i.file === file)
      const code = await environment.readSnapshotFile(file)
      if (code == null) {
        throw new Error(`cannot read ${file} when saving inline snapshot`)
      }

      const s = new MagicString(code)

      for (const snap of snaps) {
        const index = positionToOffset(code, snap.line, snap.column)
        replaceInlineSnap(code, s, index, snap.snapshot, snap.assertionName)
      }

      const transformed = s.toString()
      if (transformed !== code) {
        await environment.saveSnapshotFile(file, transformed)
      }
    })
  )
}

const defaultStartObjectRegex =
  /(?:toMatchInlineSnapshot|toThrowErrorMatchingInlineSnapshot)\s*\(\s*(?:\/\*[\s\S]*\*\/\s*|\/\/.*(?:[\n\r\u2028\u2029]\s*|[\t\v\f \xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]))*\{/

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const buildStartObjectRegex = memo((assertionName: string) => {
  const replaced = defaultStartObjectRegex.source.replace(
    'toMatchInlineSnapshot|toThrowErrorMatchingInlineSnapshot',
    escapeRegExp(assertionName)
  )
  return new RegExp(replaced)
})

function replaceObjectSnap(
  code: string,
  s: MagicString,
  index: number,
  newSnap: string,
  assertionName?: string
) {
  let _code = code.slice(index)
  const regex = assertionName
    ? buildStartObjectRegex(assertionName)
    : defaultStartObjectRegex
  const startMatch = regex.exec(_code)
  if (!startMatch) {
    return false
  }

  _code = _code.slice(startMatch.index)

  let callEnd = getCallLastIndex(_code)
  if (callEnd === null) {
    return false
  }
  callEnd += index + startMatch.index

  const shapeStart = index + startMatch.index + startMatch[0].length
  const shapeEnd = getObjectShapeEndIndex(code, shapeStart)
  const snap = `, ${prepareSnapString(newSnap, code, index)}`

  if (shapeEnd === callEnd) {
    // toMatchInlineSnapshot({ foo: expect.any(String) })
    s.appendLeft(callEnd, snap)
  } else {
    // toMatchInlineSnapshot({ foo: expect.any(String) }, ``)
    s.overwrite(shapeEnd, callEnd, snap)
  }

  return true
}

function getObjectShapeEndIndex(code: string, index: number) {
  let startBraces = 1
  let endBraces = 0
  while (startBraces !== endBraces && index < code.length) {
    const s = code[index++]
    if (s === '{') {
      startBraces++
    } else if (s === '}') {
      endBraces++
    }
  }
  return index
}

function prepareSnapString(snap: string, source: string, index: number) {
  const lineNumber = offsetToLineNumber(source, index)
  const line = source.split(lineSplitRE)[lineNumber - 1]
  const indent = line.match(/^\s*/)![0] || ''
  const indentNext = indent.includes('\t') ? `${indent}\t` : `${indent}  `

  const lines = snap.trim().replace(/\\/g, '\\\\').split(/\n/g)

  const isOneline = lines.length <= 1
  const quote = '`'
  if (isOneline) {
    return `${quote}${lines.join('\n').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}${quote}`
  }
  return `${quote}\n${lines
    .map((i) => (i ? indentNext + i : ''))
    .join('\n')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')}\n${indent}${quote}`
}

const defaultMethodNames = [
  'toMatchInlineSnapshot',
  'toThrowErrorMatchingInlineSnapshot',
]

// on webkit, the line number is at the end of the method, not at the start
function getCodeStartingAtIndex(
  code: string,
  index: number,
  methodNames: string[]
) {
  for (const name of methodNames) {
    const adjusted = index - name.length
    if (adjusted >= 0 && code.slice(adjusted, index) === name) {
      return {
        code: code.slice(adjusted),
        index: adjusted,
      }
    }
  }
  return {
    code: code.slice(index),
    index,
  }
}

const defaultStartRegex =
  /(?:toMatchInlineSnapshot|toThrowErrorMatchingInlineSnapshot)\s*\(\s*(?:\/\*[\s\S]*\*\/\s*|\/\/.*(?:[\n\r\u2028\u2029]\s*|[\t\v\f \xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]))*[\w$]*(['"`)])/

const buildStartRegex = memo((assertionName: string) => {
  const replaced = defaultStartRegex.source.replace(
    'toMatchInlineSnapshot|toThrowErrorMatchingInlineSnapshot',
    escapeRegExp(assertionName)
  )
  return new RegExp(replaced)
})

export function replaceInlineSnap(
  code: string,
  s: MagicString,
  currentIndex: number,
  newSnap: string,
  assertionName?: string
): boolean {
  const methodNames = assertionName ? [assertionName] : defaultMethodNames
  const { code: codeStartingAtIndex, index } = getCodeStartingAtIndex(
    code,
    currentIndex,
    methodNames
  )

  const startRegex = assertionName
    ? buildStartRegex(assertionName)
    : defaultStartRegex
  const startMatch = startRegex.exec(codeStartingAtIndex)

  const keywordRegex = assertionName
    ? new RegExp(escapeRegExp(assertionName))
    : /toMatchInlineSnapshot|toThrowErrorMatchingInlineSnapshot/
  const firstKeywordMatch = keywordRegex.exec(codeStartingAtIndex)

  if (!startMatch || startMatch.index !== firstKeywordMatch?.index) {
    return replaceObjectSnap(code, s, index, newSnap, assertionName)
  }

  const quote = startMatch[1]
  const startIndex = index + startMatch.index + startMatch[0].length
  const snapString = prepareSnapString(newSnap, code, index)

  if (quote === ')') {
    s.appendRight(startIndex - 1, snapString)
    return true
  }

  const quoteEndRE = new RegExp(`(?:^|[^\\\\])${quote}`)
  const endMatch = quoteEndRE.exec(code.slice(startIndex))
  if (!endMatch) {
    return false
  }
  const endIndex = startIndex + endMatch.index! + endMatch[0].length
  s.overwrite(startIndex - 1, endIndex, snapString)

  return true
}

const INDENTATION_REGEX = /^([^\S\n]*)\S/m
export function stripSnapshotIndentation(inlineSnapshot: string): string {
  // Find indentation if exists.
  const match = inlineSnapshot.match(INDENTATION_REGEX)
  if (!match || !match[1]) {
    // No indentation.
    return inlineSnapshot
  }

  const indentation = match[1]
  const lines = inlineSnapshot.split(/\n/g)
  if (lines.length <= 2) {
    // Must be at least 3 lines.
    return inlineSnapshot
  }

  if (lines[0].trim() !== '' || lines.at(-1)?.trim() !== '') {
    // If not blank first and last lines, abort.
    return inlineSnapshot
  }

  for (let i = 1; i < lines.length - 1; i++) {
    if (lines[i] !== '') {
      if (lines[i].indexOf(indentation) !== 0) {
        // All lines except first and last should either be blank or have the same
        // indent as the first line (or more). If this isn't the case we don't
        // want to touch the snapshot at all.
        return inlineSnapshot
      }

      lines[i] = lines[i].substring(indentation.length)
    }
  }

  // Last line is a special case because it won't have the same indent as others
  // but may still have been given some indent to line up.
  lines[lines.length - 1] = ''

  // Return inline snapshot, now at indent 0.
  inlineSnapshot = lines.join('\n')
  return inlineSnapshot
}
