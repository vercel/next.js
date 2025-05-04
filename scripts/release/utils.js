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

export function getChangelogSection(markdown, version) {
  const lines = markdown.split('\n')
  const header = `## ${version}`
  const section = []
  let collecting = false

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (line.trim() === header) {
        collecting = true
        continue // skip the header itself
      } else if (collecting) {
        break // reached the next version
      }
    }
    if (collecting) {
      section.push(line)
    }
  }
  return section.join('\n').trim()
}
