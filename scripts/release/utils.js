// @ts-check
const fs = require('fs')
const path = require('path')
const execa = require('execa')
const cp = require('child_process')

export function exec(command) {
  return execa(command, {
    stdio: 'inherit',
    shell: true,
  })
}

export function getTag(cwd) {
  const preJsonPath = path.join(cwd, '.changeset', 'pre.json')
  if (fs.existsSync(preJsonPath)) {
    const preJson = require(preJsonPath)
    if (preJson.tag) {
      return preJson.tag
    }
  }

  return 'latest'
}

/** @returns { { isNewRelease: boolean, isDryRun: boolean } } */
export function checkIsNewRelease() {
  const commitMsg = cp
    .execSync(`git log -n 1 --pretty='format:%B'`)
    .toString()
    .trim()

  // "Version Packages" or "Version Packages (dry)"
  const publishMsgRegex = /^Version Packages( \(dry\))?$/
  const isNewRelease = publishMsgRegex.test(commitMsg)
  const isDryRun = isNewRelease && commitMsg.includes('(dry)')
  return { isNewRelease, isDryRun }
}
