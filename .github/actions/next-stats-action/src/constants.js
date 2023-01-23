const path = require('path')
const os = require('os')

const benchTitle = 'Page Load Tests'
const workDir = path.join(os.tmpdir(), 'next-stats')
const mainRepoDir = path.join(os.tmpdir(), 'main-repo')
const diffRepoDir = path.join(os.tmpdir(), 'diff-repo')
const statsAppDir = path.join(workDir, 'stats-app')
const diffingDir = path.join(workDir, 'diff')
const yarnEnvValues = {
  YARN_CACHE_FOLDER: path.join(workDir, 'yarn-cache'),
}
const allowedConfigLocations = [
  './',
  '.stats-app',
  'test/.stats-app',
  '.github/.stats-app',
]

module.exports = {
  benchTitle,
  workDir,
  diffingDir,
  mainRepoDir,
  diffRepoDir,
  statsAppDir,
  yarnEnvValues,
  allowedConfigLocations,
}
