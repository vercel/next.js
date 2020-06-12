const path = require('path')

const benchTitle = 'Page Load Tests'
const workDir = path.join(__dirname, '../.work')
const mainRepoName = 'main-repo'
const diffRepoName = 'diff-repo'
const mainRepoDir = path.join(workDir, mainRepoName)
const diffRepoDir = path.join(workDir, diffRepoName)
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
  diffingDir,
  mainRepoName,
  diffRepoName,
  mainRepoDir,
  diffRepoDir,
  statsAppDir,
  allowedConfigLocations,
}
