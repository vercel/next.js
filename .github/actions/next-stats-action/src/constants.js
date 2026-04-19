const path = require('path')
const os = require('os')
const fs = require('fs')

const benchTitle = 'Page Load Tests'

function getTempRoot() {
  const tempRoot = process.env.RUNNER_TEMP || os.tmpdir()

  try {
    fs.mkdirSync(tempRoot, { recursive: true })
    return tempRoot
  } catch {
    return os.tmpdir()
  }
}

const workDir = fs.mkdtempSync(path.join(getTempRoot(), 'next-stats-'))
const pnpmStoreDir = path.join(workDir, '.pnpm-store')
const mainRepoDir = path.join(workDir, 'main-repo')
const diffRepoDir = path.join(workDir, 'diff-repo')
const statsAppDir = path.join(workDir, 'stats-app')
const diffingDir = path.join(workDir, 'diff')
const allowedConfigLocations = [
  './',
  '.stats-app',
  'test/.stats-app',
  '.github/.stats-app',
]

module.exports = {
  benchTitle,
  workDir,
  pnpmStoreDir,
  diffingDir,
  mainRepoDir,
  diffRepoDir,
  statsAppDir,
  allowedConfigLocations,
}
