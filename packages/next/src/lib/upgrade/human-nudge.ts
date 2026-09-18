import { emitKeypressEvents, type Key } from 'readline'
import * as Log from '../../build/output/log'
import { isCI } from '../../server/ci-info'
import type { NextConfigComplete } from '../../server/config-shared'
import { getAgentName } from '../../telemetry/agent-name'
import { cyan } from '../picocolors'
import { getSecurityAdvisory } from './prepare-upgrade'
import {
  getUpgradePreferenceKey,
  upgradePreferences,
} from './human-preferences'
import { runChildProcess } from './run-child-process'

export type HumanUpgradeContext = {
  policy: NextConfigComplete['experimental']['agenticAutoUpgrade']
}

export type HumanUpgradeNudge = {
  kind: 'security'
  policy: 'security' | 'latest' | 'future'
  installedVersion: string
  message: string
  preferenceKey: string
}

export async function assessHumanUpgrade(
  directory: string,
  context: HumanUpgradeContext,
  installedVersion: string = process.env.__NEXT_VERSION || 'unknown'
): Promise<HumanUpgradeNudge | null> {
  const { policy } = context
  if (
    (policy !== 'security' && policy !== 'latest' && policy !== 'future') ||
    isCI ||
    !process.stdin.isTTY ||
    !process.stdout.isTTY ||
    (await getAgentName())
  )
    return null

  try {
    const preferenceKey = await getUpgradePreferenceKey(directory)
    let preferences: ReturnType<typeof upgradePreferences> | null = null
    try {
      preferences = upgradePreferences()
    } catch {}
    if (
      preferences?.isDismissed(
        preferenceKey,
        'security',
        installedVersion,
        policy
      )
    )
      return null
    const advisory = await getSecurityAdvisory(installedVersion)
    if (!advisory) return null
    return {
      kind: 'security',
      policy,
      installedVersion,
      preferenceKey,
      message: `Your version of Next.js is affected by a published security advisory.\nWe strongly recommend you upgrade Next.js.\nReference: ${advisory.reference}`,
    }
  } catch {
    // Human reminders must never turn a dev session or build into a failure.
    return null
  }
}

export async function promptHumanUpgrade(
  nudge: HumanUpgradeNudge,
  signal: AbortSignal
): Promise<boolean> {
  if (signal.aborted) return false
  Log.bootstrap(`\n${nudge.message}\n`)
  const action = await new Promise<'update' | 'skip' | 'dismiss'>(
    (resolveAction) => {
      const input = process.stdin
      const output = process.stdout
      const wasRaw = input.isRaw
      const wasPaused = input.isPaused()
      const choices = ['Update now', 'Skip', 'Skip until next version']
      let selected = 0
      let rendered = false
      let finished = false
      const clear = () => {
        if (rendered) output.write('\r\x1b[2K\x1b[1A\x1b[2K\x1b[1A\x1b[2K\r')
      }
      const render = () => {
        clear()
        output.write(
          choices
            .map((text, index) =>
              index === selected ? cyan(`❯ ${text}`) : `  ${text}`
            )
            .join('\n')
        )
        rendered = true
      }
      const finish = (choice: 'update' | 'skip' | 'dismiss') => {
        if (finished) return
        finished = true
        input.removeListener('keypress', onKey)
        signal.removeEventListener('abort', onAbort)
        process.removeListener('SIGINT', onAbort)
        process.removeListener('SIGTERM', onAbort)
        try {
          input.setRawMode(wasRaw)
        } catch {
          choice = 'skip'
        }
        try {
          if (wasPaused) input.pause()
          clear()
          output.write('\x1b[?25h')
        } catch {
          choice = 'skip'
        }
        resolveAction(choice)
      }
      const onAbort = () => finish('skip')
      const onKey = (_text: string, key: Key) => {
        if (key.ctrl && key.name === 'c') {
          finish('skip')
          process.kill(process.pid, 'SIGINT')
        } else if (key.name === 'escape') finish('skip')
        else if (key.name === 'return')
          finish((['update', 'skip', 'dismiss'] as const)[selected])
        else if (key.name === 'up' || key.name === 'down') {
          selected = (selected + (key.name === 'up' ? 2 : 1)) % choices.length
          render()
        }
      }
      emitKeypressEvents(input)
      input.on('keypress', onKey)
      signal.addEventListener('abort', onAbort, { once: true })
      process.prependOnceListener('SIGINT', onAbort)
      process.prependOnceListener('SIGTERM', onAbort)
      try {
        input.setRawMode(true)
        input.resume()
        output.write('\x1b[?25l')
        render()
      } catch {
        finish('skip')
      }
    }
  )
  if (action === 'dismiss') {
    try {
      upgradePreferences().dismiss(
        nudge.preferenceKey,
        nudge.kind,
        nudge.installedVersion,
        nudge.policy
      )
    } catch {
      Log.warn(
        'Could not save your upgrade reminder preference. Skipping for this session.'
      )
    }
  }
  return action === 'update' && !signal.aborted
}

export function runHumanUpgrade(
  directory: string,
  policy: HumanUpgradeNudge['policy']
) {
  return runChildProcess(
    process.execPath,
    [require.resolve('../../bin/next'), 'upgrade', directory, `--ai=${policy}`],
    {
      cwd: directory,
      stdio: 'inherit',
    }
  )
}
