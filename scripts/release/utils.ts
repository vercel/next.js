import fs from 'node:fs'
import path from 'node:path'
import cp from 'node:child_process'
import execa from 'execa'
import glob from 'glob'
import { getChangelogByVersion } from './utils/get-changelog-by-version'

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

  // "Version Packages" or "Version Packages (dry)"
  const publishMsgRegex = /^Version Packages( \(dry\))?$/
  const isNewRelease = publishMsgRegex.test(commitMsg)
  const isDryRun = isNewRelease && commitMsg.includes('(dry)')
  return { isNewRelease, isDryRun }
}

export type ChangelogInfo = {
  version: string
  changelog: string
}

export function getPackageChangelogs(): Record<string, ChangelogInfo> {
  const packageDirs = glob.sync('packages/*')
  const changelogs: Record<string, ChangelogInfo> = {}

  for (const dir of packageDirs) {
    const packageJsonPath = path.join(dir, 'package.json')
    const changelogPath = path.join(dir, 'CHANGELOG.md')

    if (!fs.existsSync(packageJsonPath) || !fs.existsSync(changelogPath)) {
      continue
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    const packageName = packageJson.name
    const version = packageJson.version

    if (!packageName) {
      throw new Error(`No package name found for ${dir}.`)
    }
    if (!version) {
      throw new Error(`No version found for ${packageName}.`)
    }

    const content = fs.readFileSync(changelogPath, 'utf8')
    const changelog = getChangelogByVersion(content, version)

    if (changelog) {
      changelogs[packageName] = { version, changelog }
    }
  }

  return changelogs
}

export function getCredits(cwd: string): string[] {
  const credits: Record<string, ''> = require(
    path.join(cwd, '.changeset/credits.json')
  )
  return Object.keys(credits)
}
