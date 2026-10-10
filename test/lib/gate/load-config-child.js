// @ts-check

/**
 * Resolves a fixture's `next.config` and prints it as JSON.
 *
 * Run as a child process by `./load-resolved-config.ts`, with the fixture's cwd
 * and the fixture's exact spawn env. It has to be out of process for two
 * reasons:
 *
 *  1. `loadConfig` calls `loadEnvConfig`, which **mutates the caller's
 *     `process.env`** from the fixture's `.env*` files. Doing that inside a Jest
 *     worker would leak fixture env into every other test in the file.
 *  2. Resolution reads env vars from the *calling* process
 *     (`__NEXT_CACHE_COMPONENTS`, `__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS`, ...),
 *     and the fixture runs with an env that is not the Jest worker's whenever a
 *     suite passes `nextTestSetup({ env })`.
 *
 * Usage: node load-config-child.js <dir> <phase>
 */

const MARKER = '__NEXT_GATE_RESOLVED_CONFIG__'

/**
 * Deep-copies `value` into something `JSON.stringify` can handle: drops
 * functions and symbols, stringifies regexps, and replaces cycles with
 * `'[Circular]'`. Anything a `@gate` condition wants to read is plain data.
 *
 * @param {unknown} value
 * @param {WeakSet<object>} [seen]
 * @returns {unknown}
 */
function toJsonSafe(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'symbol') {
      return undefined
    }
    if (typeof value === 'bigint') return String(value)
    return value
  }
  if (value instanceof RegExp) return String(value)
  if (value instanceof Date) return value.toISOString()
  if (seen.has(value)) return '[Circular]'
  seen.add(value)
  if (Array.isArray(value)) {
    return value.map((item) => toJsonSafe(item, seen))
  }
  /** @type {Record<string, unknown>} */
  const result = {}
  for (const [key, item] of Object.entries(value)) {
    const converted = toJsonSafe(item, seen)
    if (converted !== undefined) result[key] = converted
  }
  return result
}

/**
 * Prefer the `next` the fixture itself installed, so the config is resolved by
 * the same code the fixture builds with.
 *
 * @param {string} dir
 */
function requireConfigLoader(dir) {
  try {
    return require(require.resolve('next/dist/server/config', { paths: [dir] }))
  } catch {
    return require('next/dist/server/config')
  }
}

async function main() {
  const [dir, phase] = process.argv.slice(2)
  if (!dir || !phase) {
    throw new Error('usage: load-config-child.js <dir> <phase>')
  }
  const loadConfig = requireConfigLoader(dir).default
  const config = await loadConfig(phase, dir, { silent: true })
  process.stdout.write(MARKER + JSON.stringify(toJsonSafe(config)))
}

// Guarded so the parent can `require` this file just to read `MARKER`.
if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

module.exports = { MARKER, toJsonSafe }
