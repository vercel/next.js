// @ts-check
import fs from 'fs/promises'
import execa from 'execa'
import path from 'path'

async function main() {
  let testMode = process.argv.includes('--dev-mode') ? 'dev' : 'start'
  const groupIndex = process.argv.indexOf('-g')
  const rawGroup = groupIndex > -1 ? process.argv[groupIndex] : null
  let currentGroup = 1
  let groupTotal = 1

  if (rawGroup) {
    ;[currentGroup, groupTotal] = rawGroup
      .split('/')
      .map((item) => Number(item))
  }

  let eventData = {}

  /** @type import('execa').Options */
  const EXECA_OPTS = { shell: true }
  /** @type import('execa').Options */
  const EXECA_OPTS_STDIO = { ...EXECA_OPTS, stdio: 'inherit' }

  try {
    eventData =
      JSON.parse(
        await fs.readFile(process.env.GITHUB_EVENT_PATH || '', 'utf8')
      )['pull_request'] || {}
  } catch (_) {}

  // detect changed test files
  const branchName =
    eventData?.head?.ref ||
    process.env.GITHUB_REF_NAME ||
    (await execa('git rev-parse --abbrev-ref HEAD', EXECA_OPTS)).stdout

  const remoteUrl =
    eventData?.head?.repo?.full_name ||
    process.env.GITHUB_REPOSITORY ||
    (await execa('git remote get-url origin', EXECA_OPTS)).stdout

  const isCanary =
    branchName.trim() === 'canary' && remoteUrl.includes('vercel/next.js')

  if (isCanary) {
    console.error(`Skipping flake detection for canary`)
    return
  }

  try {
    await execa('git remote set-branches --add origin canary', EXECA_OPTS_STDIO)
    await execa('git fetch origin canary --depth=20', EXECA_OPTS_STDIO)
  } catch (err) {
    console.error(await execa('git remote -v', EXECA_OPTS_STDIO))
    console.error(`Failed to fetch origin/canary`, err)
  }

  const changesResult = await execa(
    `git diff origin/canary --name-only`,
    EXECA_OPTS
  ).catch((err) => {
    console.error(err)
    return { stdout: '', stderr: '' }
  })
  console.error(
    {
      branchName,
      remoteUrl,
      isCanary,
      testMode,
    },
    `\ngit diff:\n${changesResult.stderr}\n${changesResult.stdout}`
  )
  const changedFiles = changesResult.stdout.split('\n')

  // run each test 3 times in each test mode (if E2E) with no-retrying
  // and if any fail it's flakey
  const devTests = []
  const prodTests = []

  for (let file of changedFiles) {
    // normalize slashes
    file = file.replace(/\\/g, '/')
    const fileExists = await fs
      .access(path.join(process.cwd(), file), fs.constants.F_OK)
      .then(() => true)
      .catch(() => false)

    if (fileExists && file.match(/^test\/.*?\.test\.(js|ts|tsx)$/)) {
      if (file.startsWith('test/e2e/')) {
        devTests.push(file)
        prodTests.push(file)
      } else if (file.startsWith('test/prod')) {
        prodTests.push(file)
      } else if (file.startsWith('test/development')) {
        devTests.push(file)
      }
    }
  }

  console.log(
    'Detected tests:',
    JSON.stringify(
      {
        devTests,
        prodTests,
      },
      null,
      2
    )
  )

  let currentTests = testMode === 'dev' ? devTests : prodTests

  /**
    @type {Array<string[]>}
  */
  const fileGroups = []

  for (const test of currentTests) {
    let smallestGroup = fileGroups[0]
    let smallestGroupIdx = 0

    // get the smallest group time to add current one to
    for (let i = 1; i < groupTotal; i++) {
      if (!fileGroups[i]) {
        fileGroups[i] = []
      }

      if (fileGroups[i] && fileGroups[i].length < smallestGroup.length) {
        smallestGroup = fileGroups[i]
        smallestGroupIdx = i
      }
    }
    fileGroups[smallestGroupIdx].push(test)
  }
  console.log({ fileGroups, currentGroup, groupTotal })
  currentTests = fileGroups[currentGroup] || []

  if (currentTests.length === 0) {
    console.log(`No added/changed tests detected`)
    return
  }

  const RUN_TESTS_ARGS = ['run-tests.js', '-c', '1', '--retries', '0']

  for (let i = 0; i < 3; i++) {
    console.log(`\n\nRun ${i + 1} for ${testMode} tests`)
    await execa('node', [...RUN_TESTS_ARGS, ...currentTests], {
      ...EXECA_OPTS_STDIO,
      env: {
        ...process.env,
        NEXT_TEST_MODE: testMode,
      },
    })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
