//@ts-check

const path = require('path')
const _glob = require('glob')
const fs = require('fs')
const fsp = require('fs/promises')
const { createClient } = require('@vercel/kv')
const { promisify } = require('util')
const { Sema } = require('async-sema')
const { spawn, exec: execOrig } = require('child_process')
const treeKill = require('tree-kill')
const { createNextInstall } = require('./test/lib/create-next-install')
const { getBrowserLaunch } = require('./test/lib/browsers/launch')
const glob = promisify(_glob)
const exec = promisify(execOrig)
const core = require('@actions/core')
const { getTestFilter } = require('./test/get-test-filter')
const { buildTestReport } = require('./scripts/test-report')

// --- Test profile and result caching via actions cache ---
// On CI retry attempts, skip tests that already passed on this commit.
// The file contains null-byte delimited filenames

class TestProfile {
  // Env vars that always affect test behavior (non-NEXT prefixed).
  static EXTRA_ENV_VARS = [
    'IS_WEBPACK_TEST',
    'IS_TURBOPACK_TEST',
    'TURBOPACK_DEV',
    'TURBOPACK_BUILD',
    'BROWSER_NAME',
    'DEVICE_NAME',
  ]

  // NEXT_* / __NEXT* vars that are operational, not behavioral.
  static IGNORED_VARS = new Set([
    'NEXT_TELEMETRY_DISABLED',
    'NEXT_TEST_JOB',
    'NEXT_JUNIT_TEST_REPORT',
    'NEXT_TEST_PREFER_OFFLINE',
    'NEXT_CI_RUNNER',
    'NEXT_E2E_TEST_TIMEOUT',
    'NEXT_TURBOPACK_IO_CONCURRENCY',
    'NEXT_TEST_PASSED_FILE',
    'NEXT_TEST_BROWSER_WS_ENDPOINT',
    'TURBO_TASKS_AVAILABLE_PARALLELISM',
  ])

  // All key=value pairs identifying this test profile, sorted by key.
  // Used for the diagnostic `log()` output. Computed once at construction
  // from a snapshot of process.env. The actual cache key for the workflow
  // is `input_step_key` (see `.github/workflows/build_reusable.yml`).
  entries
  // NEXT_*/__NEXT* vars that matched the pattern but were ignored.
  ignoredVars
  cachingEnabled

  constructor({ group = '', type = '', testPattern = '' } = {}) {
    this.cachingEnabled = !!(
      process.env.CI &&
      process.env.GITHUB_SHA &&
      !process.env.NEXT_FLAKE_DETECTION &&
      !process.env.NEXT_TEST_SKIP_RESULT_CACHE
    )

    // Snapshot env at construction time so dynamic vars set during the run
    // (e.g. NEXT_TEST_STARTER, NEXT_TEST_PKG_PATHS) don't pollute the key.
    const env = { ...process.env }

    // Collect env vars that affect test behavior
    const vars = new Map()
    for (const v of TestProfile.EXTRA_ENV_VARS) {
      if (env[v]) vars.set(v, env[v])
    }
    const ignored = []
    for (const key of Object.keys(env)) {
      if (
        (key.startsWith('NEXT_') || key.startsWith('__NEXT')) &&
        !key.startsWith('NEXT_SKIP_')
      ) {
        if (TestProfile.IGNORED_VARS.has(key)) {
          ignored.push(key)
        } else {
          vars.set(key, env[key])
        }
      }
    }
    this.ignoredVars = ignored.sort()

    // Build the single sorted entries list used for hashing, logging, and descriptions.
    const branch =
      process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || ''
    const map = new Map([
      ['os', process.platform],
      ['branch', branch],
      ['sha', process.env.GITHUB_SHA || ''],
      ['node', process.versions.node.split('.')[0]],
    ])
    if (group) map.set('group', group)
    if (type) map.set('type', type)
    if (testPattern) map.set('testPattern', testPattern)
    for (const [k, v] of [...vars.entries()].sort((a, b) =>
      a[0].localeCompare(b[0])
    )) {
      map.set(k, v)
    }
    this.entries = [...map.entries()]
  }

  get description() {
    return this.entries
      .map(([k, v]) => (k === 'sha' ? `sha=${v?.slice(0, 10)}` : `${k}=${v}`))
      .join(' | ')
  }

  log() {
    console.log(`\nTest profile:`)
    for (const [k, v] of this.entries) {
      console.log(`  ${k}=${k === 'sha' ? v?.slice(0, 10) : v}`)
    }
    if (this.ignoredVars.length > 0) {
      console.log(`  Ignored: ${this.ignoredVars.join(', ')}`)
    }
    console.log(`  Caching: ${this.cachingEnabled ? 'enabled' : 'disabled'}`)
    console.log('')
  }

  // Read the passed-tests file (restored from cache by the workflow
  // before this script runs). Returns a Set of test filenames. Empty
  // Set on miss / parse error — best-effort by design.
  loadPassedTests() {
    if (!this.cachingEnabled) return new Set()
    const file = process.env.NEXT_TEST_PASSED_FILE
    if (!file) return new Set()
    try {
      const data = fs.readFileSync(file, 'utf8')
      // The file is created (in append mode) before any test runs, so it's
      // empty when no test passed (or none ran at all) in the earlier
      // attempt.
      if (data === '') {
        return new Set()
      }
      // Tolerate a partial trailing line from a hard kill mid-append by
      // requiring an explicit '\0' terminator. Lines without it are
      // dropped.
      const lines = data.split('\0')
      return new Set(data.endsWith('\0') ? lines : lines.slice(0, -1))
    } catch (err) {
      // ENOENT is the normal "no prior attempt" path — silent.
      if (err && err.code !== 'ENOENT') {
        console.log(`Test result cache: failed to load (${err.message})`)
      }
      return new Set()
    }
  }
}

// Hard timeout for a single attempt of a test file. Jest's own timeouts can't
// fire when a test blocks the event loop (or when teardown hangs), so without
// this a stuck suite runs until the CI job is killed and its buffered output
// is lost. The configured value is a floor: suites with a recorded duration
// get twice that duration if it is longer (see `getSuiteTimeoutMs`).
const DEFAULT_SUITE_TIMEOUT_MINUTES = 15
const SUITE_TIMEOUT_TIMING_FACTOR = 2
const MAX_TIMER_DELAY_MS = 2_147_483_647

/**
 * Resolves the per-attempt suite timeout floor. CLI flag takes precedence over
 * the env var. `0` disables the timeout; empty values fall back to the default
 * and invalid values warn and fall back to the default.
 *
 * @param {string | undefined} cliValue
 * @param {string | undefined} envValue
 * @returns {number} timeout in milliseconds, or 0 when disabled
 */
function resolveSuiteTimeoutMs(cliValue, envValue) {
  for (const [source, value] of [
    ['--suite-timeout', cliValue],
    ['NEXT_TEST_SUITE_TIMEOUT_MINUTES', envValue],
  ]) {
    if (value === undefined || value.trim() === '') continue
    const minutes = Number(value)
    const timeoutMs = minutes * 60 * 1000
    if (
      !Number.isFinite(minutes) ||
      minutes < 0 ||
      timeoutMs > MAX_TIMER_DELAY_MS
    ) {
      console.warn(
        `Invalid ${source} value ${JSON.stringify(value)}, using default of ${DEFAULT_SUITE_TIMEOUT_MINUTES} minutes`
      )
      break
    }
    return timeoutMs
  }
  return DEFAULT_SUITE_TIMEOUT_MINUTES * 60 * 1000
}

/**
 * The effective timeout for one attempt of a test file:
 * max(floor, 2 × its recorded duration), clamped to the maximum timer delay.
 * A floor of `0` disables the timeout regardless of timings.
 *
 * @param {number} floorMs from `resolveSuiteTimeoutMs`
 * @param {number | undefined} recordedSeconds from `resolveTiming`
 * @returns {number} timeout in milliseconds, or 0 when disabled
 */
function getSuiteTimeoutMs(floorMs, recordedSeconds) {
  if (floorMs <= 0) return 0
  const fromTiming =
    typeof recordedSeconds === 'number' &&
    Number.isFinite(recordedSeconds) &&
    recordedSeconds > 0
      ? recordedSeconds * 1000 * SUITE_TIMEOUT_TIMING_FACTOR
      : 0
  return Math.min(Math.max(floorMs, fromTiming), MAX_TIMER_DELAY_MS)
}

/** @param {number} ms */
function formatTimeout(ms) {
  if (ms < 60_000) return `${Math.round(ms / 100) / 10}s`
  const minutes = Math.round((ms / 60_000) * 10) / 10
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
}

// Do not rename or format. sync-react script relies on this line.
// prettier-ignore
const nextjsReactPeerVersion = "19.3.0";

let argv = require('yargs/yargs')(process.argv.slice(2))
  .string('type')
  .string('test-pattern')
  .boolean('timings')
  .boolean('write-timings')
  .number('retries')
  .string('suite-timeout')
  .describe(
    'suite-timeout',
    `Hard timeout floor in minutes for each attempt of a test file (default ${DEFAULT_SUITE_TIMEOUT_MINUTES}, 0 disables). Suites with recorded timings (--timings) get ${SUITE_TIMEOUT_TIMING_FACTOR}x their recorded duration if longer. Also configurable via NEXT_TEST_SUITE_TIMEOUT_MINUTES`
  )
  .boolean('debug')
  .string('g')
  .alias('g', 'group')
  .number('c')
  .boolean('dry')
  .boolean('print-tests')
  .describe('print-tests', 'Prints the test files that will be run')
  .boolean('require-timings')
  .describe(
    'require-timings',
    'Require test-timings.json from disk; fail if missing instead of falling back to KV or round-robin'
  )
  .boolean('local')
  .alias('c', 'concurrency').argv

function escapeRegexp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * @typedef {{ file: string, excludedCases: string[] }} TestFile
 */

const GROUP = process.env.CI ? '##[group]' : ''
const ENDGROUP = process.env.CI ? '##[endgroup]' : ''

const externalTestsFilter = getTestFilter()

const timings = []
const DEFAULT_NUM_RETRIES = 2
const DEFAULT_CONCURRENCY = 2
const RESULTS_EXT = `.results.json`
const isTestJob = !!process.env.NEXT_TEST_JOB
// Legacy flat `{ [file]: seconds }` map shared by every CI variant. Still read
// as a fallback, but no longer written: CI runs on older versions of this
// script keep reading and writing it.
const KV_TIMINGS_KEY = 'test-timings'

const kvClient =
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
    ? createClient({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
      })
    : null

/**
 * Retry a KV operation with exponential backoff
 * @param {() => Promise<any>} operation - The async operation to retry
 * @param {string} operationName - Name of the operation for logging
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @returns {Promise<any>} The result of the operation
 */
async function retryKVOperation(operation, operationName, maxRetries = 3) {
  let lastError
  let retries = maxRetries

  while (retries > 0) {
    try {
      return await operation()
    } catch (err) {
      lastError = err
      retries--
      if (retries > 0) {
        const delay = (maxRetries - retries + 1) * 5 // 5s, 10s, 15s backoff
        console.log(
          `KV ${operationName} failed, retrying in ${delay}s. Error:`,
          err.message
        )
        await new Promise((resolve) => setTimeout(resolve, delay * 1000))
      }
    }
  }

  throw new Error(
    `Failed to ${operationName} after ${maxRetries} retries: ${lastError?.message}`
  )
}

// --- Per-variant test timings ---
// The same test file can take seconds in one CI variant and minutes in
// another (e.g. dev vs. turbopack production), so timings are recorded per
// variant. Each variant is its own Redis hash (`test-timings-v2:<variant>`,
// field = test file, value = `<seconds>@<last write, epoch ms>`), so
// parallel shards update individual fields atomically instead of overwriting
// each other's read-modify-write. Values without an `@<epoch ms>` suffix
// (plain seconds) are still read; they just have no last-write time yet.
// `test-timings-v2:variants` lists the variants that have been recorded.
//
// Entries are kept for TIMINGS_TTL_SECONDS after their last write, because
// branches whose checkout differs from the writer's (older or newer) may
// still rely on them:
// - A file missing from the writer's checkout is only deleted once its last
//   write is longer ago than the TTL.
// - Each variant hash gets the TTL as a Redis expiry, refreshed on every
//   write, so a variant no CI job writes any more expires on its own; the
//   fetch prunes it from the index afterwards.
const KV_TIMINGS_V2_PREFIX = 'test-timings-v2:'
const KV_TIMINGS_V2_VARIANTS_KEY = `${KV_TIMINGS_V2_PREFIX}variants`
const TIMINGS_TTL_SECONDS = 30 * 24 * 60 * 60

// Atomically handles stale-timing candidates (files missing from the
// writer's checkout), re-reading each value on the server so that an entry
// refreshed by a concurrent writer is never deleted:
// - field gone in the meantime: nothing to do
// - no (valid) last-write time: append `@now` to start the TTL clock
// - last written before the cutoff: delete the field
// Also gives the hash the TTL if it has none yet.
// KEYS: timings hash. ARGV: now (ms), cutoff (ms), TTL (s), files...
// Returns the deleted files.
const CLEANUP_STALE_TIMINGS_SCRIPT = `
local deleted = {}
local cutoff = tonumber(ARGV[2])
for i = 4, #ARGV do
  local file = ARGV[i]
  local value = redis.call('HGET', KEYS[1], file)
  if value then
    local seconds, updated = string.match(value, '^([^@]*)@(.*)$')
    updated = tonumber(updated)
    if not updated then
      redis.call('HSET', KEYS[1], file, (seconds or value) .. '@' .. ARGV[1])
    elseif updated < cutoff then
      redis.call('HDEL', KEYS[1], file)
      deleted[#deleted + 1] = file
    end
  end
end
if redis.call('TTL', KEYS[1]) == -1 then
  redis.call('EXPIRE', KEYS[1], ARGV[3])
end
return deleted
`

// Maintains the whole variant index in one round trip. For each indexed
// variant, atomically: if its timings hash no longer exists (expired), the
// variant is removed from the index (a variant created concurrently can't be
// removed, since the writer's MULTI and this script are each atomic);
// otherwise the hash gets the TTL if it has none yet (keys written before
// TTLs existed), without extending an existing one, so reading never keeps a
// variant alive. The per-variant keys are derived from ARGV[1] at runtime,
// because the variant list is read inside the script; this requires a KV
// scripting backend that permits those derived-key accesses.
// KEYS: index set. ARGV: timings key prefix, TTL (s).
// Returns the number of variants removed.
const MAINTAIN_VARIANTS_SCRIPT = `
local removed = 0
for _, variant in ipairs(redis.call('SMEMBERS', KEYS[1])) do
  local key = ARGV[1] .. variant
  if redis.call('EXISTS', key) == 0 then
    removed = removed + redis.call('SREM', KEYS[1], variant)
  elseif redis.call('TTL', key) == -1 then
    redis.call('EXPIRE', key, ARGV[2])
  end
end
return removed
`

/**
 * Identifies the CI variant a run's timings belong to, from the env vars that
 * distinguish the CI jobs using `--timings` (see `build_and_test.yml` and
 * `test_e2e_deploy_release.yml`): mode, bundler, cache components, React
 * version and adapter. Flags set identically on every timing job (e.g. strict
 * route types) are deliberately not part of the key.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string} e.g. `start|turbopack|cache-components`
 */
function getTimingsVariant(env) {
  const mode = env.NEXT_TEST_MODE || 'none'
  const bundler =
    env.NEXT_TEST_USE_RSPACK === '1' || env.NEXT_RSPACK === '1'
      ? 'rspack'
      : env.IS_TURBOPACK_TEST
        ? 'turbopack'
        : 'webpack'
  const parts = [mode, bundler]
  if (env.__NEXT_CACHE_COMPONENTS === 'true') parts.push('cache-components')
  const reactVersion = env.NEXT_TEST_REACT_VERSION?.trim()
  if (reactVersion) parts.push(`react-${reactVersion}`)
  if (env.NEXT_ENABLE_ADAPTER === '1') parts.push('adapter')
  return parts.join('|')
}

/** @param {unknown} value */
function isValidTiming(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/**
 * The longest recorded duration of each test file across all variants. Used
 * as a conservative fallback for variants that haven't recorded a file yet.
 *
 * @param {Record<string, Record<string, unknown>>} variants
 * @returns {Record<string, number>}
 */
function computeMaxTimings(variants) {
  /** @type {Record<string, number>} */
  const max = {}
  for (const variantTimings of Object.values(variants)) {
    for (const [file, seconds] of Object.entries(variantTimings)) {
      if (isValidTiming(seconds)) {
        max[file] = Math.max(max[file] ?? 0, /** @type {number} */ (seconds))
      }
    }
  }
  return max
}

/**
 * @typedef {{
 *   variants: Record<string, Record<string, unknown>>,
 *   max: Record<string, unknown>,
 *   legacy: Record<string, unknown>,
 * }} TestTimings
 */

/**
 * Normalizes loaded timings data. Accepts the versioned format written by
 * `fetchTestTimings`, as well as a legacy flat `{ [file]: seconds }` map (or
 * the `{}` the workflow writes when no timings could be fetched). The
 * cross-variant `max` is always derived from `variants`, never stored.
 *
 * @param {unknown} data
 * @returns {TestTimings | null}
 */
function normalizeTimings(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null
  }
  const record = /** @type {Record<string, any>} */ (data)
  if (record.version !== 2) {
    return { variants: {}, max: {}, legacy: record }
  }
  /** @type {TestTimings['variants']} */
  const variants = {}
  for (const [variant, variantTimings] of Object.entries(
    record.variants || {}
  )) {
    if (variantTimings && typeof variantTimings === 'object') {
      variants[variant] = variantTimings
    }
  }
  return {
    variants,
    max: computeMaxTimings(variants),
    legacy:
      record.legacy && typeof record.legacy === 'object' ? record.legacy : {},
  }
}

/**
 * Resolves the recorded duration of a test file for the given variant: the
 * variant's own timing, else the maximum across all variants, else the legacy
 * shared timing (only relevant until any variant has recorded the file).
 *
 * @param {TestTimings | null} testTimings
 * @param {string} variant
 * @param {string} file
 * @returns {{ seconds: number, source: 'variant' | 'max' | 'legacy' } | undefined}
 */
function resolveTiming(testTimings, variant, file) {
  if (!testTimings) return undefined
  const fromVariant = testTimings.variants[variant]?.[file]
  if (isValidTiming(fromVariant)) {
    return { seconds: /** @type {number} */ (fromVariant), source: 'variant' }
  }
  const fromMax = testTimings.max[file]
  if (isValidTiming(fromMax)) {
    return { seconds: /** @type {number} */ (fromMax), source: 'max' }
  }
  const fromLegacy = testTimings.legacy[file]
  if (isValidTiming(fromLegacy)) {
    return { seconds: /** @type {number} */ (fromLegacy), source: 'legacy' }
  }
  return undefined
}

/**
 * @param {Record<string, unknown> | null | undefined} hash
 * @returns {Record<string, number>}
 */
function toTimingsMap(hash) {
  /** @type {Record<string, number>} */
  const result = {}
  for (const [file, value] of Object.entries(hash || {})) {
    // Redis returns hash values as numbers or strings; strings may carry an
    // `@<epoch ms>` last-write suffix, which is not part of the timing.
    const seconds =
      typeof value === 'string' ? Number(value.split('@')[0]) : value
    if (isValidTiming(seconds)) result[file] = /** @type {number} */ (seconds)
  }
  return result
}

/**
 * Fetches the timings of every variant, plus the legacy shared map as a
 * fallback, in the versioned format consumed by `normalizeTimings`.
 * Returns `null` when no timings are available at all. Also prunes expired
 * variants from the index (see MAINTAIN_VARIANTS_SCRIPT).
 *
 * @param {any} client KV client
 * @param {typeof retryKVOperation} retry
 */
async function fetchTestTimings(client, retry) {
  if (!client) {
    console.warn('KV client not configured, skipping timing fetch')
    return null
  }

  /** @type {Record<string, Record<string, number>>} */
  let variants = {}
  try {
    variants = await retry(async () => {
      /** @type {string[]} */
      const names = (await client.smembers(KV_TIMINGS_V2_VARIANTS_KEY)) || []
      /** @type {Record<string, Record<string, number>>} */
      const result = {}
      for (const name of names) {
        const variantTimings = toTimingsMap(
          await client.hgetall(`${KV_TIMINGS_V2_PREFIX}${name}`)
        )
        if (Object.keys(variantTimings).length > 0) {
          result[name] = variantTimings
        }
      }
      return result
    }, 'fetch variant timings')
  } catch (err) {
    console.log('Failed to fetch variant timings:', err.message)
  }

  try {
    const removed = await client.eval(
      MAINTAIN_VARIANTS_SCRIPT,
      [KV_TIMINGS_V2_VARIANTS_KEY],
      [KV_TIMINGS_V2_PREFIX, String(TIMINGS_TTL_SECONDS)]
    )
    if (removed > 0) {
      console.log(`Removed ${removed} expired variant(s) from the index`)
    }
  } catch (err) {
    console.log('Failed to maintain variant timings:', err.message)
  }

  /** @type {Record<string, number>} */
  let legacy = {}
  try {
    legacy = toTimingsMap(
      await retry(() => client.get(KV_TIMINGS_KEY), 'fetch legacy timings')
    )
  } catch (err) {
    console.log('Failed to fetch legacy timings:', err.message)
  }

  if (Object.keys(variants).length === 0 && Object.keys(legacy).length === 0) {
    console.log('No timing data found in KV store')
    return null
  }
  return { version: 2, variants, legacy }
}

/**
 * Records this run's timings for its variant. Only touches the variant's own
 * keys and the variant index; other variants and the legacy key are left as
 * they are.
 *
 * @param {any} client KV client
 * @param {typeof retryKVOperation} retry
 * @param {string} variant
 * @param {Record<string, number>} curTimings seconds per test file
 * @param {(file: string) => boolean} fileExists
 * @param {number} [now] epoch ms
 */
async function writeTestTimings(
  client,
  retry,
  variant,
  curTimings,
  fileExists,
  now = Date.now()
) {
  const key = `${KV_TIMINGS_V2_PREFIX}${variant}`
  const files = Object.keys(curTimings)
  if (files.length > 0) {
    const values = Object.fromEntries(
      files.map((file) => [file, `${curTimings[file]}@${now}`])
    )
    await retry(
      () =>
        client
          .multi()
          .hset(key, values)
          .sadd(KV_TIMINGS_V2_VARIANTS_KEY, variant)
          .expire(key, TIMINGS_TTL_SECONDS)
          .exec(),
      'update timings'
    )
    console.log(`Successfully updated test timings for variant ${variant}`)
  }

  // Timings of files missing from this checkout are only deleted once no
  // branch has written them for TIMINGS_TTL_SECONDS (within this variant)
  const recorded =
    (await retry(() => client.hgetall(key), 'read timings')) || {}
  const candidates = Object.keys(recorded).filter((file) => !fileExists(file))
  if (candidates.length > 0) {
    /** @type {string[] | null} */
    const deleted = await retry(
      () =>
        client.eval(
          CLEANUP_STALE_TIMINGS_SCRIPT,
          [key],
          [
            String(now),
            String(now - TIMINGS_TTL_SECONDS * 1000),
            String(TIMINGS_TTL_SECONDS),
            ...candidates,
          ]
        ),
      'clean up stale timings'
    )
    for (const file of deleted || []) {
      console.log('removing stale timing', file)
    }
  }
}

const testFilters = {
  development: new RegExp('^(test/(development|e2e))'),
  production: new RegExp('^(test/(production|e2e))'),
  unit: new RegExp('^(test/unit|packages/.*/src|packages/next-codemod)'),
  e2e: 'test/e2e/',
}

const mockTrace = () => ({
  traceAsyncFn: (fn) => fn(mockTrace()),
  traceFn: (fn) => fn(mockTrace()),
  traceChild: () => mockTrace(),
})

// which types we have configured to run separate
// `examples/` additionally excludes test files inside example apps, which run
// with each example's own jest/vitest setup instead of this runner.
const configuredTestTypes = [...Object.values(testFilters), 'examples/']
/** @type {Map<string, { output: string, failedCases: string[] }>} */
const errorsPerTests = new Map()

// GitHub drops the whole job summary of a step if it exceeds 1MiB:
// https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#adding-a-job-summary
const MAX_SUMMARY_BYTES = 1024 * 1024
const SUMMARY_TRUNCATION_NOTICE =
  '\n\n... truncated to fit the job summary size limit ...'

// Strip terminal color/control codes before writing output to the job
// summary. Mirrors `scripts/pr-ci-comment.mjs`.
const ANSI_RE =
  // eslint-disable-next-line no-control-regex
  /(?:\u001B\][\s\S]*?(?:\u0007|\u001B\\|\u009C))|(?:[\u001B\u009B][[\]()#;?]*(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~])/g

// The head commit of this CI run. `GITHUB_SHA` is the merge commit for
// pull requests, but Datadog test runs and the PR test report comment use
// the PR head commit, so prefer that when available.
function getHeadSha() {
  if (process.env.GITHUB_EVENT_PATH) {
    try {
      const event = JSON.parse(
        fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')
      )
      const headSha = event.pull_request?.head?.sha
      if (headSha) {
        return headSha
      }
    } catch (err) {
      console.log('Failed to read the head SHA from the event payload', err)
    }
  }
  return process.env.GITHUB_SHA ?? null
}

// Write a job summary using the same printer as the PR test report comment
// (`scripts/pr-ci-comment.mjs`), so a truncated comment can refer to the job
// summary for the full report.
async function maybeLogSummary() {
  if (process.env.CI && errorsPerTests.size > 0) {
    const sha = getHeadSha()
    const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? '').split('/')

    const suites = [...errorsPerTests.keys()].sort().map((test) => {
      const { output, failedCases } = errorsPerTests.get(test)
      return {
        testPath: test,
        mode: process.env.NEXT_TEST_MODE,
        isTurbopack: !!process.env.IS_TURBOPACK_TEST,
        isRspack: process.env.NEXT_RSPACK === '1',
        isExperimental: process.env.__NEXT_CACHE_COMPONENTS === 'true',
        isPPR: process.env.__NEXT_EXPERIMENTAL_PPR === 'true',
        failedCases,
        resultMessage: ['```', output.replace(ANSI_RE, ''), '```'].join('\n'),
      }
    })

    let summary = buildTestReport({
      owner,
      repo,
      sha,
      suites,
    })

    if (Buffer.byteLength(summary, 'utf8') > MAX_SUMMARY_BYTES) {
      const truncated = Buffer.from(summary, 'utf8')
        .subarray(
          0,
          MAX_SUMMARY_BYTES - Buffer.byteLength(SUMMARY_TRUNCATION_NOTICE)
        )
        .toString('utf8')
        // A multi-byte character cut at the boundary decodes to U+FFFD.
        .replace(/�$/, '')
      summary = truncated + SUMMARY_TRUNCATION_NOTICE
    }

    await core.summary.addRaw(summary).write()
  }
}

let exiting = false

/**
 * Browser server shared across all test suites. Suites connect to it via
 * `test/lib/browsers/playwright.ts` instead of each launching their own
 * browser process.
 * @type {import('playwright').BrowserServer | undefined}
 */
let sharedBrowserServer

const cleanUpAndExit = async (code) => {
  if (exiting) {
    return
  }
  exiting = true
  console.log(`exiting with code ${code}`)

  if (sharedBrowserServer) {
    await sharedBrowserServer.close().catch((err) => {
      console.error('Failed to close shared browser server:', err)
    })
  }
  if (process.env.NEXT_TEST_STARTER) {
    await fsp.rm(process.env.NEXT_TEST_STARTER, {
      recursive: true,
      force: true,
    })
  }
  if (process.env.CI) {
    await maybeLogSummary()
  }
  process.exit(code)
}

const isMatchingPattern = (pattern, file) => {
  if (pattern instanceof RegExp) {
    return pattern.test(file)
  } else {
    return file.startsWith(pattern)
  }
}

async function main() {
  // Ensure we have the arguments awaited from yargs.
  argv = await argv

  // `.github/workflows/build_reusable.yml` sets this, we should use it unless
  // it's overridden by an explicit `--concurrency` argument.
  const envConcurrency =
    process.env.TEST_CONCURRENCY && parseInt(process.env.TEST_CONCURRENCY, 10)

  const options = {
    concurrency: argv.concurrency ?? envConcurrency ?? DEFAULT_CONCURRENCY,
    debug: argv.debug ?? core.isDebug(),
    timings: argv.timings ?? false,
    writeTimings: argv.writeTimings ?? false,
    group: argv.group ?? false,
    testPattern: argv.testPattern ?? false,
    type: argv.type ?? false,
    retries: argv.retries ?? DEFAULT_NUM_RETRIES,
    requireTimings: argv.requireTimings ?? false,
    dry: argv.dry ?? false,
    local: argv.local ?? false,
    printTests: argv.printTests ?? false,
    suiteTimeoutMs: resolveSuiteTimeoutMs(
      /** @type {string | undefined} */ (argv.suiteTimeout),
      process.env.NEXT_TEST_SUITE_TIMEOUT_MINUTES
    ),
  }
  let numRetries = options.retries
  const hideOutput = !options.debug && !options.dry

  let filterTestsBy

  switch (options.type) {
    case 'unit': {
      numRetries = 0
      filterTestsBy = testFilters.unit
      break
    }
    case 'all': {
      filterTestsBy = 'none'
      break
    }
    default: {
      filterTestsBy = testFilters[options.type]
      break
    }
  }

  console.log(
    'Running tests with concurrency:',
    options.concurrency,
    'in test mode',
    process.env.NEXT_TEST_MODE
  )

  const profile = new TestProfile({
    group: String(options.group || ''),
    type: String(options.type || ''),
    testPattern: String(options.testPattern || ''),
  })
  profile.log()

  // Only fetch/update shared timing data during grouped CI runs to avoid
  // individual test runs from polluting the timing data
  const shouldUseSharedTimings = options.timings && options.group

  /** @type TestFile[] */
  let tests = argv._.filter((arg) =>
    arg.toString().match(/\.test\.(js|ts|tsx)/)
  ).map((file) => ({ file: file.toString(), excludedCases: [] }))
  let prevTimings

  if (tests.length === 0) {
    /** @type {RegExp | undefined} */
    let testPatternRegex

    if (options.testPattern && typeof options.testPattern === 'string') {
      testPatternRegex = new RegExp(options.testPattern)
    }

    tests = (
      await glob('**/*.test.{js,ts,tsx}', {
        nodir: true,
        cwd: __dirname,
        ignore: '**/node_modules/**',
      })
    )
      .filter((file) => {
        if (testPatternRegex) {
          return testPatternRegex.test(file)
        }
        if (filterTestsBy) {
          // only include the specified type
          if (filterTestsBy === 'none') {
            return true
          }
          return isMatchingPattern(filterTestsBy, file)
        }
        // include all except the separately configured types
        return !configuredTestTypes.some((type) =>
          isMatchingPattern(type, file)
        )
      })
      .map((file) => ({
        file,
        excludedCases: [],
      }))

    //
  }

  if (shouldUseSharedTimings) {
    console.log('Fetching previous timings data')
    const timingsFile = path.join(process.cwd(), 'test-timings.json')

    try {
      prevTimings = JSON.parse(await fsp.readFile(timingsFile, 'utf8'))
      console.log('Loaded test timings from disk successfully')
    } catch (_) {
      if (options.requireTimings) {
        console.error(
          'ERROR: --require-timings is set but test-timings.json could not be loaded from disk:',
          _
        )
        await cleanUpAndExit(1)
        return
      }
      console.error(
        'Failed to load test timings from disk. Proceeding to fetch from KV store. Original error: ',
        _
      )
    }

    if (!prevTimings && !options.requireTimings) {
      try {
        prevTimings = await fetchTestTimings(kvClient, retryKVOperation)
        if (prevTimings) {
          console.log('Fetched previous timings data successfully from KV')
        } else {
          console.log('No previous timings data available')
        }
      } catch (kvError) {
        console.warn(
          'Failed to fetch timings from KV, continuing without timing data:',
          kvError.message
        )
        prevTimings = null
      }

      if (options.writeTimings) {
        if (prevTimings) {
          await fsp.writeFile(timingsFile, JSON.stringify(prevTimings))
          console.log('Wrote previous timings data to', timingsFile)
        } else {
          console.log('No timings data to write')
        }
        await cleanUpAndExit(0)
      }
    }
  }

  // If there are external manifest contains list of tests, apply it to the test lists.
  if (externalTestsFilter) {
    tests = externalTestsFilter(tests)
  }

  const timingsVariant = getTimingsVariant(process.env)
  const testTimings = normalizeTimings(prevTimings)

  let testSet = new Set()
  tests = tests
    .map((test) => {
      test.file = test.file.replace(/\\/g, '/').replace(/\/test$/, '')
      return test
    })
    .filter((test) => {
      if (testSet.has(test.file)) return false
      testSet.add(test.file)
      return true
    })

  if (options.group && typeof options.group === 'string') {
    const groupParts = options.group.split('/')
    const groupPos = parseInt(groupParts[0], 10)
    const groupTotal = parseInt(groupParts[1], 10)

    if (testTimings) {
      /** @type {TestFile[][]} */
      const groups = [[]]
      const groupTimes = [0]
      /** @type {Record<'variant' | 'max' | 'legacy' | 'none', number>} */
      const timingSources = { variant: 0, max: 0, legacy: 0, none: 0 }

      for (const test of tests) {
        let smallestGroup = groupTimes[0]
        let smallestGroupIdx = 0

        // get the smallest group time to add current one to
        for (let i = 1; i < groupTotal; i++) {
          if (!groups[i]) {
            groups[i] = []
            groupTimes[i] = 0
          }

          const time = groupTimes[i]
          if (time < smallestGroup) {
            smallestGroup = time
            smallestGroupIdx = i
          }
        }
        groups[smallestGroupIdx].push(test)
        const timing = resolveTiming(testTimings, timingsVariant, test.file)
        timingSources[timing?.source ?? 'none']++
        groupTimes[smallestGroupIdx] += timing?.seconds || 1
      }

      console.log(
        `Test timings for variant ${timingsVariant}: ${timingSources.variant} from variant, ${timingSources.max} from max across variants, ${timingSources.legacy} from legacy, ${timingSources.none} without timing`
      )

      const curGroupIdx = groupPos - 1
      tests = groups[curGroupIdx]

      console.log(
        'Current group previous accumulated times:',
        Math.round(groupTimes[curGroupIdx]) + 's'
      )
    } else {
      if (options.requireTimings) {
        console.error(
          'ERROR: --require-timings is set but no timing data is available for sharding. ' +
            'Ensure test-timings.json is provided.'
        )
        await cleanUpAndExit(1)
        return
      }

      // assign every nth test "round-robin" to the group, so that similar slow
      // tests tend not to get clustered together
      tests = tests.filter((_value, idx) => idx % groupTotal === groupPos - 1)
      console.log('Splitting without timings')

      // Warn in CI that tests are not optimally distributed
      if (process.env.GITHUB_ACTIONS) {
        core.warning(
          `Test timing data unavailable for group ${options.group}. Tests are being distributed round-robin, which may increase CI time. ` +
            `Consider checking KV store connectivity if this persists.`
        )
      }
    }
  }

  if (!tests) {
    tests = []
  }

  if (tests.length === 0) {
    console.log('No tests found for', options.type, 'exiting..')
  }

  console.log(`${GROUP}Running tests:
${tests.map((t) => t.file).join('\n')}
${ENDGROUP}`)
  console.log(`total: ${tests.length}`)

  if (options.printTests) {
    await cleanUpAndExit(0)
  }

  if (
    !options.dry &&
    process.env.NEXT_TEST_MODE !== 'deploy' &&
    ((options.type && options.type !== 'unit') ||
      tests.some((test) => !testFilters.unit.test(test.file)))
  ) {
    // For isolated next tests (e2e, dev, prod) we create a starter Next.js
    // install to re-use to speed up tests to avoid having to run `pnpm install`
    // each time.
    console.log(`${GROUP}Creating shared Next.js install`)
    const reactVersion =
      process.env.NEXT_TEST_REACT_VERSION || nextjsReactPeerVersion
    const { installDir, pkgPaths } = await createNextInstall({
      parentSpan: mockTrace(),
      dependencies: {
        react: reactVersion,
        'react-dom': reactVersion,
      },
    })

    const serializedPkgPaths = []

    for (const key of pkgPaths.keys()) {
      serializedPkgPaths.push([key, pkgPaths.get(key)])
    }
    process.env.NEXT_TEST_PKG_PATHS = JSON.stringify(serializedPkgPaths)
    process.env.NEXT_TEST_STARTER = installDir
    console.log(`${ENDGROUP}`)
  }

  // best-effort, don't spawn a browser for unit tests, if we don't spawn a
  // browser but should've, that's okay, `next-webdriver` will still set it up
  if (
    !options.dry &&
    ((options.type && options.type !== 'unit') ||
      tests.some((test) => !testFilters.unit.test(test.file)))
  ) {
    // Launch a single browser server shared by all test suites, instead of
    // each suite launching its own browser process. Suites connect to it via
    // the ws endpoint env var in `test/lib/browsers/playwright.ts`.
    const { browserType, launchOptions } = getBrowserLaunch(
      process.env.BROWSER_NAME || 'chrome',
      { headless: true } // matches per-test env below
    )
    sharedBrowserServer = await browserType.launchServer(launchOptions)
    process.env.NEXT_TEST_BROWSER_WS_ENDPOINT = sharedBrowserServer.wsEndpoint()
  }

  const sema = new Sema(options.concurrency, { capacity: tests.length })
  const outputSema = new Sema(1, { capacity: tests.length })
  const children = new Set()
  const jestPath = path.join(
    __dirname,
    'node_modules',
    '.bin',
    `jest${process.platform === 'win32' ? '.CMD' : ''}`
  )
  let firstError = true
  let hadFailures = false

  const runTestOnce = (/** @type {TestFile} */ test, isFinalRun, isRetry) =>
    new Promise((resolve, reject) => {
      const start = new Date().getTime()
      let outputChunks = []

      const args = [
        ...(process.env.CI ? ['--ci'] : []),
        '--runInBand',
        '--forceExit',
        '--no-cache',
        '--verbose',
        ...(isTestJob
          ? ['--json', `--outputFile=${test.file}${RESULTS_EXT}`]
          : []),
        test.file,
        ...(test.excludedCases.length === 0
          ? []
          : [
              '--testNamePattern',
              `^(?!(?:${test.excludedCases.map(escapeRegexp).join('|')})$).`,
            ]),
      ]
      const deferNextTestWasm = !!process.env.NEXT_TEST_WASM
      const env = {
        // run tests in headless mode by default
        HEADLESS: 'true',
        NEXT_TELEMETRY_DISABLED: '1',
        // unset CI env so CI behavior is only explicitly
        // tested when enabled
        CI: '',
        // But some tests need to fork based on machine? CI? behavior differences
        // Only use this in tests.
        // For implementation forks, use `process.env.CI` instead
        NEXT_TEST_CI: process.env.CI,

        ...(options.local
          ? {}
          : {
              IS_RETRY: isRetry ? 'true' : undefined,
              TRACE_PLAYWRIGHT: 'true',
              CIRCLECI: '',
              GITHUB_ACTIONS: '',
              CONTINUOUS_INTEGRATION: '',
              RUN_ID: '',
              BUILD_NUMBER: '',
              // Format the output of junit report to include the test name
              // For the debugging purpose to compare actual run list to the generated reports
              // [NOTE]: This won't affect if junit reporter is not enabled
              JEST_JUNIT_OUTPUT_NAME: test.file.replaceAll('/', '_'),
              // Specify suite name for the test to avoid unexpected merging across different env / grouped tests
              // This is not individual suites name (corresponding 'describe'), top level suite name which have redundant names by default
              // [NOTE]: This won't affect if junit reporter is not enabled
              JEST_SUITE_NAME: [
                `${process.env.NEXT_TEST_MODE ?? 'default'}`,
                options.group,
                options.type,
                test.file,
              ]
                .filter(Boolean)
                .join(':'),
            }),
        ...(deferNextTestWasm
          ? {
              // Let Next/Jest initialize native SWC for the transformer first.
              NEXT_TEST_WASM: undefined,
              NEXT_TEST_WASM_AFTER_JEST: process.env.NEXT_TEST_WASM,
            }
          : {}),
        ...(isFinalRun
          ? {
              // Events can be finicky in CI. This switches to a more
              // reliable polling method.
              // CHOKIDAR_USEPOLLING: 'true',
              // CHOKIDAR_INTERVAL: 500,
              // WATCHPACK_POLLING: 500,
            }
          : {}),
      }

      const handleOutput = (type) => (chunk) => {
        if (hideOutput) {
          outputChunks.push({ type, chunk })
        } else {
          process.stdout.write(chunk)
        }
      }
      const stdout = handleOutput('stdout')
      stdout(
        [
          ...Object.entries(env).map((e) => `${e[0]}=${e[1]}`),
          jestPath,
          ...args.map((a) => `'${a}'`),
        ].join(' ') + '\n'
      )

      // Don't execute tests when in dry run mode
      if (options.dry) {
        return resolve(new Date().getTime() - start)
      }

      const child = spawn(jestPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...env,
        },
        // See: https://nodejs.org/en/blog/vulnerability/april-2024-security-releases-2
        shell: process.platform === 'win32',
      })
      child.stdout.on('data', stdout)
      child.stderr.on('data', handleOutput('stderr'))

      children.add(child)

      let timedOut = false
      let settled = false
      /** @type {Promise<void>} */
      let killDone = Promise.resolve()
      const printFailureOutput = async () => {
        if (!hideOutput) return
        await outputSema.acquire()
        const isExpanded = firstError
        if (isExpanded) {
          firstError = false
          process.stdout.write(`❌ ${test.file} output:\n`)
        } else {
          process.stdout.write(`${GROUP}❌ ${test.file} output\n`)
        }

        let output = ''
        // limit out to last 64kb so that we don't
        // run out of log room in CI
        for (const { chunk } of outputChunks) {
          process.stdout.write(chunk)
          output += chunk.toString()
        }

        if (process.env.CI) {
          errorsPerTests.set(test.file, { output, failedCases: [] })
        }

        if (isExpanded) {
          process.stdout.write(`end of ${test.file} output\n`)
        } else {
          process.stdout.write(`end of ${test.file} output\n${ENDGROUP}\n`)
        }
        outputSema.release()
      }
      /** @param {Error} err */
      const failAttempt = async (err) => {
        if (settled) return
        settled = true
        clearTimeout(suiteTimeout)
        children.delete(child)
        await printFailureOutput()
        // @ts-expect-error
        err.output = outputChunks.map(({ chunk }) => chunk.toString()).join('')
        reject(err)
      }
      child.once('error', failAttempt)
      const recordedTiming = resolveTiming(
        testTimings,
        timingsVariant,
        test.file
      )
      const suiteTimeoutMs = getSuiteTimeoutMs(
        options.suiteTimeoutMs,
        recordedTiming?.seconds
      )
      const suiteTimeout =
        suiteTimeoutMs > 0
          ? setTimeout(() => {
              timedOut = true
              const basis =
                suiteTimeoutMs > options.suiteTimeoutMs && recordedTiming
                  ? ` (${SUITE_TIMEOUT_TIMING_FACTOR}x recorded ${Math.round(recordedTiming.seconds)}s from ${recordedTiming.source} timings)`
                  : ''
              const message = `${test.file} timed out after ${formatTimeout(
                suiteTimeoutMs
              )}${basis}, killing`
              console.error(message)
              stdout(`\n${message}\n`)
              if (child.pid === undefined) {
                failAttempt(new Error(message))
                return
              }
              // Kill the whole tree: jest plus any next-server, browser or
              // package manager processes it spawned.
              killDone = new Promise((resolveKill) => {
                treeKill(child.pid, 'SIGKILL', (err) => {
                  if (err) {
                    const killError = `Failed to kill ${test.file}: ${err.message}`
                    console.error(killError)
                    stdout(`${killError}\n`)
                    failAttempt(new Error(`${message}; ${killError}`))
                  }
                  resolveKill()
                })
              })
            }, suiteTimeoutMs)
          : undefined

      child.on('exit', async (code, signal) => {
        if (settled) return
        // After a timeout, wait until the whole process tree is killed before
        // reporting the attempt (and possibly retrying).
        if (timedOut) await killDone
        if (settled) return
        settled = true
        clearTimeout(suiteTimeout)
        children.delete(child)
        const isChildExitWithNonZero = code !== 0 || signal !== null || timedOut
        if (isChildExitWithNonZero) {
          await printFailureOutput()
          const err = new Error(
            timedOut
              ? `timed out after ${formatTimeout(suiteTimeoutMs)}`
              : code
                ? `failed with code: ${code}`
                : `failed with signal: ${signal}`
          )
          // @ts-expect-error
          err.output = outputChunks
            .map(({ chunk }) => chunk.toString())
            .join('')

          return reject(err)
        }

        // preserve test traces to upload into github actions artifacts for debugging purposes
        const shouldPreserveTracesOutput =
          (process.env.CI && isChildExitWithNonZero) ||
          process.env.PRESERVE_TRACES_OUTPUT
        if (!shouldPreserveTracesOutput) {
          await fsp
            .rm(
              path.join(
                __dirname,
                'test/traces',
                path
                  .relative(path.join(__dirname, 'test'), test.file)
                  .replace(/\//g, '-')
              ),
              { recursive: true, force: true }
            )
            .catch(() => {})
        }

        resolve(new Date().getTime() - start)
      })
    })

  const isRetryAttempt =
    process.env.CI && parseInt(process.env.GITHUB_RUN_ATTEMPT || '1', 10) > 1

  // Load tests that already passed (either on this attempt — restored
  // from cache by the workflow — or after a timeout/cancel of an earlier
  // attempt). The workflow's `actions/cache/restore` step lands the file
  // at the path `loadPassedTests` reads.
  let cachedPassedTests = new Set()
  if (process.env.CI) {
    cachedPassedTests = await profile.loadPassedTests()
    if (cachedPassedTests.size > 0) {
      console.log(
        `Test result cache: loaded ${cachedPassedTests.size} passed test(s) (${profile.description})`
      )
    } else if (isRetryAttempt) {
      console.log(`Test result cache: miss (${profile.description})`)
    }
  }

  // Stream passing test names to this file.
  /** @type {number | null} */
  let passedTestsFd = null
  if (profile.cachingEnabled) {
    try {
      passedTestsFd = fs.openSync(process.env.NEXT_TEST_PASSED_FILE, 'a')
      // Tell the workflow that the file exists. Its "Save passed-tests
      // cache" step (see `.github/workflows/build_reusable.yml`) only runs
      // when this output is present, so jobs that never get here (no
      // run-tests.js, or result caching disabled) skip the save instead of
      // warning about a missing path.
      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(
          process.env.GITHUB_OUTPUT,
          `passed_tests_file=${process.env.NEXT_TEST_PASSED_FILE}\n`
        )
      }
    } catch (err) {
      console.log(`Test result cache: open failed (${err.message})`)
    }
  }
  /** @param {string} file */
  const recordPassed = (file) => {
    if (passedTestsFd === null) return
    try {
      // Ensure durability of our writes by syncing each one.
      // This is a tiny bit of overhead but shouldn't really matter.
      fs.writeSync(passedTestsFd, `${file}\0`)
      fs.fdatasyncSync(passedTestsFd)
    } catch (err) {
      console.log(`Test result cache: append failed (${err.message})`)
    }
  }

  const runTest = async (/** @type {TestFile} */ test) => {
    // On CI retry attempts, skip tests that already passed on this commit
    if (cachedPassedTests.has(test.file)) {
      console.log(
        `${test.file} already passed on this commit (cached) — skipping`
      )
      return
    }

    let passed = false

    for (let i = 0; i < numRetries + 1; i++) {
      try {
        console.log(`Starting ${test.file} retry ${i}/${numRetries}`)
        const time = await runTestOnce(test, i === numRetries, i > 0)
        timings.push({
          file: test.file,
          time,
        })
        passed = true
        console.log(
          `${test.file} finished on retry ${i}/${numRetries} in ${time / 1000}s`
        )
        break
      } catch (err) {
        if (i < numRetries) {
          try {
            let testDir = path.dirname(path.join(__dirname, test.file))

            // if test is nested in a test folder traverse up a dir to ensure
            // we clean up relevant test files
            if (testDir.endsWith('/test') || testDir.endsWith('\\test')) {
              testDir = path.join(testDir, '..')
            }
            console.log('Cleaning test files at', testDir)
            await exec(`git clean -fdx "${testDir}"`)
            await exec(`git checkout "${testDir}"`)
          } catch (err) {}
        } else {
          console.error(`${test.file} failed due to ${err}`)
        }
      }
    }

    if (passed) {
      recordPassed(test.file)
      // The test may have failed on an earlier attempt; don't report tests
      // that ultimately passed in the job summary.
      errorsPerTests.delete(test.file)
    }

    if (!passed) {
      hadFailures = true
      // "failed to pass within" is a keyword parsed by next-pr-webhook
      console.error(`${test.file} failed to pass within ${numRetries} retries`)
    }

    // Emit test output, parsed by the commenter webhook to notify about failing tests.
    // Also emit for all tests when NEXT_TEST_EMIT_ALL_OUTPUT is set (for manifest generation).
    if ((!passed || process.env.NEXT_TEST_EMIT_ALL_OUTPUT) && isTestJob) {
      try {
        const testsOutput = await fsp.readFile(
          `${test.file}${RESULTS_EXT}`,
          'utf8'
        )
        const obj = JSON.parse(testsOutput)

        // Extract failed test case names from Jest JSON output
        if (!passed && process.env.CI) {
          const failedCases = []
          for (const testResult of obj.testResults || []) {
            for (const assertion of testResult.assertionResults || []) {
              if (assertion.status === 'failed') {
                const caseName = [
                  ...(assertion.ancestorTitles || []),
                  assertion.title,
                ].join(' > ')
                failedCases.push(caseName)
              }
            }
          }
          // Update errorsPerTests with failed case names
          const existing = errorsPerTests.get(test.file)
          if (existing) {
            existing.failedCases = failedCases
          }
        }

        obj.processEnv = {
          NEXT_TEST_MODE: process.env.NEXT_TEST_MODE,
          HEADLESS: process.env.HEADLESS,
        }
        await outputSema.acquire()
        if (GROUP) console.log(`${GROUP}Result as JSON for tooling`)
        console.log(
          `--test output start--`,
          JSON.stringify(obj),
          `--test output end--`
        )
        if (ENDGROUP) console.log(ENDGROUP)
        outputSema.release()
      } catch (err) {
        console.log(`Failed to load test output`, err)
      }
    }
  }

  const results = await Promise.allSettled(
    tests.map(async (test) => {
      // TODO: Use explicit resource management instead of this acquire/release
      // pattern once CI runs with Node.js 24+.
      await sema.acquire()

      try {
        await runTest(test)
      } finally {
        sema.release()
      }
    })
  )

  for (const result of results) {
    if (result.status === 'rejected') {
      hadFailures = true
      console.error(result.reason)
    }
  }

  if (passedTestsFd !== null) {
    try {
      fs.closeSync(passedTestsFd)
    } catch {}
  }

  if (cachedPassedTests.size > 0) {
    const skipped = tests.filter((t) => cachedPassedTests.has(t.file)).length
    if (skipped > 0) {
      console.log(
        `Test result cache: skipped ${skipped} cached, re-ran ${tests.length - skipped}`
      )
    }
  }

  if (options.timings) {
    /** @type {Record<string, number>} */
    const curTimings = {}
    // let junitData = `<testsuites name="jest tests">`
    /*
      <testsuite name="/__tests__/bar.test.js" tests="1" errors="0" failures="0" skipped="0" timestamp="2017-10-10T21:56:49" time="0.323">
        <testcase classname="bar-should be bar" name="bar-should be bar" time="0.004">
        </testcase>
      </testsuite>
    */

    for (const timing of timings) {
      const timeInSeconds = timing.time / 1000
      curTimings[timing.file] = timeInSeconds

      // junitData += `
      //   <testsuite name="${timing.file}" file="${
      //   timing.file
      // }" tests="1" errors="0" failures="0" skipped="0" timestamp="${new Date().toJSON()}" time="${timeInSeconds}">
      //     <testcase classname="tests suite should pass" name="${
      //       timing.file
      //     }" time="${timeInSeconds}"></testcase>
      //   </testsuite>
      // `
    }
    // junitData += `</testsuites>`
    // console.log('output timing data to junit.xml')

    if (shouldUseSharedTimings) {
      if (kvClient) {
        try {
          await writeTestTimings(
            kvClient,
            retryKVOperation,
            timingsVariant,
            curTimings,
            (file) => fs.existsSync(path.join(__dirname, file))
          )
        } catch (err) {
          console.log('Failed to update timings data', err)
        }
      } else {
        console.warn('KV client not configured, skipping timing update')
      }
    }
  }

  return hadFailures
}

main().then(
  (hadFailures) => {
    if (hadFailures) {
      console.error('Some tests failed')
      return cleanUpAndExit(1)
    } else {
      return cleanUpAndExit(0)
    }
  },
  (reason) => {
    console.error(reason)
    return cleanUpAndExit(1)
  }
)
