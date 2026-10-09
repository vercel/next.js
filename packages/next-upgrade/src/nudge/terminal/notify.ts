import * as Log from '../../shared/log'
import type { UpgradeReminder } from '../../shared/check-upgrade'
import type { UpgradeAction } from './prompt'
import { getUpgradePreferences } from './preferences'

// Next supplies its CI decision; terminal input and rendering belong to this package.
export function canPromptForUpgrade(
  forceTerminal: boolean,
  isCI: boolean
): boolean {
  return (
    (!isCI || forceTerminal) &&
    Boolean(process.stdin.isTTY && process.stdout.isTTY) &&
    process.env.TERM !== 'dumb'
  )
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
