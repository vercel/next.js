const fs = require('fs')
const os = require('os')
const path = require('path')

const prettier = require('prettier')
const execa = require('execa')
const { bold } = require('kleur')

async function format(text) {
  const options = await prettier.resolveConfig(__filename)
  return prettier.format(text, { ...options, parser: 'json' })
}

const override = process.argv.includes('--override')

const PASSING_JSON_PATH = `${__dirname}/turbopack-tests-manifest.json`
const WORKING_PATH = '/root/actions-runner/_work/next.js/next.js/'

const INITIALIZING_TEST_CASES = [
  'compile successfully',
  'should build successfully',
]

// please make sure this is sorted alphabetically when making changes.
const SKIPPED_TEST_SUITES = {
  'test/development/acceptance-app/ReactRefreshRegression.test.ts': [
    'ReactRefreshRegression app can fast refresh a page with config',
    'ReactRefreshRegression app can fast refresh a page with dynamic rendering',
  ],
  'test/development/acceptance-app/ReactRefreshRequire.test.ts': [
    'ReactRefreshRequire app propagates a hot update to closest accepted module',
    'ReactRefreshRequire app propagates hot update to all inverse dependencies',
    'ReactRefreshRequire app re-runs accepted modules',
  ],
  'test/development/acceptance/ReactRefreshLogBox.test.ts': [
    'ReactRefreshLogBox turbo conversion to class component (1)',
  ],
  'test/development/acceptance/ReactRefreshRequire.test.ts': [
    'ReactRefreshRequire propagates a hot update to closest accepted module',
    'ReactRefreshRequire propagates hot update to all inverse dependencies',
    'ReactRefreshRequire re-runs accepted modules',
  ],
  'test/development/basic/hmr.test.ts': [
    'basic HMR, basePath: "/docs" Error Recovery should show the error on all pages',
  ],
  'test/development/jsconfig-path-reloading/index.test.ts': [
    /should automatically fast refresh content when path is added without error/,
    /should recover from module not found when paths is updated/,
  ],
  'test/development/middleware-errors/index.test.ts': [
    'middleware - development errors when there is a compilation error after boot logs the error correctly',
    'middleware - development errors when there is a compilation error from boot logs the error correctly',
  ],
  'test/development/tsconfig-path-reloading/index.test.ts': [
    /should automatically fast refresh content when path is added without error/,
    'tsconfig-path-reloading tsconfig added after starting dev should load with initial paths config correctly',
  ],
  'test/e2e/app-dir/app-compilation/index.test.ts': [
    'app dir HMR should not cause error when removing loading.js',
  ],
  'test/e2e/app-dir/app-css/index.test.ts': [
    'app dir - css css support server layouts should support external css imports',
  ],
  'test/e2e/app-dir/metadata/metadata.test.ts': [
    'app dir - metadata file based icons should handle updates to the file icon name and order',
    'app dir - metadata react cache should have same title and page value on initial load',
    'app dir - metadata react cache should have same title and page value when navigating',
    'app dir - metadata static routes should have icons as route',
    'app dir - metadata twitter should render twitter card summary when image is not present',
    'app dir - metadata twitter should support default twitter app card',
    'app dir - metadata twitter should support default twitter player card',
    'app dir - metadata twitter should support twitter card summary_large_image when image present',
    'app dir - metadata viewport should support dynamic viewport export',
  ],
  'test/e2e/app-dir/navigation/navigation.test.ts': [
    'app dir - navigation query string useParams identity between renders should be stable in pages',
  ],
  'test/e2e/basepath.test.ts': [
    'basePath should 404 when manually adding basePath with router.push',
    'basePath should 404 when manually adding basePath with router.replace',
  ],
  'test/e2e/conflicting-app-page-error/index.test.ts': [
    'Conflict between app file and pages file should not show error overlay for non conflict pages under app or pages dir',
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
  'test/integration/app-document/test/index.test.js': [
    'Document and App Client side should detect the changes to pages/_app.js and display it',
    'Document and App Client side should detect the changes to pages/_document.js and display it',
  ],
  'test/integration/css/test/css-modules.test.js': [
    'CSS Modules Composes Ordering Development Mode should have correct color on index page (on nav from index)',
    'CSS Modules Composes Ordering Development Mode should have correct color on index page (on nav from other)',
  ],
  'test/integration/custom-error/test/index.test.js': [/Custom _error/],
  'test/integration/dynamic-routing/test/index.test.js': [
    'Dynamic Routing dev mode should work with HMR correctly',
    'Dynamic Routing production mode should have correct cache entries on prefetch',
    'Dynamic Routing production mode should render dynamic route with query',
  ],
  'test/integration/dynamic-routing/test/middleware.test.js': [
    'Dynamic Routing dev mode should resolve dynamic route href for page added later',
    'Dynamic Routing production mode should output a routes-manifest correctly',
  ],
  'test/integration/env-config/test/index.test.js': [
    'Env Config dev mode with hot reload should provide env correctly for API routes',
    'Env Config dev mode with hot reload should provide env correctly for SSR',
    'Env Config dev mode with hot reload should provide env for SSG',
  ],
  'test/integration/import-assertion/test/index.test.js': [
    /should handle json assertions/,
  ],
  'test/integration/next-image-legacy/unicode/test/index.test.ts': [
    /Image Component Unicode Image URL/,
  ],
  'test/integration/next-image-new/unicode/test/index.test.ts': [
    /Image Component Unicode Image URL/,
  ],
}

function checkSorted(arr, name) {
  const sorted = [...arr].sort()
  if (JSON.stringify(arr) !== JSON.stringify(sorted)) {
    console.log(`Expected order of ${name}:`)
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === sorted[i]) {
        console.log(`  ${arr[i]}`)
      } else {
        console.log(bold().red(`- ${arr[i]}`))
        console.log(bold().green(`+ ${sorted[i]}`))
      }
    }
    throw new Error(`${name} is not sorted`)
  }
}

checkSorted(Object.keys(SKIPPED_TEST_SUITES), 'SKIPPED_TEST_SUITES')

for (const [key, value] of Object.entries(SKIPPED_TEST_SUITES)) {
  checkSorted(value, `SKIPPED_TEST_SUITES['${key}']`)
}

/**
 * @param title {string}
 * @param file {string}
 * @param args {readonly string[]}
 * @returns {execa.ExecaChildProcess}
 */
function exec(title, file, args) {
  logCommand(title, `${file} ${args.join(' ')}`)

  return execa(file, args, {
    stderr: 'inherit',
  })
}

/**
 * @param {string} title
 * @param {string} [command]
 */
function logCommand(title, command) {
  let message = `\n${bold().underline(title)}\n`

  if (command) {
    message += `> ${bold(command)}\n`
  }

  console.log(message)
}

/**
 * @returns {Promise<Artifact>}
 */
async function fetchLatestTestArtifact() {
  const { stdout } = await exec(
    'Getting latest test artifacts from GitHub actions',
    'gh',
    ['api', '/repos/vercel/next.js/actions/artifacts?name=test-results']
  )

  /** @type {ListArtifactsResponse} */
  const res = JSON.parse(stdout)

  for (const artifact of res.artifacts) {
    if (artifact.expired || artifact.workflow_run.head_branch !== 'canary') {
      continue
    }

    return artifact
  }

  throw new Error('no valid test-results artifact was found for branch canary')
}

/**
 * @returns {Promise<TestResultManifest>}
 */
async function fetchTestResults() {
  const artifact = await fetchLatestTestArtifact()

  const subprocess = exec('Downloading artifact archive', 'gh', [
    'api',
    `/repos/vercel/next.js/actions/artifacts/${artifact.id}/zip`,
  ])

  const filePath = path.join(
    os.tmpdir(),
    `next-test-results.${Math.floor(Math.random() * 1000).toString(16)}.zip`
  )

  subprocess.stdout.pipe(fs.createWriteStream(filePath))

  await subprocess

  const { stdout } = await exec('Extracting test results manifest', 'unzip', [
    '-pj',
    filePath,
    'nextjs-test-results.json',
  ])

  return JSON.parse(stdout)
}

async function updatePassingTests() {
  const results = await fetchTestResults()

  logCommand('Processing results...')

  const passing = { __proto__: null }
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

      const skippedPassingNames = []

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
          if (status === 'passed') skippedPassingNames.push(fullName)
          status = 'flakey'
        }

        const statusArray = fileResults[status]
        if (!statusArray) {
          throw new Error(`unexpected status "${status}"`)
        }
        statusArray.push(fullName)
      }

      if (skippedPassingNames.length > 0) {
        console.log(
          `${bold().yellow(filepath)} has ${
            skippedPassingNames.length
          } passing tests that are marked as skipped:\n${skippedPassingNames
            .map((name) => `  - ${name}`)
            .join('\n')}\n`
        )
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
        console.log(
          `${bold().red(file)} has ${
            shouldPass.size
          } test(s) that should pass but failed:\n${Array.from(shouldPass)
            .map((name) => `  - ${name}`)
            .join('\n')}\n`
        )
      }
      // Merge the old passing tests with the new ones
      newData.passed = [...new Set([...shouldPass, ...newData.passed])].sort()
      // but remove them also from the failed list
      newData.failed = newData.failed
        .filter((name) => !shouldPass.has(name))
        .sort()

      if (!oldData.runtimeError && newData.runtimeError) {
        console.log(
          `${bold().red(file)} has a runtime error that is shouldn't have\n`
        )
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

updatePassingTests().catch((e) => {
  console.error(e)
  process.exit(1)
})
