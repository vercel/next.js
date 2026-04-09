// @ts-check

/**
 * Git merge driver for packages/next/errors.json
 *
 * This script automatically resolves merge conflicts in the auto-generated
 * errors.json file by reassigning error codes to avoid conflicts.
 *
 * Usage: node merge-errors-json.mjs <current> <base> <other> [<marker-size>]
 *
 * Arguments:
 * - current: Path to the current version (our changes)
 * - base: Path to the common ancestor version
 * - other: Path to the other version (their changes)
 * - marker-size: Size of conflict markers (optional, defaults to 7)
 *
 * Exit codes:
 * - 0: Merge successful, result written to current file
 * - 1: Merge failed, conflicts remain
 */

import { readFileSync, writeFileSync } from 'node:fs'

function main() {
  const args = process.argv.slice(2)

  if (args.length < 3) {
    console.error(
      'Usage: node merge-errors-json.mjs <current> <base> <other> [<marker-size>]'
    )
    process.exit(1)
  }

  const [currentPath, basePath, otherPath] = args

  try {
    const base = readJsonSync(basePath)
    const current = readJsonSync(currentPath)
    const other = readJsonSync(otherPath)

    const merged = mergeErrors(base, current, other)

    // Git expects the result to be written to the "current" file
    writeJsonSync(currentPath, merged)

    const addedCount = Object.keys(merged).length - Object.keys(current).length
    console.error(
      `merge-errors-json: added ${addedCount === 1 ? '1 new message' : `${addedCount} new messages`} to errors.json`
    )
    process.exit(0)
  } catch (error) {
    console.error('merge-errors-json: merge failed:', error.message)
    console.error()
    console.error(
      [
        'if this error persists, you can disable the merge driver by running',
        '',
        '  scripts/merge-errors-json/uninstall',
        '',
        'or by manually removing the `[merge "errors-json"]` section from your .git/config.',
      ].join('\n')
    )
    process.exit(1)
  }
}

/**
 * @typedef {Record<string, string>} ErrorsMap
 */

/**
 * Merge three versions of errors.json, resolving conflicts by assigning new sequential IDs
 * @param {ErrorsMap} base - Base version (common ancestor)
 * @param {ErrorsMap} current - Current version (our changes, or the state of the branch we're rebasing onto)
 * @param {ErrorsMap} other - Other version (their changes, or the state the branch we're rebasing, a.k.a. "incoming")
 * @returns {ErrorsMap}
 */
function mergeErrors(base, current, other) {
  /** @type {ErrorsMap} */
  const result = { ...current }

  /** @type {Set<string>} */
  const existingMessages = new Set(Object.values(result))

  let nextKey = Object.keys(result).length + 1

  for (const message of getNewMessages(base, other)) {
    if (existingMessages.has(message)) {
      continue
    }

    const key = nextKey++
    result[key] = message
    existingMessages.add(message)
  }

  return result
}

function getNewMessages(
  /** @type {ErrorsMap} */ prev,
  /** @type {ErrorsMap} */ current
) {
  const existing = new Set(Object.values(prev))
  return Object.values(current).filter((msg) => !existing.has(msg))
}

function readJsonSync(/** @type {string} */ filePath) {
  const content = readFileSync(filePath, 'utf8')
  return JSON.parse(content)
}

function writeJsonSync(
  /** @type {string} */ filePath,
  /** @type {any} */ value
) {
  const content = JSON.stringify(value, null, 2) + '\n'
  writeFileSync(filePath, content, 'utf8')
}

main()
