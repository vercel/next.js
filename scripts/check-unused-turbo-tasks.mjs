#!/usr/bin/env node

/**
 * Scans the Rust codebase to find unused turbo-tasks items:
 *   - #[turbo_tasks::function]    → fn definitions
 *   - #[turbo_tasks::value]       → struct/enum definitions
 *   - #[turbo_tasks::value_trait] → trait definitions
 *
 * Exit code 0: no unused items found
 * Exit code 1: unused items found
 *
 * Usage: node scripts/check-unused-turbo-tasks.mjs
 */

import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(__dirname, '..')

const SCAN_DIRS = [join(ROOT, 'turbopack/crates'), join(ROOT, 'crates')]
const EXCLUDE_DIRS = ['turbo-tasks-macros-tests']

// After seeing an attribute, give up looking for the item it annotates
// if we haven't found it within this many lines.
const MAX_ANNOTATION_DISTANCE = 10

// ---------------------------------------------------------------------------
// Regexes
// ---------------------------------------------------------------------------

// Attribute detection (applied to trimmed lines)
const TT_FUNCTION_RE = /^#\[turbo_tasks::function/
const TT_VALUE_RE = /^#\[turbo_tasks::value(?![_a-zA-Z0-9])/ // not value_impl or value_trait
const TT_VALUE_IMPL_RE = /^#\[turbo_tasks::value_impl/
const TT_VALUE_TRAIT_RE = /^#\[turbo_tasks::value_trait/

// Item-header extraction
const FN_NAME_RE = /\bfn\s+([a-zA-Z_][a-zA-Z0-9_]*)/
const STRUCT_ENUM_RE =
  /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum)\s+([A-Za-z_][A-Za-z0-9_]*)/
const TRAIT_RE = /^\s*(?:pub\s+)?trait\s+([A-Za-z_][A-Za-z0-9_]*)/
const IMPL_TRAIT_FOR_RE =
  /^\s*impl\s*(?:<[^>]*>\s*)?([A-Za-z_][A-Za-z0-9_:]*(?:<[^>]*>)?)\s+for\s+([A-Za-z_][A-Za-z0-9_:]*)/
const IMPL_INHERENT_RE = /^\s*impl\s*(?:<[^>]*>\s*)?([A-Za-z_][A-Za-z0-9_:]*)/

// Usage scanning
const IDENT_RE = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   name: string,
 *   kind: 'function' | 'value' | 'value_trait',
 *   filePath: string,
 *   line: number,
 *   context: 'free' | 'inherent_impl' | 'trait_impl' | 'trait_def',
 *   typeName?: string,
 *   traitName?: string,
 * }} Definition
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Tracks a "pending annotation": an attribute was seen on some line and we are
 * scanning forward to find the item it annotates (a fn, struct, enum, or trait).
 *
 * Returns null when a match is found or the search window expires, along with
 * the matched name (or null).
 */
function resolvePending(pending, currentLine, trimmed, itemRe) {
  if (pending < 0) return { pending, match: null }
  const m = itemRe.exec(trimmed)
  if (m) return { pending: -1, match: m[1] }
  if (currentLine - pending > MAX_ANNOTATION_DISTANCE)
    return { pending: -1, match: null }
  return { pending, match: null }
}

/**
 * Count unbalanced braces on a line, ignoring string literals and comments.
 */
function countBraces(line) {
  let depth = 0
  let inString = false
  let escape = false
  let inChar = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]

    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\') {
      escape = true
      continue
    }

    // Line comment — stop processing
    if (!inString && !inChar && ch === '/' && line[i + 1] === '/') break

    if (inString) {
      if (ch === '"') inString = false
      continue
    }
    if (inChar) {
      if (ch === "'") inChar = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }

    // Simplified char literal detection ('x')
    if (ch === "'" && i + 2 < line.length && line[i + 2] === "'") {
      i += 2
      continue
    }

    if (ch === '{') depth++
    if (ch === '}') depth--
  }

  return depth
}

/**
 * Format a Definition for display.
 */
function formatDefinition(def, relPath) {
  const loc = `${relPath}:${def.line}`
  if (def.kind === 'value') return `  ${loc} - value ${def.name}`
  if (def.kind === 'value_trait') return `  ${loc} - value_trait ${def.name}`

  const contextLabels = {
    free: 'free function',
    inherent_impl: `method on ${def.typeName}`,
    trait_impl: `impl ${def.traitName} for ${def.typeName}`,
    trait_def: `trait ${def.traitName} default method`,
  }
  const ctx = contextLabels[def.context] ?? def.context
  return `  ${loc} - fn ${def.name} (${ctx})`
}

// ---------------------------------------------------------------------------
// Phase 0: Discover all .rs files
// ---------------------------------------------------------------------------

async function discoverRsFiles(dirs) {
  const files = []
  for (const dir of dirs) {
    let entries
    try {
      entries = await readdir(dir, { recursive: true, withFileTypes: false })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.endsWith('.rs')) {
        const parts = entry.split('/')
        if (parts.some((p) => EXCLUDE_DIRS.includes(p))) continue
        files.push(join(dir, entry))
      }
    }
  }
  return files
}

// ---------------------------------------------------------------------------
// Phase 1: Extract definitions
// ---------------------------------------------------------------------------

/**
 * Parse a single .rs file for turbo-tasks definitions.
 *
 * Tracks three kinds of pending annotations:
 *   - #[turbo_tasks::function]    → expects `fn <name>`
 *   - #[turbo_tasks::value]       → expects `struct <name>` or `enum <name>`
 *   - #[turbo_tasks::value_trait] → expects `trait <name>`
 *
 * Also maintains a block stack to determine whether a function lives inside a
 * #[turbo_tasks::value_impl] or #[turbo_tasks::value_trait] block, which gives
 * the function its context (inherent method, trait impl, trait default method).
 */
function parseDefinitions(filePath, content) {
  const lines = content.split('\n')
  /** @type {Definition[]} */
  const definitions = []

  let braceDepth = 0

  /**
   * Stack of impl/trait blocks we're inside (for function context).
   * @type {Array<{ startDepth: number, typeName?: string, traitName?: string, implKind: 'inherent' | 'trait' | 'trait_def' }>}
   */
  const blockStack = []

  // Pending attribute state: line index where the attribute was seen, or -1.
  let pendingFn = -1
  let pendingValue = -1
  let pendingValueTrait = -1
  let pendingBlockType = null // 'value_impl' | 'value_trait'

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trimStart()
    const isComment = trimmed.startsWith('//')

    if (!isComment) {
      // --- Detect attributes ---

      if (TT_VALUE_IMPL_RE.test(trimmed)) pendingBlockType = 'value_impl'

      if (TT_VALUE_TRAIT_RE.test(trimmed)) {
        pendingBlockType = 'value_trait'
        pendingValueTrait = i
      }

      if (TT_VALUE_RE.test(trimmed)) pendingValue = i
      if (TT_FUNCTION_RE.test(trimmed)) pendingFn = i

      // --- Resolve pending value/value_trait annotations into definitions ---

      {
        const r = resolvePending(pendingValue, i, trimmed, STRUCT_ENUM_RE)
        pendingValue = r.pending
        if (r.match) {
          definitions.push({
            name: r.match,
            kind: 'value',
            filePath,
            line: i + 1,
            context: 'free',
          })
        }
      }

      {
        const r = resolvePending(pendingValueTrait, i, trimmed, TRAIT_RE)
        pendingValueTrait = r.pending
        if (r.match) {
          definitions.push({
            name: r.match,
            kind: 'value_trait',
            filePath,
            line: i + 1,
            context: 'free',
          })
        }
      }

      // --- Resolve pending function annotations ---

      {
        const r = resolvePending(pendingFn, i, trimmed, FN_NAME_RE)
        pendingFn = r.pending
        if (r.match) {
          const block =
            blockStack.length > 0 ? blockStack[blockStack.length - 1] : null
          let context = 'free'
          let typeName, traitName

          if (block) {
            if (block.implKind === 'inherent') {
              context = 'inherent_impl'
              typeName = block.typeName
            } else if (block.implKind === 'trait') {
              context = 'trait_impl'
              typeName = block.typeName
              traitName = block.traitName
            } else if (block.implKind === 'trait_def') {
              context = 'trait_def'
              traitName = block.traitName
            }
          }

          definitions.push({
            name: r.match,
            kind: 'function',
            filePath,
            line: i + 1,
            context,
            ...(typeName && { typeName }),
            ...(traitName && { traitName }),
          })
        }
      }

      // --- Resolve pending block headers (value_impl / value_trait) ---

      if (pendingBlockType === 'value_impl') {
        const traitImplMatch = IMPL_TRAIT_FOR_RE.exec(trimmed)
        if (traitImplMatch) {
          blockStack.push({
            startDepth: braceDepth,
            traitName: traitImplMatch[1],
            typeName: traitImplMatch[2],
            implKind: 'trait',
          })
          pendingBlockType = null
        } else {
          const inherentMatch = IMPL_INHERENT_RE.exec(trimmed)
          if (inherentMatch && trimmed.includes('{')) {
            blockStack.push({
              startDepth: braceDepth,
              typeName: inherentMatch[1],
              implKind: 'inherent',
            })
            pendingBlockType = null
          }
          // else: impl line without opening brace yet — keep waiting
        }
      } else if (pendingBlockType === 'value_trait') {
        const traitMatch = TRAIT_RE.exec(trimmed)
        if (traitMatch) {
          blockStack.push({
            startDepth: braceDepth,
            traitName: traitMatch[1],
            implKind: 'trait_def',
          })
          pendingBlockType = null
        }
      }
    }

    // Track brace depth (even for comment lines — countBraces skips //)
    braceDepth += countBraces(line)

    // Pop blocks that have closed
    while (
      blockStack.length > 0 &&
      braceDepth <= blockStack[blockStack.length - 1].startDepth
    ) {
      blockStack.pop()
    }
  }

  return definitions
}

// ---------------------------------------------------------------------------
// Phase 2: Find used names
// ---------------------------------------------------------------------------

/**
 * Scan all file contents and return the set of definition names that appear
 * at least once outside their definition site.
 *
 * @param {Map<string, string>} fileContents
 * @param {Set<string>} names
 * @param {Map<string, Set<string>>} definitionLocations  name → Set<"path:line">
 * @returns {Set<string>}
 */
function findUsedNames(fileContents, names, definitionLocations) {
  const used = new Set()

  for (const [filePath, content] of fileContents) {
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.trimStart().startsWith('//')) continue

      let match
      IDENT_RE.lastIndex = 0
      while ((match = IDENT_RE.exec(line)) !== null) {
        const name = match[1]
        if (used.has(name) || !names.has(name)) continue

        // Skip the definition site itself
        const defLocs = definitionLocations.get(name)
        if (defLocs && defLocs.has(`${filePath}:${i + 1}`)) continue

        used.add(name)
        if (used.size === names.size) return used
      }
    }
  }

  return used
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const rsFiles = await discoverRsFiles(SCAN_DIRS)

  /** @type {Map<string, string>} */
  const fileContents = new Map()
  await Promise.all(
    rsFiles.map(async (filePath) => {
      try {
        fileContents.set(filePath, await readFile(filePath, 'utf-8'))
      } catch {
        /* skip unreadable files */
      }
    })
  )

  // Parse definitions from all files
  /** @type {Definition[]} */
  const allDefinitions = []
  for (const [filePath, content] of fileContents) {
    allDefinitions.push(...parseDefinitions(filePath, content))
  }

  // Build indexes
  const allNames = new Set(allDefinitions.map((d) => d.name))
  /** @type {Map<string, Set<string>>} */
  const definitionLocations = new Map()
  for (const def of allDefinitions) {
    const key = `${def.filePath}:${def.line}`
    if (!definitionLocations.has(def.name)) {
      definitionLocations.set(def.name, new Set())
    }
    definitionLocations.get(def.name).add(key)
  }

  // Find which names have external usage
  const usedNames = findUsedNames(fileContents, allNames, definitionLocations)

  // Collect and sort unused definitions
  const unused = allDefinitions
    .filter((d) => !usedNames.has(d.name))
    .sort((a, b) => a.filePath.localeCompare(b.filePath) || a.line - b.line)

  // Report
  if (unused.length === 0) {
    console.log(
      `No unused turbo-tasks items found (${allDefinitions.length} total checked).`
    )
    process.exit(0)
  }

  console.log('Unused turbo-tasks items:\n')
  for (const def of unused) {
    console.log(formatDefinition(def, relative(ROOT, def.filePath)))
  }
  console.log(
    `\nFound ${unused.length} unused turbo-tasks item(s) out of ${allDefinitions.length} total.`
  )
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(2)
})
