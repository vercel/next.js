// @ts-check
/**
 * Runs the server-router regression gate: the test files that
 * test/routing-tests-manifest.json selects, once per mode, through
 * run-tests.js. See test/e2e/routing-server/README.md.
 *
 *   pnpm test-routing                                # start, then dev, Turbopack
 *   pnpm test-routing --mode=dev --bundler=webpack
 *   pnpm test-routing test/e2e/routing-server -c 2   # only files under a path
 *   pnpm test-routing --list                         # print the files, run nothing
 *
 * Arguments this script doesn't recognize are passed on to run-tests.js.
 */
import { spawnSync } from 'child_process'
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const glob = require('glob')
const minimatch = require('minimatch')
const { getTestFilterFromManifest } = require('../test/get-test-filter')

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROUTING_MANIFEST = 'test/routing-tests-manifest.json'
const DEFAULT_CONCURRENCY = '4'

// The test directories each mode runs, the same split as `run-tests.js --type`.
const MODE_TEST_PATTERNS = {
  start: /^test\/(e2e|production)\//,
  dev: /^test\/(e2e|development)\//,
}
const BUNDLERS = ['turbo', 'webpack', 'rspack']

/**
 * @param {readonly string[]} args
 */
function parseArgs(args) {
  const options = {
    modes: ['start', 'dev'],
    bundler: 'turbo',
    list: false,
    /** @type {string[]} */
    prefixes: [],
    /** @type {string[]} */
    runTestsArgs: [],
  }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const flag = /^--(mode|bundler)(?:=(.*))?$/.exec(arg)
    if (flag) {
      const value = flag[2] ?? args[++i] ?? ''
      if (flag[1] === 'mode') {
        options.modes = value === 'all' ? ['start', 'dev'] : value.split(',')
      } else {
        options.bundler = value
      }
    } else if (arg === '--list') {
      options.list = true
    } else if (arg.startsWith('test/')) {
      options.prefixes.push(arg)
    } else if (arg !== '--') {
      options.runTestsArgs.push(arg)
    }
  }

  for (const mode of options.modes) {
    if (!(mode in MODE_TEST_PATTERNS)) {
      throw new Error(`Unknown --mode=${mode}, expected start or dev`)
    }
  }
  if (!BUNDLERS.includes(options.bundler)) {
    throw new Error(
      `Unknown --bundler=${options.bundler}, expected ${BUNDLERS.join(', ')}`
    )
  }
  return options
}

/**
 * Every test file the routing manifest selects, using the filter run-tests.js
 * applies to NEXT_EXTERNAL_TESTS_FILTERS.
 * @returns {string[]}
 */
function getManifestFiles() {
  const manifest = require(`../${ROUTING_MANIFEST}`)
  /** @type {string[]} */
  const files = glob.sync('test/**/*.test.{js,ts,tsx}', {
    cwd: REPO_ROOT,
    ignore: '**/node_modules/**',
    nodir: true,
  })

  // An entry that matches nothing, say after a test file is renamed, would
  // drop out of the gate without a failure.
  const staleEntries = manifest.rules.include.filter(
    (/** @type {string} */ pattern) =>
      !files.some((file) => minimatch(file, pattern))
  )
  if (staleEntries.length > 0) {
    throw new Error(
      `${ROUTING_MANIFEST} has entries that match no test file:\n  ` +
        staleEntries.join('\n  ')
    )
  }

  const filter = getTestFilterFromManifest(manifest)
  return filter(files.map((file) => ({ file, excludedCases: [] })))
    .map((/** @type {{ file: string }} */ test) => test.file)
    .sort()
}

/**
 * @param {readonly string[]} files
 * @param {readonly string[]} prefixes
 */
function filterByPrefixes(files, prefixes) {
  for (const prefix of prefixes) {
    if (!files.some((file) => file.startsWith(prefix))) {
      throw new Error(`No file in ${ROUTING_MANIFEST} starts with ${prefix}`)
    }
  }
  return prefixes.length === 0
    ? files
    : files.filter((file) => prefixes.some((prefix) => file.startsWith(prefix)))
}

/**
 * The environment the matching CI job sets up
 * (.github/workflows/build_and_test.yml).
 * @param {string} mode
 * @param {string} bundler
 * @returns {NodeJS.ProcessEnv}
 */
function getRunEnv(mode, bundler) {
  const isDev = mode === 'dev'
  // Comma-joined manifests union their include rules, so the routing
  // selection is passed as explicit files instead. run-tests.js still filters
  // those files through these manifests, which yields the intersection.
  const manifests = new Set(
    (process.env.NEXT_EXTERNAL_TESTS_FILTERS ?? '').split(',').filter(Boolean)
  )
  if (bundler === 'rspack') {
    manifests.add(
      isDev
        ? 'test/rspack-dev-tests-manifest.json'
        : 'test/rspack-build-tests-manifest.json'
    )
  }

  // As in CI, TURBOPACK_DEV and TURBOPACK_BUILD also gate tests for Rspack.
  const turbopackFlags = isDev
    ? { TURBOPACK_DEV: '1' }
    : { TURBOPACK_BUILD: '1' }
  const bundlerEnv =
    bundler === 'turbo'
      ? { IS_TURBOPACK_TEST: '1', ...turbopackFlags }
      : bundler === 'rspack'
        ? { NEXT_RSPACK: '1', NEXT_TEST_USE_RSPACK: '1', ...turbopackFlags }
        : { IS_WEBPACK_TEST: '1' }

  return {
    ...process.env,
    __NEXT_EXPERIMENTAL_STRICT_ROUTE_TYPES:
      process.env.__NEXT_EXPERIMENTAL_STRICT_ROUTE_TYPES ?? 'true',
    // Clear bundler flags inherited from the shell before setting this run's.
    IS_TURBOPACK_TEST: undefined,
    IS_WEBPACK_TEST: undefined,
    NEXT_RSPACK: undefined,
    NEXT_TEST_USE_RSPACK: undefined,
    TURBOPACK_BUILD: undefined,
    TURBOPACK_DEV: undefined,
    ...bundlerEnv,
    NEXT_TEST_MODE: mode,
    NEXT_EXTERNAL_TESTS_FILTERS: [...manifests].join(',') || undefined,
  }
}

/**
 * Before each retry, run-tests.js resets the test's directory with
 * `git clean -fdx` and `git checkout`, which would discard untracked files and
 * unstaged edits there. Reports whether any selected test has some.
 * @param {readonly string[]} files
 */
function hasUnstagedTestChanges(files) {
  const directories = new Set(
    files.map((file) => {
      const directory = path.dirname(file)
      // Mirrors the directory run-tests.js cleans.
      return directory.endsWith('/test') ? path.dirname(directory) : directory
    })
  )
  const status = spawnSync(
    'git',
    ['status', '--porcelain', '--', ...directories],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  )
  return status.stdout
    .split('\n')
    .some((line) => line.length > 1 && line[1] !== ' ')
}

/**
 * Node.js fixed a realpath bug in 24.21.0 and 26.8.0
 * (https://github.com/nodejs/node/pull/65113), the same check as
 * test/lib/pnpm-realpath-workaround.ts. On earlier versions a dev server can
 * load React twice from a fixture's pnpm symlinks, and its tests time out.
 * @param {string} version
 */
function hasNodeRealpathFix(version) {
  const [major, minor] = version.split('.').map(Number)
  return (
    (major === 24 && minor >= 21) || major > 26 || (major === 26 && minor >= 8)
  )
}

/**
 * @param {readonly string[]} args
 * @param {...string} names
 */
function hasOption(args, ...names) {
  return args.some((arg) => names.some((name) => arg.split('=')[0] === name))
}

/**
 * @param {readonly string[]} files
 * @param {ReturnType<typeof parseArgs>} options
 */
function getRunTestsArgs(files, options) {
  const args = [...options.runTestsArgs]
  if (options.list) {
    args.push('--print-tests')
  }
  if (!process.env.CI) {
    args.push('--local')
  }
  if (
    !hasOption(args, '-c', '--concurrency') &&
    !process.env.TEST_CONCURRENCY
  ) {
    args.push('--concurrency', DEFAULT_CONCURRENCY)
  }
  if (
    !options.list &&
    !hasOption(args, '--retries') &&
    hasUnstagedTestChanges(files)
  ) {
    console.log(
      'Selected tests have untracked or unstaged changes, which run-tests.js ' +
        'retries would reset. Running with --retries 0; stage the changes to ' +
        'keep retries on.'
    )
    args.push('--retries', '0')
  }
  return [...args, ...files]
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const files = filterByPrefixes(getManifestFiles(), options.prefixes)
  if (!options.list && !hasNodeRealpathFix(process.versions.node)) {
    console.warn(
      `Node.js ${process.versions.node} lacks the realpath fix from 24.21.0 ` +
        'and 26.8.0, so dev-mode tests can fail with "Invalid hook call" ' +
        'and time out. Use Node.js 24.21+ for a reliable run.'
    )
  }

  const results = []
  for (const mode of options.modes) {
    const modeFiles = files.filter((file) =>
      MODE_TEST_PATTERNS[mode].test(file)
    )
    console.log(
      `\nRouting gate: ${mode} mode, ${options.bundler}, ${modeFiles.length} files`
    )
    // Without file arguments, run-tests.js would select every test instead.
    if (modeFiles.length === 0) {
      continue
    }
    const start = Date.now()
    const run = spawnSync(
      process.execPath,
      ['run-tests.js', ...getRunTestsArgs(modeFiles, options)],
      {
        cwd: REPO_ROOT,
        env: getRunEnv(mode, options.bundler),
        stdio: 'inherit',
      }
    )
    if (run.signal) {
      process.kill(process.pid, run.signal)
      return
    }
    results.push({
      mode,
      files: modeFiles.length,
      passed: run.status === 0,
      minutes: ((Date.now() - start) / 60_000).toFixed(1),
    })
  }

  if (!options.list) {
    console.log(`\nRouting gate (${options.bundler}):`)
    for (const result of results) {
      console.log(
        `  ${result.mode}: ${result.passed ? 'passed' : 'FAILED'}, ` +
          `${result.files} files in ${result.minutes} min`
      )
    }
  }
  if (results.some((result) => !result.passed)) {
    process.exitCode = 1
  }
}

main()
