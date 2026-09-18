import { createHash, randomUUID } from 'crypto'
import { mkdir, readFile, realpath, rename, rm, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import { emitKeypressEvents, type Key } from 'readline'

import semver from 'next/dist/compiled/semver'

import * as Log from '../../build/output/log'
import { isCI } from '../../server/ci-info'
import type { NextConfigComplete } from '../../server/config-shared'
import { getAgentName } from '../../telemetry/agent-name'
import { cyan, dim } from '../picocolors'
import { futureDefaults, type FutureDefaultsConfig } from './future-defaults'
import { getUpgradePreferenceKey, upgradePreferences } from './preferences'
import { runChildProcess } from './run-child-process'

type NudgeOptions = {
  directory: string
  distDir: string
  command: 'dev' | 'build'
}

type NudgeKind = 'security' | 'latest' | 'future'

export type UpgradeContext = FutureDefaultsConfig & {
  policy: NextConfigComplete['experimental']['agenticAutoUpgrade']
}

export type UpgradeNudge = {
  policy: NudgeKind
  installedVersion: string
  preferenceKey: string | null
} & (
  | { kind: 'security'; reference: string }
  | { kind: 'latest'; latestVersion: string }
  | { kind: 'future'; names: string[] }
)

export async function assessUpgrade(
  directory: string,
  context: UpgradeContext,
  audience: 'agent' | 'interactive',
  installedVersion: string = process.env.__NEXT_VERSION || 'unknown'
): Promise<UpgradeNudge | null> {
  const { policy } = context
  if (policy !== 'security' && policy !== 'latest' && policy !== 'future') {
    return null
  }
  if (
    audience === 'interactive' &&
    (isCI || !process.stdin.isTTY || !process.stdout.isTTY)
  ) {
    return null
  }

  try {
    const agent = await getAgentName()
    if ((audience === 'agent') !== Boolean(agent)) return null
  } catch {
    if (audience === 'agent') {
      Log.warn(
        'Could not check Next.js security advisories. Continuing without an upgrade assessment.'
      )
    }
    return null
  }

  try {
    let preferenceKey: string | null = null
    let preferences: ReturnType<typeof upgradePreferences> | null = null
    if (audience === 'interactive') {
      preferenceKey = await getUpgradePreferenceKey(directory)
      try {
        preferences = upgradePreferences()
      } catch {}
    }
    const isDismissed = (kind: NudgeKind) =>
      preferenceKey !== null &&
      preferences?.isDismissed(preferenceKey, kind, installedVersion, policy)
    const nudge = { policy, installedVersion, preferenceKey }

    // Both entry points use the same precedence. A dismissed reminder ends
    // assessment instead of falling through to a lower-priority prompt.
    if (isDismissed('security')) return null
    const { getSecurityAdvisory, getLatestUpgradeVersion } =
      require('./prepare-upgrade') as typeof import('./prepare-upgrade')
    try {
      const advisory = await getSecurityAdvisory(installedVersion)
      if (advisory) {
        return { ...nudge, kind: 'security', reference: advisory.reference }
      }
    } catch {
      if (audience === 'interactive') return null
      Log.warn(
        'Could not check Next.js security advisories. Continuing without an upgrade assessment.'
      )
    }

    if (policy === 'security' || isDismissed('latest')) return null
    try {
      const latestVersion = await getLatestUpgradeVersion(installedVersion)
      if (latestVersion) return { ...nudge, kind: 'latest', latestVersion }
    } catch {
      if (audience === 'interactive') return null
    }

    if (audience === 'interactive') return null
    if (
      policy !== 'future' ||
      !semver.valid(installedVersion) ||
      semver.prerelease(installedVersion)
    ) {
      return null
    }
    const pending = futureDefaults.filter(
      (entry) =>
        semver.gte(installedVersion, entry.availableSince) &&
        !entry.isAdopted(context)
    )
    if (pending.length === 0) return null
    return {
      ...nudge,
      kind: 'future',
      names: pending.map((entry) => entry.name),
    }
  } catch {
    // Assessment failures must not fail the original command.
    return null
  }
}

const RETRY_TTL = 5 * 60 * 1000
const allowedRetries = new Set<string>()

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  )
}

async function writeRetry(path: string, issuedAt: number): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify({ issuedAt }), { mode: 0o600 })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

async function allowNudgeRetry(
  { directory, distDir, command }: NudgeOptions,
  version: string,
  kind: NudgeKind
): Promise<boolean> {
  const project = await realpath(directory)
  const identity = createHash('sha256')
    .update(`${project}\0${version}\0${command}\0${kind}`)
    .digest('hex')

  if (allowedRetries.has(identity)) {
    return true
  }

  const cache = resolve(
    project,
    distDir,
    'cache',
    'next-agentic-upgrade-retries'
  )
  const receipt = join(cache, `${identity}.json`)
  const claimed = `${receipt}.${randomUUID()}.claim`
  await mkdir(cache, { recursive: true })

  try {
    await rename(receipt, claimed)
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) {
      throw error
    }
    await writeRetry(receipt, Date.now())
    return false
  }

  let issuedAt: unknown
  try {
    const value: unknown = JSON.parse(await readFile(claimed, 'utf8'))
    issuedAt =
      typeof value === 'object' && value !== null
        ? Reflect.get(value, 'issuedAt')
        : undefined
  } catch {
    issuedAt = undefined
  } finally {
    await rm(claimed, { force: true })
  }

  const now = Date.now()
  if (
    typeof issuedAt === 'number' &&
    issuedAt <= now &&
    now - issuedAt < RETRY_TTL
  ) {
    allowedRetries.add(identity)
    return true
  }

  await writeRetry(receipt, Date.now())
  return false
}

async function showNudge(
  options: NudgeOptions,
  version: string,
  kind: NudgeKind,
  prompt: string,
  warning: string,
  errorName: string
): Promise<void> {
  let retryAllowed = false
  try {
    retryAllowed = await allowNudgeRetry(options, version, kind)
  } catch {
    Log.warn(
      'Could not prepare an upgrade retry. This command will remain blocked.'
    )
  }

  if (retryAllowed) {
    Log.warn(warning)
    return
  }

  const error = new Error(prompt)
  error.name = errorName
  Object.assign(error, { exitCode: 1 })
  throw error
}

async function nudgeForSecurity(
  options: NudgeOptions,
  nudge: Extract<UpgradeNudge, { kind: 'security' }>
): Promise<void> {
  const { installedVersion: version, policy } = nudge
  await showNudge(
    options,
    version,
    'security',
    `Your version of Next.js is affected by a published security advisory.

We strongly recommend you upgrade Next.js.

This command stopped so the reminder you configured is not missed. Retry the same command to continue the original task.

At the end of the task, ask the user whether they want you to run the security upgrade in the background from this app's directory:

\`\`\`
next upgrade --ai
\`\`\`

Note: This reminder is enabled by \`experimental.agenticAutoUpgrade: '${policy}'\`.`,
    `Your version of Next.js is affected by a published security advisory. This command is continuing after the reminder you configured.`,
    'SecurityFatalError'
  )
}

async function nudgeForLatest(
  options: NudgeOptions,
  nudge: Extract<UpgradeNudge, { kind: 'latest' }>
): Promise<void> {
  const { installedVersion, latestVersion, policy } = nudge
  await showNudge(
    options,
    installedVersion,
    'latest',
    `Next.js ${latestVersion} is available. You're using ${installedVersion}.

This command stopped so the reminder you configured is not missed. Retry the same command to continue the original task.

At the end of the task, ask the user whether they want you to run the latest upgrade in the background from this app's directory:

\`\`\`
next upgrade --ai
\`\`\`

Note: This reminder is enabled by \`experimental.agenticAutoUpgrade: '${policy}'\`.`,
    `Next.js ${latestVersion} is available. This command is continuing after the reminder you configured.`,
    'UpgradeNudgeError'
  )
}

async function nudgeForFuture(
  options: NudgeOptions,
  nudge: Extract<UpgradeNudge, { kind: 'future' }>
): Promise<void> {
  const version = nudge.installedVersion
  const defaults = nudge.names.map((name) => `- ${name}`).join('\n')
  await showNudge(
    options,
    version,
    'future',
    `Installed Next.js ${version} includes Future Defaults available for this app:

${defaults}

**We recommend you adopt these Future Defaults.**

This command stopped so the reminder you configured is not missed. Retry the same command to continue the original task.

At the end of the task, ask the user whether they want you to run the Future Defaults upgrade in the background from this app's directory:

\`\`\`
next upgrade --ai
\`\`\`

Note: This reminder is enabled by \`experimental.agenticAutoUpgrade: 'future'\`.`,
    `Future Defaults are available for this app. This command is continuing after the reminder you configured.`,
    'UpgradeNudgeError'
  )
}

export async function nudgeForUpgrade(
  directory: string,
  config: NextConfigComplete,
  command: 'dev' | 'build'
): Promise<void> {
  const nudge = await assessUpgrade(
    directory,
    {
      policy: config.experimental.agenticAutoUpgrade,
      cacheComponents: config.cacheComponents,
    },
    'agent'
  )
  if (!nudge) return

  const options = { directory, distDir: config.distDir, command }
  switch (nudge.kind) {
    case 'security':
      return nudgeForSecurity(options, nudge)
    case 'latest':
      return nudgeForLatest(options, nudge)
    case 'future':
      return nudgeForFuture(options, nudge)
  }
}

export async function promptUpgrade(
  nudge: UpgradeNudge,
  signal: AbortSignal
): Promise<boolean> {
  if (signal.aborted) return false
  let message: string
  switch (nudge.kind) {
    case 'security':
      message = `Your version of Next.js is affected by a published security advisory.

We strongly recommend you upgrade Next.js.`
      break
    case 'latest':
      message = `Next.js ${nudge.latestVersion} is available. You're using ${nudge.installedVersion}.`
      break
    default:
      return false
  }
  Log.warn()
  Log.warn(`${message}

${dim(`Note: This reminder is enabled by \`experimental.agenticAutoUpgrade: '${nudge.policy}'\`.`)}
`)
  const action = await new Promise<'update' | 'skip' | 'dismiss'>(
    (resolveAction) => {
      const input = process.stdin
      const output = process.stdout
      const wasRaw = input.isRaw
      const wasFlowing = input.readableFlowing
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
          // An untouched stream is neither flowing nor explicitly paused.
          // Restore both idle and paused streams instead of leaving a read open.
          if (wasFlowing !== true) input.pause()
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
  if (action === 'dismiss' && nudge.preferenceKey !== null) {
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

export function runUpgrade(directory: string, policy: UpgradeNudge['policy']) {
  return runChildProcess(
    process.execPath,
    [require.resolve('../../bin/next'), 'upgrade', directory, `--ai=${policy}`],
    {
      cwd: directory,
      stdio: 'inherit',
    }
  )
}
