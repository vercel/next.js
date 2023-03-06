const { promisify } = require('util')
const { exec: execOrig, spawn } = require('child_process')

const exec = promisify(execOrig)

const CHANGE_ITEM_GROUPS = {
  docs: [
    'bench',
    'docs',
    'errors',
    'examples',
    'UPGRADING.md',
    'contributing.md',
    'contributing',
    'CODE_OF_CONDUCT.md',
    'readme.md',
    '.github/ISSUE_TEMPLATE',
    '.github/labeler.json',
    '.github/pull_request_template.md',
    'packages/next-plugin-storybook/readme.md',
    'packages/next/license.md',
    'packages/next/README.md',
    'packages/eslint-plugin-next/README.md',
    'packages/next-codemod/license.md',
    'packages/next-codemod/README.md',
    'packages/next-swc/crates/wasm/README.md',
    'packages/next-swc/README.md',
    'packages/next-bundle-analyzer/readme.md',
    'packages/next-mdx/license.md',
    'packages/next-mdx/readme.md',
    'packages/react-dev-overlay/README.md',
    'packages/react-refresh-utils/README.md',
    'packages/create-next-app/README.md',
    'packages/font/README.md',
    'packages/next-env/README.md',
  ],
  cna: ['packages/create-next-app', 'test/integration/create-next-app'],
  'next-codemod': ['packages/next-codemod'],
  'next-swc': [
    'packages/next-swc',
    'scripts/normalize-version-bump.js',
    'test/integration/create-next-app',
  ],
}

async function main() {
  let eventData = {}

  try {
    eventData = require(process.env.GITHUB_EVENT_PATH)['pull_request'] || {}
  } catch (_) {}

  const branchName =
    eventData?.head?.ref ||
    process.env.GITHUB_REF_NAME ||
    (await exec('git rev-parse --abbrev-ref HEAD')).stdout

  const remoteUrl =
    eventData?.head?.repo?.full_name ||
    process.env.GITHUB_REPOSITORY ||
    (await exec('git remote get-url origin').stdout)

  let changedFilesOutput = ''
  const isCanary =
    branchName.trim() === 'canary' && remoteUrl.includes('vercel/next.js')

  try {
    await exec('git fetch origin canary')
  } catch (err) {
    console.error(`Failed to fetch origin/canary`, err)
  }
  // if we are on the canary branch only diff current commit
  const toDiff = isCanary
    ? `${process.env.GITHUB_SHA || 'canary'}~`
    : 'origin/canary...'

  const changesResult = await exec(`git diff ${toDiff} --name-only`).catch(
    (err) => {
      console.error(err)
      return { stdout: '' }
    }
  )
  console.error({ branchName, remoteUrl, isCanary, changesResult })
  changedFilesOutput = changesResult.stdout

  const typeIndex = process.argv.indexOf('--type')
  const type = typeIndex > -1 && process.argv[typeIndex + 1]
  const isNegated = process.argv.indexOf('--not') > -1
  const alwaysCanary = process.argv.indexOf('--always-canary') > -1

  if (!type) {
    throw new Error(
      `Missing "--type" flag, e.g. "node run-for-change.js --type docs"`
    )
  }
  const execArgIndex = process.argv.indexOf('--exec')

  if (execArgIndex < 0) {
    throw new Error('no "--exec" flag provided')
  }
  let hasMatchingChange = false
  const changeItems = CHANGE_ITEM_GROUPS[type]
  const execArgs = process.argv.slice(execArgIndex + 1)

  if (execArgs.length < 1) {
    throw new Error('Missing exec arguments after "--exec"')
  }

  if (!changeItems) {
    throw new Error(
      `Invalid change type, allowed types are ${Object.keys(
        CHANGE_ITEM_GROUPS
      ).join(', ')}`
    )
  }
  let changedFilesCount = 0

  // always run for canary if flag is enabled
  if (alwaysCanary && branchName === 'canary') {
    changedFilesCount += 1
    hasMatchingChange = true
  }

  for (let file of changedFilesOutput.split('\n')) {
    file = file.trim().replace(/\\/g, '/')

    if (file) {
      changedFilesCount += 1

      // if --not flag is provided we execute for any file changed
      // not included in the change items otherwise we only execute
      // if a change item is changed
      const matchesItem = changeItems.some((item) => file.startsWith(item))

      if (!matchesItem && isNegated) {
        hasMatchingChange = true
        break
      }

      if (matchesItem && !isNegated) {
        hasMatchingChange = true
        break
      }
    }
  }

  // if we fail to detect the changes run the command
  if (changedFilesCount < 1) {
    console.error(`No changed files detected:\n${changedFilesOutput}`)
    hasMatchingChange = true
  }

  if (hasMatchingChange) {
    const cmd = spawn(execArgs[0], execArgs.slice(1))
    cmd.stdout.pipe(process.stdout)
    cmd.stderr.pipe(process.stderr)

    await new Promise((resolve, reject) => {
      cmd.on('exit', (code) => {
        if (code !== 0) {
          return reject(new Error('command failed with code: ' + code))
        }
        resolve()
      })
      cmd.on('error', (err) => reject(err))
    })
  } else {
    console.log(
      `No matching changed files for ${isNegated ? 'not ' : ''}"${type}":\n` +
        changedFilesOutput.trim()
    )
  }
}

main().catch((err) => {
  console.error('Failed to detect changes', err)
  process.exit(1)
})
