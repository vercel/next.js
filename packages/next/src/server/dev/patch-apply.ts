/**
 * Patch parser and atomic filesystem applicator.
 *
 * Two operations:
 *
 *   Write (full file replacement):
 *
 *     --- write: app/page.tsx
 *     "use client"
 *     import { useState } from "react"
 *     export default function Home() { ... }
 *     ---
 *
 *   Edit (search and replace within a file):
 *
 *     --- edit: app/page.tsx
 *     --- search
 *       <h1>Hello World</h1>
 *     --- replace
 *       <h1>Hello Agentic World</h1>
 *     ---
 */

import fs from 'fs'
import path from 'path'

export interface FileOperation {
  filePath: string
  type: 'write' | 'edit'
  /** For write: the full file content. For edit: the replacement text. */
  content?: string
  /** For edit: the text to find */
  search?: string
  /** For edit: the replacement text */
  replace?: string
}

export interface FileDiff {
  file: string
  type: 'write' | 'edit'
  summary: string
}

export interface ApplyResult {
  success: boolean
  affectedFiles: string[]
  diffs: FileDiff[]
  error?: string
}

/**
 * Parse patch text into file operations.
 */
export function parsePatch(patchText: string): FileOperation[] {
  const operations: FileOperation[] = []
  const lines = patchText.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i].trim()

    // --- write: <path>
    const writeMatch = line.match(/^---\s*write:\s*(.+)$/)
    if (writeMatch) {
      const filePath = writeMatch[1].trim()
      i++
      const body = collectUntilEnd(lines, i)
      operations.push({ filePath, type: 'write', content: body.text })
      i = body.nextIndex
      continue
    }

    // --- edit: <path>
    const editMatch = line.match(/^---\s*edit:\s*(.+)$/)
    if (editMatch) {
      const filePath = editMatch[1].trim()
      i++
      const op = parseEditBlock(lines, i, filePath)
      if (op) {
        operations.push(op.operation)
        i = op.nextIndex
        continue
      }
    }

    i++
  }

  return operations
}

function parseEditBlock(
  lines: string[],
  startIndex: number,
  filePath: string
): { operation: FileOperation; nextIndex: number } | null {
  let i = startIndex

  // Skip blank lines
  while (i < lines.length && lines[i].trim() === '') i++
  if (i >= lines.length) return null

  const directive = lines[i].trim()

  // --- search
  if (directive === '--- search') {
    i++
    const search = collectUntilDirective(lines, i)
    i = search.nextIndex

    // Expect --- replace
    if (i < lines.length && lines[i].trim() === '--- replace') {
      i++
      const replace = collectUntilEnd(lines, i)
      return {
        operation: {
          filePath,
          type: 'edit',
          search: search.text,
          replace: replace.text,
        },
        nextIndex: replace.nextIndex,
      }
    }
  }

  return null
}

/**
 * Collect lines until a line that is exactly "---" (block terminator).
 */
function collectUntilEnd(
  lines: string[],
  startIndex: number
): { text: string; nextIndex: number } {
  const collected: string[] = []
  let i = startIndex

  while (i < lines.length) {
    if (lines[i].trim() === '---') {
      i++
      break
    }
    collected.push(lines[i])
    i++
  }

  return { text: collected.join('\n'), nextIndex: i }
}

/**
 * Collect lines until a line that starts with "--- " (next directive).
 */
function collectUntilDirective(
  lines: string[],
  startIndex: number
): { text: string; nextIndex: number } {
  const collected: string[] = []
  let i = startIndex

  while (i < lines.length) {
    const trimmed = lines[i].trim()
    if (trimmed.startsWith('--- ') || trimmed === '---') {
      break
    }
    collected.push(lines[i])
    i++
  }

  return { text: collected.join('\n'), nextIndex: i }
}

/**
 * Apply a search/replace edit to file content.
 * Finds the search string and replaces it. Throws if not found.
 */
function applyEdit(
  originalContent: string,
  search: string,
  replace: string,
  filePath: string
): string {
  // Trim trailing whitespace per line for matching
  const searchTrimmed = search.replace(/[ \t]+$/gm, '')
  const contentTrimmed = originalContent.replace(/[ \t]+$/gm, '')

  const index = contentTrimmed.indexOf(searchTrimmed)
  if (index === -1) {
    const searchPreview = search.split('\n').slice(0, 3).join('\n')
    throw new Error(
      `Search text not found in ${filePath}.\n` +
        `Searched for:\n${searchPreview}${search.split('\n').length > 3 ? '\n...' : ''}`
    )
  }

  // Map position from trimmed content back to original
  const beforeMatch = contentTrimmed.slice(0, index)
  const linesBefore = beforeMatch.split('\n')
  const matchLines = searchTrimmed.split('\n')

  const origLines = originalContent.split('\n')
  const startLineIdx = linesBefore.length - 1
  const startColInTrimmed = linesBefore[linesBefore.length - 1].length

  let origIndex = 0
  for (let l = 0; l < startLineIdx; l++) {
    origIndex += origLines[l].length + 1
  }
  origIndex += startColInTrimmed

  let origEndIndex = origIndex
  for (let l = 0; l < matchLines.length; l++) {
    const origLineIdx = startLineIdx + l
    if (l === 0) {
      if (matchLines.length === 1) {
        origEndIndex = origIndex + matchLines[0].length
      } else {
        origEndIndex = origIndex + origLines[origLineIdx].length + 1
      }
    } else if (l === matchLines.length - 1) {
      origEndIndex += matchLines[l].length
    } else {
      origEndIndex += origLines[origLineIdx].length + 1
    }
  }

  return (
    originalContent.slice(0, origIndex) +
    replace +
    originalContent.slice(origEndIndex)
  )
}

/**
 * Apply operations to the filesystem atomically.
 * Computes all new file contents first, then writes them all.
 * If any operation fails, no files are written.
 */
export function applyPatches(
  operations: FileOperation[],
  projectDir: string
): ApplyResult {
  const affectedFiles: string[] = []
  const diffs: FileDiff[] = []
  const pendingWrites: Array<{
    filePath: string
    content: string
  }> = []

  for (const op of operations) {
    const absolutePath = path.resolve(projectDir, op.filePath)
    affectedFiles.push(op.filePath)

    if (op.type === 'write') {
      const content = op.content || ''
      const lineCount = content.split('\n').length
      pendingWrites.push({ filePath: absolutePath, content })
      diffs.push({
        file: op.filePath,
        type: 'write',
        summary: `${lineCount} lines`,
      })
      continue
    }

    // edit (search-replace)
    let originalContent: string
    try {
      originalContent = fs.readFileSync(absolutePath, 'utf-8')
    } catch {
      return {
        success: false,
        affectedFiles,
        diffs,
        error: `File not found: ${op.filePath}`,
      }
    }

    try {
      const newContent = applyEdit(
        originalContent,
        op.search || '',
        op.replace || '',
        op.filePath
      )
      pendingWrites.push({ filePath: absolutePath, content: newContent })

      const searchLines = (op.search || '').split('\n').length
      const replaceLines = (op.replace || '').split('\n').length
      diffs.push({
        file: op.filePath,
        type: 'edit',
        summary: `-${searchLines} lines, +${replaceLines} lines`,
      })
    } catch (e) {
      return {
        success: false,
        affectedFiles,
        diffs,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  }

  // Write all files
  for (const { filePath, content } of pendingWrites) {
    const dir = path.dirname(filePath)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, content, 'utf-8')
  }

  return { success: true, affectedFiles, diffs }
}
