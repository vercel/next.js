const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

/** Pack one built workspace package for upload by an eval runner. */
function packPackage(packageDirectory, destination) {
  const directory = path.dirname(destination)
  fs.mkdirSync(directory, { recursive: true })
  const output = execFileSync(
    'pnpm',
    ['pack', '--pack-destination', directory],
    {
      cwd: packageDirectory,
      encoding: 'utf8',
    }
  )
  const produced = output.trim().split('\n').pop()
  const source = path.isAbsolute(produced)
    ? produced
    : path.join(directory, produced)
  if (source !== destination) fs.renameSync(source, destination)
  return destination
}
module.exports = { packPackage }
