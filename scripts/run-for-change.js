const { promisify } = require('util')
const { exec: execOrig, spawn } = require('child_process')
const yargs = require('yargs')

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
  const argv = await yargs(process.argv.slice(2))
    .usage(
      'Usage: $0 --type <type> [--not] [--always-canary] (--exec <command...> | --listChangedDirectories)'
    )
    .option('type', {
      alias: 't',
      description: 'Specify the type of change group to check against',
      type: 'string',
      choices: Object.keys(CHANGE_ITEM_GROUPS),
      demandOption: true,
    })
    .option('not', {
      description:
        'Execute if *any* file *not* in the specified type group changed',
      type: 'boolean',
      default: false,
    })
    .option('always-canary', {
      description: 'Always execute/list if the current branch is canary',
      type: 'boolean',
      default: false,
    })
    .option('listChangedDirectories', {
      alias: 'l',
      description:
        'List matching changed directories instead of executing a command. ' +
        'Incompatible with a command specified using postional arguments.',
      type: 'boolean',
      default: false,
    })
    .check((argv) => {
      if (argv['--'].length === 0 && !argv.listChangedDirectories) {
        throw new Error(
          'Must provide either a command after options ' +
            '(e.g., `$0 -- my-cmd with args`) or use --listChangedDirectories'
        )
      }
      if (argv['--'].length > 0 && argv.listChangedDirectories) {
        throw new Error(
          'Both a command and --listChangedDirectories provided. ' +
            'Prioritizing --listChangedDirectories.'
        )
      }
      return true
    })
    .help()
    .alias('help', 'h')
    .example(
      '$0 --type docs -- echo "docs changed!"',
      'Prints "docs changed" if any docs have changed'
    )
    .example(
      '$0 --type docs --listChangedDirectories',
      'Prints the list of changed directories'
    )
    .strict().argv // Ensure only defined options/commands are used

  let eventData = {}
  try {
    eventData = require(process.env.GITHUB_EVENT_PATH)['pull_request'] || {}
  } catch (_) {}

  const branchName =
    eventData?.head?.ref ||
    process.env.GITHUB_REF_NAME ||
    (await exec('git rev-parse --abbrev-ref HEAD')).stdout.trim()

  const remoteUrl =
    eventData?.head?.repo?.full_name ||
    process.env.GITHUB_REPOSITORY ||
    (await exec('git remote get-url origin')).stdout

  const isCanary =
    branchName === 'canary' && remoteUrl.includes('vercel/next.js')

  try {
    await exec('git remote set-branches --add origin canary')
    await exec('git fetch origin canary --depth=20')
  } catch (err) {
    console.error(await exec('git remote -v'))
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
  const changedFilesOutput = changesResult.stdout

  const { type, not: isNegated, alwaysCanary, listChangedDirectories } = argv
  const execArgs = argv._

  let hasMatchingChange = false
  // `type` is validated by yargs `choices`
  const changeItems = CHANGE_ITEM_GROUPS[type]
  let changedFilesCount = 0
  let changedDirectories = []

  // always run for canary if flag is enabled
  if (alwaysCanary && isCanary) {
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
          changedDirectories.push(item)
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
      console.log(changedDirectories.join('\n'))
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
