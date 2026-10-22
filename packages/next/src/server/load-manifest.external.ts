import type { DeepReadonly } from '../shared/lib/deep-readonly'

import { join } from 'path'
import { readFileSync } from 'fs'
import { createContext, runInContext, runInNewContext } from 'vm'
import type { Context } from 'vm'
import { deepFreeze } from '../shared/lib/deep-freeze'

const sharedCache = new Map<string, unknown>()

/**
 * Load a manifest file from the file system. Optionally cache the manifest in
 * memory to avoid reading the file multiple times using the provided cache or
 * defaulting to a shared module cache. The manifest is frozen to prevent
 * modifications if it is cached.
 *
 * @param path the path to the manifest file
 * @param shouldCache whether to cache the manifest in memory
 * @param cache the cache to use for storing the manifest
 * @returns the manifest object
 */
export function loadManifest<T extends object>(
  path: string,
  shouldCache: false
): T
export function loadManifest<T extends object>(
  path: string,
  shouldCache?: boolean,
  cache?: Map<string, unknown>,
  skipParse?: boolean
): DeepReadonly<T>
export function loadManifest<T extends object>(
  path: string,
  shouldCache?: boolean,
  cache?: Map<string, unknown>,
  skipParse?: boolean,
  handleMissing?: boolean
): DeepReadonly<T | undefined>
export function loadManifest<T extends object>(
  path: string,
  shouldCache: boolean = true,
  cache = sharedCache,
  skipParse = false,
  handleMissing?: boolean
): T | undefined {
  if (shouldCache && cache.has(path)) {
    return cache.get(path) as T
  }

  let manifest: any

  if (handleMissing) {
    try {
      manifest = readFileSync(/* turbopackIgnore: true */ path, 'utf8')
    } catch (err) {
      let result = undefined
      cache.set(path, result)
      return result
    }
  } else {
    manifest = readFileSync(/* turbopackIgnore: true */ path, 'utf8')
  }

  if (!skipParse) {
    manifest = JSON.parse(manifest)

    // Freeze the manifest so it cannot be modified if we're caching it.
    if (shouldCache) {
      manifest = deepFreeze(manifest)
    }
  }

  if (shouldCache) {
    cache.set(path, manifest)
  }

  return manifest
}

export function evalManifest<T extends object>(
  path: string,
  shouldCache: false
): T
export function evalManifest<T extends object>(
  path: string,
  shouldCache?: true,
  cache?: Map<string, unknown>
): DeepReadonly<T>
export function evalManifest<T extends object>(
  path: string,
  shouldCache?: boolean,
  cache?: Map<string, unknown>,
  handleMissing?: boolean
): DeepReadonly<T | undefined>
export function evalManifest<T extends object>(
  path: string,
  shouldCache: boolean = true,
  cache = sharedCache,
  handleMissing?: boolean
): T | undefined {
  if (shouldCache && cache.has(path)) {
    return cache.get(path) as T
  }

  let content: any
  if (handleMissing) {
    try {
      content = readFileSync(/* turbopackIgnore: true */ path, 'utf8')
    } catch (err) {
      let result = undefined
      cache.set(path, result)
      return result
    }
  } else {
    content = readFileSync(/* turbopackIgnore: true */ path, 'utf8')
  }

  if (content.length === 0) {
    throw new Error('Manifest file is empty')
  }

  let contextObject = evalClientReferenceManifestSource(content)

  // Freeze the context object so it cannot be modified if we're caching it.
  if (shouldCache) {
    contextObject = deepFreeze(contextObject)
  }

  if (shouldCache) {
    cache.set(path, contextObject)
  }

  return contextObject as T
}

export type ClientReferenceManifestSourceKind =
  | {
      /** A plain `globalThis.__RSC_MANIFEST[key] = <JSON>;` assignment. */
      type: 'json'
      key: string
      value: unknown
    }
  | {
      /** The JSON assignment followed by Turbopack's deployment ID suffix. */
      type: 'deployment-id'
    }
  | {
      /** Anything else: must be evaluated in an isolated V8 context. */
      type: 'unknown'
    }

const MANIFEST_PREFIX_RE =
  // Webpack: `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});`
  // Turbopack: `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};`
  /^\s*globalThis\.__RSC_MANIFEST\s*=\s*(?:\(\s*globalThis\.__RSC_MANIFEST\s*\|\|\s*\{\s*\}\s*\)|globalThis\.__RSC_MANIFEST\s*\|\|\s*\{\s*\})\s*;\s*globalThis\.__RSC_MANIFEST\[/

const ASSIGNMENT_RE = /\s*\]\s*=\s*/y

/**
 * The deployment ID suffix Turbopack appends to client reference manifests
 * when the deployment ID is added at runtime. Must be kept in sync with
 * `crates/next-core/src/next_manifests/client_reference_manifest.rs`.
 * `KEY` is replaced with the entry name string literal.
 */
const DEPLOYMENT_ID_SUFFIX_TEMPLATE = `
for (const key in globalThis.__RSC_MANIFEST[KEY].clientModules) {
    const val = { ...globalThis.__RSC_MANIFEST[KEY].clientModules[key] }
    globalThis.__RSC_MANIFEST[KEY].clientModules[key] = val
    val.chunks = val.chunks.map((c) =>
        typeof c === 'string'
            ? \`\${c}?dpl=\${process.env.NEXT_DEPLOYMENT_ID}\`
            : [\`\${c[0]}?dpl=\${process.env.NEXT_DEPLOYMENT_ID}\`, c[1], c[2]])
}
`

/**
 * Splits source into its non-empty lines with surrounding whitespace removed.
 * Line breaks are preserved (they matter for ASI), only indentation and blank
 * lines are ignored.
 */
function toNormalizedLines(source: string): string[] {
  const lines: string[] = []
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed !== '') {
      lines.push(trimmed)
    }
  }
  return lines
}

function isDeploymentIdSuffix(suffix: string, keyLiteral: string): boolean {
  const expected = toNormalizedLines(
    DEPLOYMENT_ID_SUFFIX_TEMPLATE.split('[KEY]').join(`[${keyLiteral}]`)
  )
  const actual = toNormalizedLines(suffix)
  return (
    actual.length === expected.length &&
    actual.every((line, i) => line === expected[i])
  )
}

function hasOwnProtoKey(value: unknown): boolean {
  if (value === null || typeof value !== 'object') {
    return false
  }
  if (Object.hasOwn(value, '__proto__')) {
    return true
  }
  for (const child of Object.values(value)) {
    if (hasOwnProtoKey(child)) {
      return true
    }
  }
  return false
}

/**
 * Classifies the source of a `*_client-reference-manifest.js` file without
 * evaluating it. The webpack and Turbopack generated files are a JSON object
 * assigned to `globalThis.__RSC_MANIFEST[<entry name>]`, which can be read
 * with `JSON.parse` instead of evaluating JavaScript (`json`). Turbopack's
 * deployment ID variant appends a fixed loop that still has to be evaluated
 * (`deployment-id`).
 *
 * Anything that doesn't exactly match a known generated shape is classified
 * as `unknown`, so the caller falls back to evaluating it in a new context.
 */
export function classifyClientReferenceManifestSource(
  content: string
): ClientReferenceManifestSourceKind {
  const unknown = { type: 'unknown' } as const

  // `JSON.parse` treats `__proto__` as a regular key whereas an object
  // literal sets the prototype, so the results could differ.
  if (content.includes('__proto__')) {
    return unknown
  }

  const prefix = MANIFEST_PREFIX_RE.exec(content)
  if (!prefix) {
    return unknown
  }

  // The entry name is a JSON string literal.
  const keyStart = prefix[0].length
  if (content[keyStart] !== '"') {
    return unknown
  }
  let keyEnd = keyStart + 1
  while (keyEnd < content.length && content[keyEnd] !== '"') {
    keyEnd += content[keyEnd] === '\\' ? 2 : 1
  }
  if (keyEnd >= content.length) {
    return unknown
  }
  const keyLiteral = content.slice(keyStart, keyEnd + 1)

  ASSIGNMENT_RE.lastIndex = keyEnd + 1
  if (!ASSIGNMENT_RE.test(content)) {
    return unknown
  }
  const bodyStart = ASSIGNMENT_RE.lastIndex

  // The generated JSON is serialized without line breaks, so the assignment
  // ends on the line it starts on. Anything after it is a suffix.
  const rest = content.slice(bodyStart)
  const lineBreak = rest.search(/[\r\n]/)
  const assignment = (
    lineBreak === -1 ? rest : rest.slice(0, lineBreak)
  ).trimEnd()
  const suffix = lineBreak === -1 ? '' : rest.slice(lineBreak)
  if (!assignment.endsWith(';')) {
    return unknown
  }

  let key: string
  let value: unknown
  try {
    key = JSON.parse(keyLiteral)
    value = JSON.parse(assignment.slice(0, -1))
  } catch {
    return unknown
  }

  // `__proto__` can also be spelled with unicode escapes, which the
  // `includes` check above doesn't catch.
  if (
    content.includes('\\u') &&
    (key === '__proto__' || hasOwnProtoKey(value))
  ) {
    return unknown
  }

  if (suffix.trim() === '') {
    return { type: 'json', key, value }
  }

  if (isDeploymentIdSuffix(suffix, keyLiteral)) {
    return { type: 'deployment-id' }
  }

  return unknown
}

let deploymentIdManifestContext: Context | undefined

/**
 * Evaluates a Turbopack client reference manifest with the deployment ID
 * suffix. Creating a V8 context is expensive, so a single context is reused.
 * This is only done for sources that were verified to exactly match the
 * generated shape (see `classifyClientReferenceManifestSource`), which only
 * write `globalThis.__RSC_MANIFEST` and read `process.env`, both of which are
 * reset for every call. The context itself is never returned.
 */
function evalDeploymentIdManifest(content: string) {
  deploymentIdManifestContext ??= createContext({})
  const context = deploymentIdManifestContext
  const processObject = {
    env: { NEXT_DEPLOYMENT_ID: process.env.NEXT_DEPLOYMENT_ID },
  }
  context.process = processObject
  context.__RSC_MANIFEST = undefined
  try {
    runInContext(content, context)
    return {
      process: processObject,
      __RSC_MANIFEST: context.__RSC_MANIFEST,
    }
  } finally {
    context.process = undefined
    context.__RSC_MANIFEST = undefined
  }
}

/**
 * Evaluates the source of a `*_client-reference-manifest.js` file and returns
 * the resulting global object (`{ process, __RSC_MANIFEST }`):
 * - plain generated assignments are parsed with `JSON.parse`,
 * - Turbopack's generated deployment ID variant runs in a reused V8 context,
 * - anything else runs in a new V8 context.
 */
export function evalClientReferenceManifestSource(content: string): {
  process: { env: { NEXT_DEPLOYMENT_ID: string | undefined } }
  __RSC_MANIFEST?: Record<string, unknown>
  [key: string]: unknown
} {
  const kind = classifyClientReferenceManifestSource(content)
  switch (kind.type) {
    case 'json':
      return {
        process: {
          env: { NEXT_DEPLOYMENT_ID: process.env.NEXT_DEPLOYMENT_ID },
        },
        __RSC_MANIFEST: { [kind.key]: kind.value },
      }
    case 'deployment-id':
      return evalDeploymentIdManifest(content)
    default: {
      const contextObject = {
        process: {
          env: { NEXT_DEPLOYMENT_ID: process.env.NEXT_DEPLOYMENT_ID },
        },
      }
      runInNewContext(content, contextObject)
      return contextObject
    }
  }
}

export function evalManifestFromRelativePath<T extends object>({
  projectDir,
  distDir,
  manifest,
  shouldCache,
  cache,
  handleMissing,
}: {
  projectDir: string
  distDir: string
  manifest: string
  shouldCache: boolean
  cache?: Map<string, unknown>
  skipParse?: boolean
  handleMissing?: boolean
}): DeepReadonly<T | undefined> {
  const manifestPath = join(
    /* turbopackIgnore: true */ projectDir,
    distDir,
    manifest
  )
  return evalManifest<T>(manifestPath, shouldCache, cache, handleMissing)
}

export function loadManifestFromRelativePath<T extends object>({
  projectDir,
  distDir,
  manifest,
  shouldCache,
  cache,
  skipParse,
  handleMissing,
}: {
  projectDir: string
  distDir: string
  manifest: string
  shouldCache: boolean
  cache?: Map<string, unknown>
  skipParse?: boolean
  handleMissing?: false | undefined
}): DeepReadonly<T>
export function loadManifestFromRelativePath<T extends object>({
  projectDir,
  distDir,
  manifest,
  shouldCache,
  cache,
  skipParse,
  handleMissing,
}: {
  projectDir: string
  distDir: string
  manifest: string
  shouldCache: boolean
  cache?: Map<string, unknown>
  skipParse?: boolean
  handleMissing: true
}): DeepReadonly<T | undefined>
export function loadManifestFromRelativePath<T extends object>({
  projectDir,
  distDir,
  manifest,
  shouldCache,
  cache,
  skipParse,
  handleMissing,
}: {
  projectDir: string
  distDir: string
  manifest: string
  shouldCache: boolean
  cache?: Map<string, unknown>
  skipParse?: boolean
  handleMissing?: boolean
}): DeepReadonly<T | undefined> {
  const manifestPath = join(
    /* turbopackIgnore: true */ projectDir,
    distDir,
    manifest
  )
  return loadManifest<T>(
    manifestPath,
    shouldCache,
    cache,
    skipParse,
    handleMissing
  )
}

export function clearManifestCache(path: string, cache = sharedCache): boolean {
  return cache.delete(path)
}
