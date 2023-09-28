const fetch = require('node-fetch')
const fs = require('fs')
const prettier = require('prettier')

async function format(text) {
  const options = await prettier.resolveConfig(__filename)
  return prettier.format(text, { ...options, parser: 'json' })
}

const override = process.argv.includes('--override')

const RESULT_URL =
  'https://raw.githubusercontent.com/vercel/turbo/nextjs-integration-test-data/test-results/main/nextjs-test-results.json'
const PASSING_JSON_PATH = `${__dirname}/turbopack-tests-manifest.json`
const WORKING_PATH = '/home/runner/work/turbo/turbo/'

const INITIALIZING_TEST_CASES = [
  'compile successfully',
  'should build successfully',
]

// please make sure this is sorted alphabetically when making changes.
const SKIPPED_TEST_SUITES = {
  'test/development/acceptance-app/ReactRefreshLogBox-builtins.test.ts': [
    'ReactRefreshLogBox app turbo Module not found missing global CSS',
  ],
  'test/development/acceptance-app/ReactRefreshRegression.test.ts': [
    'ReactRefreshRegression app can fast refresh a page with dynamic rendering',
    'ReactRefreshRegression app can fast refresh a page with config',
  ],
  'test/development/acceptance/ReactRefreshRequire.test.ts': [
    'ReactRefreshRequire re-runs accepted modules',
    'ReactRefreshRequire propagates a hot update to closest accepted module',
    'ReactRefreshRequire propagates hot update to all inverse dependencies',
  ],
  'test/development/jsconfig-path-reloading/index.test.ts': [
    /should automatically fast refresh content when path is added without error/,
  ],
  'test/development/tsconfig-path-reloading/index.test.ts': [
    /should automatically fast refresh content when path is added without error/,
  ],
  'test/e2e/basepath.test.ts': [
    'basePath should 404 when manually adding basePath with router.push',
    'basePath should 404 when manually adding basePath with router.replace',
  ],
  'test/e2e/middleware-rewrites/test/index.test.ts': [
    'Middleware Rewrite should have props for afterFiles rewrite to SSG page',
  ],
  'test/integration/absolute-assetprefix/test/index.test.js': [
    'absolute assetPrefix with path prefix should work with getStaticPaths prerendered',
  ],
  'test/integration/app-document-remove-hmr/test/index.test.js': [
    '_app removal HMR should HMR when _document is removed',
  ],
  'test/integration/create-next-app/package-manager.test.ts': [
    'should use pnpm as the package manager on supplying --use-pnpm',
    'should use pnpm as the package manager on supplying --use-pnpm with example',
    'should infer pnpm as the package manager',
    'should infer pnpm as the package manager with example',
  ],
  'test/integration/css/test/css-modules.test.js': [
    'CSS Modules Composes Ordering Development Mode should have correct color on index page (on nav from other)',
  ],
  'test/integration/custom-error/test/index.test.js': [/Custom _error/],
  'test/integration/dynamic-routing/test/index.test.js': [
    'Dynamic Routing production mode should have correct cache entries on prefetch',
    'Dynamic Routing production mode should render dynamic route with query',
  ],
  'test/integration/dynamic-routing/test/middleware.test.js': [
    'Dynamic Routing dev mode should resolve dynamic route href for page added later',
    'Dynamic Routing production mode should output a routes-manifest correctly',
  ],
  'test/integration/import-assertion/test/index.test.js': [
    /should handle json assertions/,
  ],
  'test/integration/trailing-slashes/test/index.test.js': [
    'Trailing slashes dev mode, with basepath, trailingSlash: true /docs/linker?href=/ should navigate to /docs/',
  ],
}

async function updatePassingTests() {
  const passing = { __proto__: null }
  const res = await fetch(RESULT_URL)
  const results = await res.json()

  for (const result of results.result) {
    const runtimeError = result.data.numRuntimeErrorTestSuites > 0
    for (const testResult of result.data.testResults) {
      const filepath = stripWorkingPath(testResult.name)

      const fileResults = (passing[filepath] ??= {
        passed: [],
        failed: [],
        pending: [],
        flakey: [],
        runtimeError,
      })
      const skips = SKIPPED_TEST_SUITES[filepath] ?? []

      let initializationFailed = false
      for (const testCase of testResult.assertionResults) {
        let { fullName, status } = testCase

        if (
          status === 'failed' &&
          INITIALIZING_TEST_CASES.some((name) => fullName.includes(name))
        ) {
          initializationFailed = true
        } else if (initializationFailed) {
          status = 'failed'
        }
        if (shouldSkip(fullName, skips)) {
          status = 'flakey'
        }

        const statusArray = fileResults[status]
        if (!statusArray) {
          throw new Error(`unexpected status "${status}"`)
        }
        statusArray.push(fullName)
      }
    }
  }

  for (const info of Object.values(passing)) {
    info.failed = [...new Set(info.failed)].sort()
    info.pending = [...new Set(info.pending)].sort()
    info.flakey = [...new Set(info.flakey)].sort()
    info.passed = [
      ...new Set(info.passed.filter((name) => !info.failed.includes(name))),
    ].sort()
  }

  if (!override) {
    const oldPassingData = JSON.parse(
      fs.readFileSync(PASSING_JSON_PATH, 'utf8')
    )

    for (const file of Object.keys(oldPassingData)) {
      const newData = passing[file]
      const oldData = oldPassingData[file]
      if (!newData) continue

      // We want to find old passing tests that are now failing, and report them.
      // Tests are allowed transition to skipped or flakey.
      const shouldPass = new Set(
        oldData.passed.filter((name) => newData.failed.includes(name))
      )
      if (shouldPass.size > 0) {
        const list = JSON.stringify([...shouldPass], 0, 2)
        console.log(
          `${file} has ${shouldPass.size} test(s) that should pass but failed: ${list}`
        )
      }
      // Merge the old passing tests with the new ones
      newData.passed = [...new Set([...shouldPass, ...newData.passed])].sort()
      // but remove them also from the failed list
      newData.failed = newData.failed
        .filter((name) => !shouldPass.has(name))
        .sort()

      if (!oldData.runtimeError && newData.runtimeError) {
        console.log(`${file} has a runtime error that is shouldn't have`)
        newData.runtimeError = false
      }
    }
  }

  // JS keys are ordered, this ensures the tests are written in a consistent order
  // https://stackoverflow.com/questions/5467129/sort-javascript-object-by-key
  const ordered = Object.keys(passing)
    .sort()
    .reduce((obj, key) => {
      obj[key] = passing[key]
      return obj
    }, {})

  fs.writeFileSync(
    PASSING_JSON_PATH,
    await format(JSON.stringify(ordered, null, 2))
  )
}

function shouldSkip(name, skips) {
  for (const skip of skips) {
    if (typeof skip === 'string') {
      // exact match
      if (name === skip) return true
    } else {
      // regex
      if (skip.test(name)) return true
    }
  }
  return false
}

function stripWorkingPath(path) {
  if (!path.startsWith(WORKING_PATH)) {
    throw new Error(
      `found unexpected working path in "${path}", expected it to begin with ${WORKING_PATH}`
    )
  }
  return path.slice(WORKING_PATH.length)
}

updatePassingTests()
