import { execFile } from 'child_process'
import { createHash, randomUUID } from 'crypto'
import { mkdir, readFile, realpath, rename, rm, writeFile } from 'fs/promises'
import { basename, dirname, join, relative, resolve } from 'path'
import { promisify } from 'util'
import { updateInitialEnv } from '@next/env'

import * as Log from '../../build/output/log'
import type { NextConfigComplete } from '../../server/config-shared'
import semver from 'next/dist/compiled/semver'
import type { UpgradeAction } from './prompt'
import { getAgentName } from '../../telemetry/agent-name'
import { futureDefaults, getPendingFutureDefaults } from './future-defaults'
import { isCI } from '../../server/ci-info'

type NudgeOptions = {
  directory: string
  distDir: string
  command: 'dev' | 'build'
}

export type NudgeKind = 'security' | 'latest' | 'future'

function getRequestedUpgrade() {
  const policy = process.env.__NEXT_AGENTIC_AUTO_UPGRADE
  return policy === 'security' || policy === 'latest' || policy === 'future'
    ? policy
    : null
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

export type UpgradeContext = Pick<
  NextConfigComplete,
  'distDir' | 'cacheComponents'
> & {
  experimental: Pick<NextConfigComplete['experimental'], 'agenticAutoUpgrade'>
}

type UpgradeReminder = {
  policy: NudgeKind
  installedVersion: string
} & (
  | {
      kind: 'security'
      reference: string | null
      targetVersion: string | null
      unavailableReason: string | null
    }
  | { kind: 'latest'; latestVersion: string | null; names: string[] }
  | { kind: 'future'; targetVersion: string; names: string[] }
)

export function getUpgradeContext(config: NextConfigComplete): UpgradeContext {
  return {
    distDir: config.distDir,
    cacheComponents: config.cacheComponents,
    experimental: {
      agenticAutoUpgrade:
        getRequestedUpgrade() ?? config.experimental.agenticAutoUpgrade,
    },
  }
}

export async function assessUpgrade(
  directory: string,
  config: UpgradeContext,
  installedVersion: string = process.env.__NEXT_VERSION || 'unknown',
  stopBefore: NudgeKind | null = null,
  forceVersionReminder: boolean = false
): Promise<UpgradeReminder | null> {
  const policy = config.experimental.agenticAutoUpgrade
  if (policy !== 'security' && policy !== 'latest' && policy !== 'future') {
    return null
  }
  if (stopBefore === 'security') {
    return null
  }

  if (
    !semver.valid(installedVersion) ||
    (semver.prerelease(installedVersion) &&
      semver.prerelease(installedVersion)?.[0] !== 'canary')
  ) {
    return null
  }
  const { getUpgradeAssessment, getLatestUpgradeVersion } =
    require('./prepare-upgrade') as typeof import('./prepare-upgrade')
  let assessment
  try {
    assessment = await getUpgradeAssessment(
      installedVersion,
      policy,
      stopBefore === 'latest'
    )
  } catch {
    Log.warn(
      'Could not check Next.js security advisories. Continuing without an upgrade assessment.'
    )
    return null
  }
  const { upgrade } = assessment
  if (assessment.affected) {
    return {
      kind: 'security',
      policy,
      installedVersion,
      reference: assessment.reference,
      targetVersion: upgrade.status === 'ready' ? upgrade.targetVersion : null,
      unavailableReason:
        upgrade.status === 'ready'
          ? null
          : `${upgrade.status === 'unknown' ? 'Upgrade availability could not be checked.' : 'No safe newer target is available for the configured upgrade policy.'} ${upgrade.reason}`,
    }
  }
  if (
    upgrade.status !== 'ready' ||
    policy === 'security' ||
    stopBefore === 'latest'
  ) {
    return null
  }
  const latestVersion = getLatestUpgradeVersion(
    installedVersion,
    upgrade.targetVersion
  )
  if (
    latestVersion ||
    (forceVersionReminder && upgrade.targetVersion !== installedVersion)
  ) {
    return {
      kind: 'latest',
      policy,
      installedVersion,
      latestVersion: upgrade.targetVersion,
      names:
        policy === 'future'
          ? getPendingFutureDefaults(
              directory,
              config,
              upgrade.targetVersion
            ).map((entry) => entry.name)
          : [],
    }
  }

  if (policy !== 'future' || stopBefore === 'future') {
    return null
  }
  const pending = getPendingFutureDefaults(directory, config, installedVersion)
  if (pending.length === 0) {
    return null
  }
  return {
    kind: 'future',
    policy,
    installedVersion,
    targetVersion: upgrade.targetVersion,
    names: pending.map((entry) => entry.name),
  }
}

async function nudgeUpgradeForAgent(
  options: NudgeOptions,
  reminder: UpgradeReminder,
  preview: boolean
): Promise<void> {
  let summary: string
  let recommendation: string
  let reference: string | null = null
  switch (reminder.kind) {
    case 'security':
      summary =
        'Your version of Next.js is affected by a published security advisory.'
      recommendation = 'We strongly recommend you upgrade Next.js.'
      reference = reminder.reference
      break
    case 'latest':
      summary = `Next.js ${reminder.latestVersion ?? '[latest version]'} is available. You're using ${reminder.installedVersion}.`
      recommendation = 'We recommend you upgrade Next.js.'
      reference = `https://registry.npmjs.org/next/${semver.prerelease(reminder.latestVersion ?? reminder.installedVersion)?.[0] === 'canary' ? 'canary' : 'latest'}`
      break
    case 'future':
      summary = `Installed Next.js ${reminder.installedVersion} includes Future Defaults available for this app:\n\n${reminder.names.map((name) => `- ${name}`).join('\n')}`
      recommendation = 'We recommend you adopt these Future Defaults.'
      break
  }
  const unavailableReason =
    reminder.kind === 'security' ? reminder.unavailableReason : null
  const command = unavailableReason
    ? null
    : `next upgrade --ai=${reminder.policy}`
  const note = getRequestedUpgrade()
    ? `Note: This reminder is enabled by \`__NEXT_AGENTIC_AUTO_UPGRADE=${reminder.policy}\`.`
    : `Note: This reminder is enabled by \`experimental.agenticAutoUpgrade: '${reminder.policy}'\`.`
  let message = `${summary}

**${recommendation}**

This command stopped so the reminder you configured is not missed. Retry the same command to continue the original task.

When you report back to the user, include this upgrade recommendation even if the retry succeeds.

${
  command
    ? `At the end of the task, ask the user whether they want you to run the upgrade using the configured '${reminder.policy}' policy in the background in a separate Git worktree unless they request otherwise. Run this command from this app's directory:

\`\`\`
${command}
\`\`\``
    : unavailableReason
}

${reference ? `Reference: ${reference}\n\n` : ''}${note}`
  if (preview) {
    message = `Forced preview: this reminder does not establish upgrade eligibility.\n\n${message}`
  }
  let retryAllowed = false
  try {
    retryAllowed = await allowNudgeRetry(
      options,
      reminder.installedVersion,
      reminder.kind
    )
  } catch {
    Log.warn(
      'Could not prepare an upgrade retry. This command will remain blocked.'
    )
  }
  if (retryAllowed) {
    Log.warn(
      `${summary} This command is continuing after the reminder you configured.${unavailableReason ? `\n${unavailableReason}` : ''}${reference ? `\nReference: ${reference}` : ''}`
    )
    return
  }
  const error = new Error(message)
  error.name =
    reminder.kind === 'security' ? 'SecurityFatalError' : 'UpgradeNudgeError'
  Object.assign(error, { exitCode: 1 })
  throw error
}

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
  const key = `ai-upgrade.${name}.${hash}`
  // Upgrade preferences share Next.js' global config location, not telemetry consent.
  return { key, preferences: new Conf({ projectName: 'nextjs' }) }
}

function canPromptForUpgrade(): boolean {
  return (
    !isCI &&
    Boolean(process.stdin.isTTY && process.stdout.isTTY) &&
    process.env.TERM !== 'dumb'
  )
}

async function getUpgradeDismissal(
  directory: string,
  version: string,
  policy: NudgeKind
): Promise<NudgeKind | null> {
  try {
    const { key, preferences } = await getUpgradePreferences(directory)
    for (const kind of ['security', 'latest', 'future'] as const) {
      if (preferences.get(`${key}.${kind}`) === `${version}:${policy}`) {
        return kind
      }
    }
  } catch {
    // A preferences failure must not prevent assessing or skipping a reminder.
  }
  return null
}

async function nudgeUpgradeForHuman(
  directory: string,
  reminder: UpgradeReminder,
  signal: AbortSignal,
  preview: boolean
): Promise<UpgradeAction> {
  if (signal.aborted) {
    return 'skip'
  }
  let message: string
  let canUpgrade = true
  if (reminder.kind === 'security') {
    message = `⚠ Installed Next.js version ${reminder.installedVersion} is affected by a known security vulnerability.`
    canUpgrade = reminder.unavailableReason === null
    message += `\n\n${reminder.unavailableReason ?? `Next.js security version upgrade available: ${reminder.installedVersion} -> ${reminder.targetVersion ?? '[target version]'}`}`
  } else if (reminder.policy === 'future') {
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
  if (preview) {
    message = `Forced preview: __NEXT_AGENTIC_AUTO_UPGRADE=${reminder.policy}. Upgrade eligibility has not been established.\n\n${message}`
  }
  const { promptUpgrade } = require('./prompt') as typeof import('./prompt')
  const action = await promptUpgrade(message, signal, canUpgrade)
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

export async function runUpgrade(directory: string, policy: NudgeKind) {
  // The agent's dev/build commands must not trigger this explicit request again.
  delete process.env.__NEXT_AGENTIC_AUTO_UPGRADE
  updateInitialEnv({ __NEXT_AGENTIC_AUTO_UPGRADE: undefined })
  const { spawnNextUpgrade } = await import('../../cli/next-upgrade.js')
  await spawnNextUpgrade(directory, {
    revision: 'latest',
    verbose: false,
    ai: policy,
  })
  return process.exitCode ?? 0
}

export async function shouldPromptForUpgrade(): Promise<boolean> {
  return canPromptForUpgrade() && !(await getAgentName())
}

export async function nudgeUpgrade(
  directory: string,
  config: UpgradeContext,
  command: 'dev' | 'build',
  signal: AbortSignal | null = null
): Promise<UpgradeAction | void> {
  const requested = getRequestedUpgrade()
  const policy = requested ?? config.experimental.agenticAutoUpgrade
  if (policy !== 'security' && policy !== 'latest' && policy !== 'future') {
    return
  }
  if (requested && isCI) {
    return
  }
  const agent = await getAgentName()
  const installedVersion = process.env.__NEXT_VERSION || 'unknown'
  let stopBefore: NudgeKind | null = null
  if (!agent) {
    if (!signal || signal.aborted) {
      return
    }
    if (!canPromptForUpgrade()) {
      return
    }
    if (!requested) {
      stopBefore = await getUpgradeDismissal(
        directory,
        installedVersion,
        policy
      )
    }
    if (signal.aborted) {
      return
    }
  }
  let reminder = await assessUpgrade(
    directory,
    { ...config, experimental: { agenticAutoUpgrade: policy } },
    installedVersion,
    stopBefore,
    requested !== null
  )
  const preview = !reminder && requested !== null
  if (preview) {
    // Exercise the real template without inventing an advisory or release.
    // Update still runs the normal eligibility checks against this installation.
    const context = { policy, installedVersion }
    switch (requested) {
      case 'security':
        reminder = {
          ...context,
          kind: 'security',
          reference: null,
          targetVersion: null,
          unavailableReason: null,
        }
        break
      case 'latest':
        reminder = {
          ...context,
          kind: 'latest',
          latestVersion: null,
          names: [],
        }
        break
      case 'future':
        reminder = {
          ...context,
          kind: 'future',
          targetVersion: installedVersion,
          names: futureDefaults.map((entry) => entry.name),
        }
        break
    }
  }
  if (!reminder || signal?.aborted) {
    return
  }
  if (agent) {
    await nudgeUpgradeForAgent(
      { directory, distDir: config.distDir, command },
      reminder,
      preview
    )
  } else if (signal) {
    return nudgeUpgradeForHuman(directory, reminder, signal, preview)
  }
}
