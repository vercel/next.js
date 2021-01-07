const path = require('path')
const execa = require('execa')
const fs = require('fs-extra')

const DOCS_ONLY_MARKER = path.join(__dirname, '.docs-change')
const DOCS_FOLDERS = [
  'bench',
  'docs',
  'errors',
  'examples',
]

async function main() {
  const {stdout: changedFilesOutput} = await execa('git', ['diff', 'canary', '--name-only'])
  const changedFiles = changedFilesOutput.split('\n')
    .map(file => file && file.trim())
    .filter(Boolean)

  let hasNonDocsChange = changedFiles.some(file => {
    return !DOCS_FOLDERS.some(folder => file.startsWith(folder + '/'))
  })

  const args = process.argv.slice(process.argv.indexOf(__filename) + 1)

  if (args.length === 0) {
    console.log(process.argv, args);
    console.log('no script provided, exiting...');
  }

  if (hasNonDocsChange || true) {
    const cmd = execa(args[0], args.slice(1))
    cmd.stdout.pipe(process.stdout)
    cmd.stderr.pipe(process.stderr)
    await cmd
  } else {
    console.log('Only docs changes exiting...')
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})