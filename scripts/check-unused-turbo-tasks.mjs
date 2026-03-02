#!/usr/bin/env node

/**
 * Scans the Rust codebase to find unused turbo-tasks items:
 *   - #[turbo_tasks::function] definitions
 *   - #[turbo_tasks::value] struct/enum definitions
 *   - #[turbo_tasks::value_trait] trait definitions
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
        files.push(join(dir, entry))
      }
    }
  }
  return files
}

// ---------------------------------------------------------------------------
// Phase 1: Extract all turbo-tasks definitions (functions, values, traits)
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

const FN_NAME_RE = /\bfn\s+([a-zA-Z_][a-zA-Z0-9_]*)/
const VALUE_IMPL_RE = /^#\[turbo_tasks::value_impl/
const VALUE_TRAIT_ATTR_RE = /^#\[turbo_tasks::value_trait/
const TT_FUNCTION_RE = /^#\[turbo_tasks::function/
// #[turbo_tasks::value...] but NOT value_impl or value_trait
const TT_VALUE_RE = /^#\[turbo_tasks::value(?![_a-zA-Z0-9])/
const IMPL_HEADER_RE =
  /^\s*impl\s*(?:<[^>]*>\s*)?([A-Za-z_][A-Za-z0-9_:]*(?:<[^>]*>)?)\s+for\s+([A-Za-z_][A-Za-z0-9_:]*)/
const IMPL_INHERENT_RE = /^\s*impl\s*(?:<[^>]*>\s*)?([A-Za-z_][A-Za-z0-9_:]*)/
const TRAIT_HEADER_RE = /^\s*(?:pub\s+)?trait\s+([A-Za-z_][A-Za-z0-9_]*)/
// Match struct or enum name (possibly preceded by pub, derive attrs, etc.)
const STRUCT_ENUM_NAME_RE =
  /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum)\s+([A-Za-z_][A-Za-z0-9_]*)/

/**
 * Count unbalanced braces on a line, ignoring string literals and comments.
 * Returns the net change in brace depth.
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

    // Line comment
    if (!inString && !inChar && ch === '/' && line[i + 1] === '/') {
      break
    }

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

    // Simplified char literal detection: skip 'x' patterns
    // (not perfect but sufficient for brace counting)
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
 * Parse a single file for turbo-tasks definitions (functions, values, traits).
 */
function parseDefinitions(filePath, content) {
  const lines = content.split('\n')
  /** @type {Definition[]} */
  const definitions = []

  // Block tracking state
  let braceDepth = 0

  /**
   * Stack of blocks we're inside.
   * @type {Array<{ type: 'value_impl' | 'value_trait', startDepth: number, typeName?: string, traitName?: string, implKind?: 'inherent' | 'trait' | 'trait_def' }>}
   */
  const blockStack = []

  let pendingBlockType = null // 'value_impl' | 'value_trait' – waiting for header
  let pendingFnAnnotationLine = -1 // line number of #[turbo_tasks::function]
  let pendingValueLine = -1 // line number of #[turbo_tasks::value]
  let pendingValueTraitLine = -1 // line number of #[turbo_tasks::value_trait]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trimStart()

    // Skip full-line comments for annotation detection
    const isComment = trimmed.startsWith('//')

    if (!isComment) {
      // Detect #[turbo_tasks::value_impl]
      if (VALUE_IMPL_RE.test(trimmed)) {
        pendingBlockType = 'value_impl'
      }

      // Detect #[turbo_tasks::value_trait]
      if (VALUE_TRAIT_ATTR_RE.test(trimmed)) {
        pendingBlockType = 'value_trait'
        pendingValueTraitLine = i
      }

      // Detect #[turbo_tasks::value] (not value_impl or value_trait)
      if (TT_VALUE_RE.test(trimmed)) {
        pendingValueLine = i
      }

      // Detect #[turbo_tasks::function...]
      if (TT_FUNCTION_RE.test(trimmed)) {
        pendingFnAnnotationLine = i
      }

      // Try to extract struct/enum name for #[turbo_tasks::value]
      if (pendingValueLine >= 0) {
        const seMatch = STRUCT_ENUM_NAME_RE.exec(trimmed)
        if (seMatch) {
          definitions.push({
            name: seMatch[1],
            kind: 'value',
            filePath,
            line: i + 1,
            context: 'free',
          })
          pendingValueLine = -1
        } else if (i - pendingValueLine > 10) {
          pendingValueLine = -1
        }
      }

      // Try to extract trait name for #[turbo_tasks::value_trait]
      if (pendingValueTraitLine >= 0) {
        const traitMatch = TRAIT_HEADER_RE.exec(trimmed)
        if (traitMatch) {
          definitions.push({
            name: traitMatch[1],
            kind: 'value_trait',
            filePath,
            line: i + 1,
            context: 'free',
          })
          pendingValueTraitLine = -1
        } else if (i - pendingValueTraitLine > 10) {
          pendingValueTraitLine = -1
        }
      }

      // Try to extract fn name if we have a pending annotation
      if (pendingFnAnnotationLine >= 0) {
        const fnMatch = FN_NAME_RE.exec(trimmed)
        if (fnMatch) {
          const fnName = fnMatch[1]
          const currentBlock =
            blockStack.length > 0 ? blockStack[blockStack.length - 1] : null

          let context = 'free'
          let typeName
          let traitName

          if (currentBlock) {
            if (currentBlock.implKind === 'inherent') {
              context = 'inherent_impl'
              typeName = currentBlock.typeName
            } else if (currentBlock.implKind === 'trait') {
              context = 'trait_impl'
              typeName = currentBlock.typeName
              traitName = currentBlock.traitName
            } else if (currentBlock.implKind === 'trait_def') {
              context = 'trait_def'
              traitName = currentBlock.traitName
            }
          }

          definitions.push({
            name: fnName,
            kind: 'function',
            filePath,
            line: i + 1, // 1-based
            context,
            ...(typeName && { typeName }),
            ...(traitName && { traitName }),
          })

          pendingFnAnnotationLine = -1
        } else if (i - pendingFnAnnotationLine > 10) {
          // Give up looking for fn after 10 lines
          pendingFnAnnotationLine = -1
        }
      }

      // Detect impl/trait headers when we're waiting for one
      if (pendingBlockType) {
        if (pendingBlockType === 'value_impl') {
          const traitImplMatch = IMPL_HEADER_RE.exec(trimmed)
          if (traitImplMatch) {
            // impl Trait for Type
            blockStack.push({
              type: 'value_impl',
              startDepth: braceDepth,
              traitName: traitImplMatch[1],
              typeName: traitImplMatch[2],
              implKind: 'trait',
            })
            pendingBlockType = null
          } else {
            const inherentMatch = IMPL_INHERENT_RE.exec(trimmed)
            if (inherentMatch && trimmed.includes('{')) {
              // impl Type {
              blockStack.push({
                type: 'value_impl',
                startDepth: braceDepth,
                typeName: inherentMatch[1],
                implKind: 'inherent',
              })
              pendingBlockType = null
            } else if (inherentMatch && /^\s*impl\b/.test(trimmed)) {
              // impl line without opening brace yet - wait
            }
          }
        } else if (pendingBlockType === 'value_trait') {
          const traitMatch = TRAIT_HEADER_RE.exec(trimmed)
          if (traitMatch) {
            blockStack.push({
              type: 'value_trait',
              startDepth: braceDepth,
              traitName: traitMatch[1],
              implKind: 'trait_def',
            })
            pendingBlockType = null
          }
        }
      }
    }

    // Always track brace depth (even for comment lines, though comments
    // won't contribute since countBraces skips // comments)
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
// Phase 2: Build usage index
// ---------------------------------------------------------------------------

/**
 * Build a set of names that have at least one reference outside
 * their definition sites.
 *
 * @param {Map<string, string>} fileContents - filePath → content
 * @param {Set<string>} names - all unique names to check
 * @param {Map<string, Set<string>>} definitionLocations - name → Set<"filePath:line">
 * @returns {Set<string>} names that have external usage
 */
function findUsedNames(fileContents, names, definitionLocations) {
  const hasExternalUsage = new Set()

  // Pre-build a regex that matches any word-boundary identifier
  // We'll check each match against the names set
  const IDENT_RE = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g

  for (const [filePath, content] of fileContents) {
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Quick skip: if line is a comment or attribute-only line, skip it
      // (optimization: avoid regex on irrelevant lines)
      const trimmed = line.trimStart()
      if (trimmed.startsWith('//')) continue

      let match
      IDENT_RE.lastIndex = 0
      while ((match = IDENT_RE.exec(line)) !== null) {
        const name = match[1]

        // Fast path: already known used or not a tracked name
        if (hasExternalUsage.has(name)) continue
        if (!names.has(name)) continue

        // Check if this is a definition site
        const locKey = `${filePath}:${i + 1}`
        const defLocs = definitionLocations.get(name)
        if (defLocs && defLocs.has(locKey)) continue

        // This is an external usage!
        hasExternalUsage.add(name)

        // Early exit: if all names are found, we can stop entirely
        if (hasExternalUsage.size === names.size) {
          return hasExternalUsage
        }
      }
    }
  }

  return hasExternalUsage
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Step 1: Discover files
  const rsFiles = await discoverRsFiles(SCAN_DIRS)

  // Step 2: Read all files
  /** @type {Map<string, string>} */
  const fileContents = new Map()
  await Promise.all(
    rsFiles.map(async (filePath) => {
      try {
        const content = await readFile(filePath, 'utf-8')
        fileContents.set(filePath, content)
      } catch {
        // Skip unreadable files
      }
    })
  )

  // Step 3: Parse definitions from all files
  /** @type {Definition[]} */
  const allDefinitions = []
  for (const [filePath, content] of fileContents) {
    const defs = parseDefinitions(filePath, content)
    allDefinitions.push(...defs)
  }

  // Step 4: Build indexes
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

  // Step 5: Find which names have external usage
  const usedNames = findUsedNames(fileContents, allNames, definitionLocations)

  // Step 6: Collect unused definitions
  const unused = allDefinitions.filter((d) => !usedNames.has(d.name))

  // Sort by file path then line
  unused.sort((a, b) => {
    const cmp = a.filePath.localeCompare(b.filePath)
    if (cmp !== 0) return cmp
    return a.line - b.line
  })

  // Step 7: Report
  if (unused.length === 0) {
    console.log(
      `No unused turbo-tasks items found (${allDefinitions.length} total checked).`
    )
    process.exit(0)
  }

  console.log('Unused turbo-tasks items:\n')
  for (const def of unused) {
    const relPath = relative(ROOT, def.filePath)

    if (def.kind === 'value') {
      console.log(`  ${relPath}:${def.line} - value ${def.name}`)
    } else if (def.kind === 'value_trait') {
      console.log(`  ${relPath}:${def.line} - value_trait ${def.name}`)
    } else {
      let contextStr = ''
      switch (def.context) {
        case 'free':
          contextStr = 'free function'
          break
        case 'inherent_impl':
          contextStr = `method on ${def.typeName}`
          break
        case 'trait_impl':
          contextStr = `impl ${def.traitName} for ${def.typeName}`
          break
        case 'trait_def':
          contextStr = `trait ${def.traitName} default method`
          break
        default:
          contextStr = def.context
          break
      }
      console.log(`  ${relPath}:${def.line} - fn ${def.name} (${contextStr})`)
    }
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
