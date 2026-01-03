/**
 * V8 Bytecode Cache for Dev Server Bundle
 *
 * This module provides bytecode caching specifically for the bundled dev server,
 * avoiding the overhead of parsing large JavaScript files on every startup.
 *
 * Unlike Node.js's NODE_COMPILE_CACHE which caches everything (including user code),
 * this only caches the dev server bundle which doesn't change between restarts.
 *
 * Important: Bytecode is saved AFTER a warmup period to capture JIT-optimized code.
 * V8's TurboFan compiler optimizes hot code paths, and we want to cache that.
 *
 * Debug logging: Set DEBUG=next:bytecode-cache to see cache hit/miss info
 */

import { Script } from 'vm'
import { createRequire } from 'module'
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from 'fs'
import { createHash } from 'crypto'
import { join, dirname, basename } from 'path'
import { tmpdir } from 'os'
import setupDebug from 'next/dist/compiled/debug'

const debug = setupDebug('next:bytecode-cache')

const CACHE_VERSION = 2
// How long to wait before saving bytecode (allows JIT warmup)
const WARMUP_DELAY_MS = 10_000

interface CacheMetadata {
  version: number
  sourceHash: string
  nodeVersion: string
  v8Version: string
  mtime: number
}

/**
 * Get the cache directory for bytecode files
 */
function getCacheDir(): string {
  // Use .next/cache/bytecode if in a project, otherwise use temp
  const projectCacheDir = join(process.cwd(), '.next', 'cache', 'bytecode')
  if (existsSync(join(process.cwd(), '.next'))) {
    return projectCacheDir
  }
  // Fallback to a temp location (use os.tmpdir() for cross-platform support)
  return join(tmpdir(), 'next-bytecode-cache', process.version)
}

/**
 * Generate a hash of the source file for cache validation
 */
function hashSource(source: string): string {
  return createHash('sha256').update(source).digest('hex').slice(0, 16)
}

/**
 * Get the cache file paths for a given module
 */
function getCachePaths(
  modulePath: string,
  cacheDir: string
): { bytecode: string; metadata: string } {
  const moduleHash = createHash('sha256')
    .update(modulePath)
    .digest('hex')
    .slice(0, 16)
  return {
    bytecode: join(cacheDir, `${moduleHash}.bytecode`),
    metadata: join(cacheDir, `${moduleHash}.json`),
  }
}

/**
 * Check if cached bytecode is valid
 */
function isCacheValid(
  metadata: CacheMetadata,
  sourceHash: string,
  sourceMtime: number
): boolean {
  return (
    metadata.version === CACHE_VERSION &&
    metadata.sourceHash === sourceHash &&
    metadata.nodeVersion === process.version &&
    metadata.v8Version === (process.versions.v8 || '') &&
    metadata.mtime === sourceMtime
  )
}

// Track scripts that need deferred cache saving after warmup
const pendingCacheSaves: Array<{
  script: Script
  bytecodePath: string
  metadataPath: string
  sourceHash: string
  sourceMtime: number
  cacheDir: string
}> = []

// Track which bytecode paths are already pending to avoid duplicates
const pendingBytecodePaths = new Set<string>()

let warmupScheduled = false

/**
 * Schedule deferred bytecode cache saves after JIT warmup
 */
function scheduleDeferredCacheSave(): void {
  if (warmupScheduled || pendingCacheSaves.length === 0) return
  warmupScheduled = true

  debug('scheduling bytecode cache save after %dms warmup', WARMUP_DELAY_MS)

  setTimeout(() => {
    for (const pending of pendingCacheSaves) {
      try {
        // Use createCachedData() to get JIT-optimized bytecode
        const cachedData = pending.script.createCachedData()
        if (cachedData && cachedData.length > 0) {
          mkdirSync(pending.cacheDir, { recursive: true })
          writeFileSync(pending.bytecodePath, cachedData)
          writeFileSync(
            pending.metadataPath,
            JSON.stringify({
              version: CACHE_VERSION,
              sourceHash: pending.sourceHash,
              nodeVersion: process.version,
              v8Version: process.versions.v8 || '',
              mtime: pending.sourceMtime,
            } satisfies CacheMetadata)
          )
          debug(
            'wrote bytecode cache (%d KB) to %s',
            Math.round(cachedData.length / 1024),
            pending.bytecodePath
          )
        }
      } catch (err) {
        debug('failed to write bytecode cache: %s', err)
      }
    }
    pendingCacheSaves.length = 0
    pendingBytecodePaths.clear()
    warmupScheduled = false // Reset flag to allow future cache saves
  }, WARMUP_DELAY_MS).unref() // unref so it doesn't keep the process alive
}

/**
 * Load a module with bytecode caching
 *
 * This function:
 * 1. Checks if valid cached bytecode exists
 * 2. If yes, loads using cached bytecode (faster)
 * 3. If no, compiles the script and schedules bytecode save after JIT warmup
 *
 * The deferred save captures JIT-optimized bytecode from V8's TurboFan compiler,
 * resulting in faster execution on subsequent startups.
 *
 * @param modulePath - Absolute path to the JavaScript file
 * @returns The module exports
 */
export function loadWithBytecodeCache(modulePath: string): any {
  const cacheDir = getCacheDir()
  const { bytecode: bytecodePath, metadata: metadataPath } = getCachePaths(
    modulePath,
    cacheDir
  )

  // Read source file
  const source = readFileSync(modulePath, 'utf-8')
  const sourceHash = hashSource(source)
  const sourceMtime = statSync(modulePath).mtimeMs

  let cachedData: Buffer | undefined
  let hadValidCache = false

  const moduleBasename = basename(modulePath)

  // Try to load cached bytecode
  if (existsSync(metadataPath) && existsSync(bytecodePath)) {
    try {
      const metadata: CacheMetadata = JSON.parse(
        readFileSync(metadataPath, 'utf-8')
      )
      if (isCacheValid(metadata, sourceHash, sourceMtime)) {
        cachedData = readFileSync(bytecodePath)
        hadValidCache = true
        debug(
          'bytecode cache HIT for %s (%d KB)',
          moduleBasename,
          Math.round(cachedData.length / 1024)
        )
      } else {
        debug(
          'bytecode cache STALE for %s (version/hash mismatch)',
          moduleBasename
        )
      }
    } catch {
      debug('bytecode cache INVALID for %s (corrupted)', moduleBasename)
    }
  } else {
    debug('bytecode cache MISS for %s (no cache file)', moduleBasename)
  }

  // Wrap source in a function to capture exports
  const wrappedSource = `(function(exports, require, module, __filename, __dirname) {
${source}
});`

  // Create script with cached bytecode if available
  const script = new Script(wrappedSource, {
    filename: modulePath,
    cachedData,
  })

  // Check if V8 rejected the cached data despite metadata validation passing
  // This can happen due to corruption, platform incompatibility, or other
  // V8-internal reasons beyond version mismatches. If rejected, we need to
  // regenerate the cache to avoid infinite recompilation on every startup.
  if (script.cachedDataRejected) {
    hadValidCache = false
    debug(
      'bytecode cache REJECTED for %s (V8 validation failed)',
      moduleBasename
    )
  }

  // If no valid cache, schedule deferred save after JIT warmup
  // Only add to pending saves if this bytecode path is not already pending
  // This prevents duplicate saves for the same module within a process
  if (!hadValidCache && !pendingBytecodePaths.has(bytecodePath)) {
    pendingCacheSaves.push({
      script,
      bytecodePath,
      metadataPath,
      sourceHash,
      sourceMtime,
      cacheDir,
    })
    pendingBytecodePaths.add(bytecodePath)
    scheduleDeferredCacheSave()
  }

  // Execute the script
  const compiledWrapper = script.runInThisContext()

  // Create module-like object
  const moduleObj = { exports: {} }
  // Create a require function scoped to the module being loaded
  // This ensures relative requires resolve correctly relative to the module's location
  const moduleRequire = createRequire(modulePath)

  compiledWrapper(
    moduleObj.exports,
    moduleRequire,
    moduleObj,
    modulePath,
    dirname(modulePath)
  )

  return moduleObj.exports
}

/**
 * Check if bytecode caching is enabled
 */
export function isBytecodeCacheEnabled(): boolean {
  return process.env.NEXT_DISABLE_BYTECODE_CACHE !== '1'
}

/**
 * Clear the bytecode cache
 */
export function clearBytecodeCache(): void {
  const cacheDir = getCacheDir()
  if (existsSync(cacheDir)) {
    const { rmSync } = require('fs') as typeof import('fs')
    rmSync(cacheDir, { recursive: true, force: true })
  }
}
