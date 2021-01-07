const { promisify } = require('util')
const { exec: execOrig, spawn } = require('child_process')

const exec = promisify(execOrig)

const DOCS_FOLDERS = ['bench', 'docs', 'errors', 'examples']

async function main() {
  await exec('git fetch origin canary')
  const { stdout: changedFilesOutput } = await exec(
    'git diff $(git merge-base --fork-point canary) --name-only'
  )
  const changedFiles = changedFilesOutput
    .split('\n')
    .map((file) => file && file.trim())
    .filter(Boolean)

  let hasNonDocsChange = changedFiles.some((file) => {
    return !DOCS_FOLDERS.some((folder) => file.startsWith(folder + '/'))
  })

  const args = process.argv.slice(process.argv.indexOf(__filename) + 1)

  if (args.length === 0) {
    console.log(process.argv, args)
    console.log('no script provided, exiting...')
  }

  if (hasNonDocsChange) {
    const cmd = spawn(args[0], args.slice(1))
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
    console.log('Only docs changes exiting...')
  }
}

main().catch((err) => {
  console.error('Failed to detect doc changes', err)
  process.exit(1)
})
