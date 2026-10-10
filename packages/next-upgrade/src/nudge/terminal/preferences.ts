import { execFile } from 'child_process'
import { createHash } from 'crypto'
import { realpath } from 'fs/promises'
import { basename, dirname, relative, resolve } from 'path'
import { promisify } from 'util'
import type { NudgeKind } from '../nudge'

export async function getUpgradePreferences(directory: string) {
  const Conf = require('conf') as typeof import('conf')
  const project = await realpath(directory)
  let identity = project
  let projectName = basename(project)
  try {
    const { stdout } = await promisify(execFile)(
      'git',
      ['rev-parse', '--show-toplevel', '--git-common-dir'],
      { cwd: project, timeout: 1000 }
    )
    const [root, common] = stdout.trimEnd().split('\n')
    const commonDirectory = await realpath(resolve(project, common))
    const appPath = relative(await realpath(root), project)
    // Worktrees share a Git directory, but monorepo apps need separate keys.
    identity = `${commonDirectory}\0${appPath}`
    projectName = basename(
      appPath ||
        (basename(commonDirectory) === '.git'
          ? dirname(commonDirectory)
          : commonDirectory)
    )
  } catch {
    // Apps outside Git (or without Git installed) keep their directory identity.
  }
  const hash = createHash('sha256').update(identity).digest('hex')
  // Conf treats dots as separators, including dots in directory names.
  const name = encodeURIComponent(projectName).replace(/\./g, '%2E')
  const key = `agent-upgrade.${name}.${hash}`
  // Upgrade preferences share Next.js' global config location, not telemetry consent.
  return { key, preferences: new Conf({ projectName: 'nextjs' }) }
}

export async function getUpgradeDismissal(
  directory: string,
  version: string,
  policy: NudgeKind
): Promise<NudgeKind | null> {
  try {
    const { key, preferences } = await getUpgradePreferences(directory)
    for (const kind of ['security', 'latest', 'experimental-future'] as const) {
      if (preferences.get(`${key}.${kind}`) === `${version}:${policy}`) {
        return kind
      }
    }
  } catch {
    // A preferences failure must not prevent assessing or skipping a reminder.
  }
  return null
}
