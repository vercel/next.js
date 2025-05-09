import fs from 'node:fs'
import path from 'node:path'
import cp from 'node:child_process'
import execa from 'execa'

export function exec(command: string) {
  return execa(command, {
    stdio: 'inherit',
    shell: true,
  })
}

export function getTag(cwd: string): string {
  const preJsonPath = path.join(cwd, '.changeset', 'pre.json')
  if (fs.existsSync(preJsonPath)) {
    const preJson = require(preJsonPath)
    if (preJson.tag) {
      return preJson.tag
    }
  }

  return 'latest'
}

export function checkIsNewRelease(): {
  isNewRelease: boolean
  isDryRun: boolean
} {
  const commitMsg = cp
    .execSync(`git log -n 1 --pretty='format:%B'`)
    .toString()
    .trim()

  // "vX.Y.Z(-tag.N) (new|new dry)"
  const publishMsgRegex =
    // TODO: include new-dry
    /^v\d{1,}\.\d{1,}\.\d{1,}(-\w{1,}\.\d{1,})( \(new\))?$/
  const isNewRelease = publishMsgRegex.test(commitMsg)
  const isDryRun = isNewRelease && commitMsg.includes('dry')
  return { isNewRelease, isDryRun }
}
