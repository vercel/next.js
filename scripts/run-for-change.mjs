// @ts-check
import { promisify } from 'util'
import { exec as execOrig, spawn } from 'child_process'
import { getDiffRevision, getGitInfo } from './git-info.mjs'

const exec = promisify(execOrig)

const CHANGE_ITEM_GROUPS = {
  docs: [
    'bench',
    'docs',
    'apps/docs',
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
    'crates/wasm/README.md',
    'packages/next-swc/README.md',
    'packages/next-bundle-analyzer/readme.md',
    'packages/next-mdx/license.md',
    'packages/next-mdx/readme.md',
    'packages/react-dev-overlay/README.md',
    'packages/react-refresh-utils/README.md',
    'packages/create-next-app/README.md',
    'packages/font/README.md',
    'packages/next-env/README.md',
    'packages/next/src/client/components/react-dev-overlay/README.md',
  ],
  'deploy-examples': ['examples/image-component'],
  cna: [
    'packages/create-next-app',
    'test/integration/create-next-app',
    'examples/basic-css',
    'examples/mdx-pages',
    'examples/with-sass',
    'examples/with-eslint',
  ],
  'next-codemod': ['packages/next-codemod'],
  'next-swc': [
    'packages/next-swc',
    'scripts/normalize-version-bump.js',
    'test/integration/create-next-app',
    'scripts/send-trace-to-jaeger',
  ],
}

async function main() {
  const { branchName, remoteUrl, isCanary } = await getGitInfo()
  const diffRevision = await getDiffRevision()

  const changesResult = await exec(
    `git diff ${diffRevision} --name-only`
  ).catch((err) => {
    console.error(err)
    return { stdout: '' }
  })

  console.error({ branchName, remoteUrl, isCanary, changesResult })
  const changedFilesOutput = changesResult.stdout

  const typeIndex = process.argv.indexOf('--type')
  const type = typeIndex > -1 && process.argv[typeIndex + 1]
  const isNegated = process.argv.indexOf('--not') > -1
  const alwaysCanary = process.argv.indexOf('--always-canary') > -1

  if (!type) {
    throw new Error(
      `Missing "--type" flag, e.g. "node run-for-change.mjs --type docs"`
    )
  }
  const execArgIndex = process.argv.indexOf('--exec')
  const listChangedDirectories = process.argv.includes(
    '--listChangedDirectories'
  )

  if (execArgIndex < 0 && !listChangedDirectories) {
    throw new Error(
      'Invalid: must provide either "--exec" or "--listChangedDirectories" flag'
    )
  }
  let hasMatchingChange = false
  const changeItems = CHANGE_ITEM_GROUPS[type]
  const execArgs = process.argv.slice(execArgIndex + 1)

  if (execArgs.length < 1 && !listChangedDirectories) {
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
  let changedDirectories = new Set()

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
      const matchesItem = changeItems.some((item) => {
        const found = file.startsWith(item)
        if (found) {
          changedDirectories.add(item)
        }
        return found
      })

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
    if (listChangedDirectories) {
      console.log(Array.from(changedDirectories).join('\n'))
      return
    }
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
  } else if (!listChangedDirectories) {
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
