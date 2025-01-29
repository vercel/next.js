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

const PASSING_JSON_PATH = `${__dirname}/rspack-build-tests-manifest.json`
const WORKING_PATH = '/root/actions-runner/_work/next.js/next.js/'

const INITIALIZING_TEST_CASES = [
  'compile successfully',
  'should build successfully',
]

// please make sure this is sorted alphabetically when making changes.
const SKIPPED_TEST_SUITES = {}

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
    [
      'api',
      '/repos/vercel/next.js/actions/artifacts?name=test-results-rspack-production',
    ]
  )

  /** @type {ListArtifactsResponse} */
  const res = JSON.parse(stdout)

  for (const artifact of res.artifacts) {
    // Temporarily allow other branches too
    // if (artifact.expired || artifact.workflow_run.head_branch !== 'canary') {
    //   continue
    // }

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

        // treat test-level todo as same as pending
        if (status === 'todo') {
          status = 'pending'
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
    await format(
      JSON.stringify(
        {
          version: 2,
          suites: ordered,
          rules: {
            include: [
              'test/integration/**/*.test.{t,j}s{,x}',
              'test/e2e/**/*.test.{t,j}s{,x}',
              'test/production/**/*.test.{t,j}s{,x}',
            ],
            exclude: [],
          },
        },
        null,
        2
      )
    )
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
