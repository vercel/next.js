import fs from 'node:fs'
import path from 'node:path'
import glob from 'glob'
import { getChangelogByVersion } from './get-changelog-by-version'

export type ChangelogInfo = {
  version: string
  changelog: string
}

export function getPackageChangelogInfo(): Record<string, ChangelogInfo> {
  const packageDirs = glob.sync('packages/*')
  const changelogs: Record<string, ChangelogInfo> = {}

  for (const dir of packageDirs) {
    const packageJsonPath = path.join(dir, 'package.json')
    const changelogPath = path.join(dir, 'CHANGELOG.md')

    if (!fs.existsSync(packageJsonPath) || !fs.existsSync(changelogPath)) {
      continue
    }

    const { name, version } = require(packageJsonPath)

    const content = fs.readFileSync(changelogPath, 'utf8')
    const changelog = getChangelogByVersion(content, version)

    if (changelog) {
      changelogs[name] = { version, changelog }
    }
  }

  return changelogs
}
