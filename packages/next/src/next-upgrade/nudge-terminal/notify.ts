import { execFile } from 'child_process'
import { createHash } from 'crypto'
import { realpath } from 'fs/promises'
import { basename, dirname, relative, resolve } from 'path'
import { promisify } from 'util'
import * as Log from '../../build/output/log'
import { isCI } from '../../server/ci-info'
import type { NudgeKind } from '../nudge'
import type { UpgradeReminder } from '../shared/check-upgrade'
import type { UpgradeAction } from './prompt'

async function getUpgradePreferences(directory: string) {
  const Conf =
    require('next/dist/compiled/conf') as typeof import('next/dist/compiled/conf')
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

export function canPromptForUpgrade(forceTerminal: boolean): boolean {
  return (
    (!isCI || forceTerminal) &&
    Boolean(process.stdin.isTTY && process.stdout.isTTY) &&
    process.env.TERM !== 'dumb'
  )
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

export async function nudgeUpgradeForHuman(
  directory: string,
  reminder: UpgradeReminder,
  signal: AbortSignal,
  onShown: (() => void) | null
): Promise<UpgradeAction> {
  if (signal.aborted) {
    return 'skip'
  }
  let message: string
  if (reminder.kind === 'security') {
    message = `⚠ Installed Next.js version ${reminder.installedVersion} is affected by a known security vulnerability.`
    message += `\n\nNext.js security version upgrade available: ${reminder.installedVersion} -> ${reminder.targetVersion}`
  } else if (reminder.policy === 'experimental-future') {
    const targetVersion =
      reminder.kind === 'latest'
        ? reminder.latestVersion
        : reminder.targetVersion
    const versions =
      targetVersion !== reminder.installedVersion
        ? ` ${reminder.installedVersion} -> ${targetVersion ?? '[target version]'}`
        : ''
    message = `Next.js Future Default upgrade available:${versions}`
    if (reminder.names.length > 0) {
      message += `\n\n${reminder.names.map((name) => `- ${name}`).join('\n')}`
    }
  } else if (reminder.kind === 'latest') {
    message = `Next.js latest version upgrade available: ${reminder.installedVersion} -> ${reminder.latestVersion ?? '[target version]'}`
  } else {
    return 'skip'
  }
  const { promptUpgrade } = require('./prompt') as typeof import('./prompt')
  const action = await promptUpgrade({
    message,
    signal,
    canUpdate: true,
    onShown,
  })
  if (signal.aborted) {
    return 'skip'
  }
  if (action === 'dismiss') {
    try {
      const { key, preferences } = await getUpgradePreferences(directory)
      preferences.set(
        `${key}.${reminder.kind}`,
        `${reminder.installedVersion}:${reminder.policy}`
      )
    } catch {
      Log.warn(
        'Could not save your upgrade reminder preference. Skipping for this session.'
      )
    }
  }
  return action
}
