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
import { getPendingFutureDefaults } from './future-defaults'
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
      targetVersion: string
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

  if (!semver.valid(installedVersion)) {
    return null
  }
  const {
    getPrereleaseChannel,
    getUpgradeAssessment,
    getLatestUpgradeVersion,
  } = require('./prepare-upgrade') as typeof import('./prepare-upgrade')
  if (
    semver.prerelease(installedVersion) &&
    !getPrereleaseChannel(installedVersion)
  ) {
    return null
  }
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
  if (upgrade.status !== 'ready') {
    // TODO: Record affected and upgrade.status in telemetry so we can see when
    // an advisory applies but no ready target was available to nudge.
    return null
  }
  if (assessment.affected) {
    return {
      kind: 'security',
      policy,
      installedVersion,
      reference: assessment.reference,
      targetVersion: upgrade.targetVersion,
    }
  }
  if (policy === 'security' || stopBefore === 'latest') {
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
  reminder: UpgradeReminder
): Promise<void> {
  let summary: string
  let recommendation: string
  let reference: string | null = null
  switch (reminder.kind) {
    case 'security':
      summary =
        'Your version of Next.js is affected by a known security vulnerability.'
      recommendation = 'We strongly recommend you upgrade Next.js.'
      reference = reminder.reference
      break
    case 'latest':
      summary = `Next.js ${reminder.latestVersion ?? '[latest version]'} is available. You're using ${reminder.installedVersion}.`
      recommendation = 'We recommend you upgrade Next.js.'
      reference = `https://registry.npmjs.org/next/${semver.prerelease(reminder.installedVersion)?.[0] === 'canary' ? 'canary' : 'latest'}`
      break
    case 'future':
      summary = `Installed Next.js ${reminder.installedVersion} includes Future Defaults available for this app:\n\n${reminder.names.map((name) => `- ${name}`).join('\n')}`
      recommendation = 'We recommend you adopt these Future Defaults.'
      break
  }
  const command = `next upgrade --ai=${reminder.policy}`
  const note = getRequestedUpgrade()
    ? `Note: This reminder is enabled by \`__NEXT_AGENTIC_AUTO_UPGRADE=${reminder.policy}\`.`
    : `Note: This reminder is enabled by \`experimental.agenticAutoUpgrade: '${reminder.policy}'\`.`
  const message = `${summary}

**${recommendation}**

This command stopped so the reminder you configured is not missed. Retry the same command to continue the original task.

When you report back to the user, include this upgrade recommendation even if the retry succeeds.

At the end of the task, ask the user once: "Would you like me to run the '${reminder.policy}' upgrade in the background in a separate Git worktree? I can use the current checkout if you prefer." If the app is not in Git, say it will run in place. Use their worktree choice and continue in this agent session. Run this command from this app's directory:

\`\`\`
${command}
\`\`\`

${reference ? `Reference: ${reference}\n\n` : ''}${note}`
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
      `${summary} This command is continuing after the reminder you configured.${reference ? `\nReference: ${reference}` : ''}`
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

// The terminal test needs a menu in CI without an agent or live advisory.
function isUpgradeTerminalForcedForTesting(): boolean {
  return process.env.__NEXT_AGENT_UPGRADE_FORCE_TERMINAL_FOR_TESTING === '1'
}

function canPromptForUpgrade(): boolean {
  return (
    (!isCI || isUpgradeTerminalForcedForTesting()) &&
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

export type UpgradeNudge = {
  message: string
  policy: NudgeKind
  reminder: UpgradeReminder | null
}

/**
 * Let either the direct CLI or terminal supervisor display the same human
 * nudge. Resolve policy, dismissal, and advisory into a message without
 * drawing a prompt or stopping dev; return null when there is no nudge.
 */
export async function prepareUpgradeNudge(
  directory: string,
  config: UpgradeContext,
  signal: AbortSignal
): Promise<UpgradeNudge | null> {
  if (signal.aborted || !(await shouldPromptForUpgrade())) {
    return null
  }
  if (isUpgradeTerminalForcedForTesting()) {
    // Exercise the terminal menu without querying or inventing an advisory.
    return {
      message: 'Next.js upgrade available for terminal testing.',
      policy: 'security',
      reminder: null,
    }
  }
  const requested = getRequestedUpgrade()
  const policy = requested ?? config.experimental.agenticAutoUpgrade
  if (policy !== 'security' && policy !== 'latest' && policy !== 'future') {
    return null
  }
  const installedVersion = process.env.__NEXT_VERSION || 'unknown'
  const stopBefore = requested
    ? null
    : await getUpgradeDismissal(directory, installedVersion, policy)
  if (signal.aborted) {
    return null
  }
  const reminder = await assessUpgrade(
    directory,
    { ...config, experimental: { agenticAutoUpgrade: policy } },
    installedVersion,
    stopBefore,
    requested !== null
  )
  if (!reminder || signal.aborted) {
    return null
  }
  let message: string
  if (reminder.kind === 'security') {
    message = `⚠ Installed Next.js version ${reminder.installedVersion} is affected by a known security vulnerability.`
    message += `\n\nNext.js security version upgrade available: ${reminder.installedVersion} -> ${reminder.targetVersion}`
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
    throw new Error('Unsupported human upgrade reminder.')
  }
  return { message, policy, reminder }
}

/**
 * Persist only Dismiss, so a plain Skip leaves future CLI sessions eligible
 * for a reminder. The terminal and direct prompts share this choice handling.
 */
export async function recordUpgradeNudgeChoice(
  directory: string,
  nudge: UpgradeNudge,
  action: UpgradeAction
): Promise<void> {
  if (action === 'dismiss' && nudge.reminder) {
    try {
      const { key, preferences } = await getUpgradePreferences(directory)
      preferences.set(
        `${key}.${nudge.reminder.kind}`,
        `${nudge.reminder.installedVersion}:${nudge.reminder.policy}`
      )
    } catch {
      Log.warn(
        'Could not save your upgrade reminder preference. Skipping for this session.'
      )
    }
  }
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

// This is terminal eligibility; project policy and advisories are checked later.
export async function shouldPromptForUpgrade(): Promise<boolean> {
  return (
    canPromptForUpgrade() &&
    (isUpgradeTerminalForcedForTesting() || !(await getAgentName()))
  )
}

export async function nudgeUpgrade(
  directory: string,
  config: UpgradeContext,
  command: 'dev' | 'build',
  signal: AbortSignal | null = null
): Promise<UpgradeAction | void> {
  const requested = getRequestedUpgrade()
  const policy = isUpgradeTerminalForcedForTesting()
    ? 'security'
    : (requested ?? config.experimental.agenticAutoUpgrade)
  if (policy !== 'security' && policy !== 'latest' && policy !== 'future') {
    return
  }
  if (requested && isCI && !isUpgradeTerminalForcedForTesting()) {
    return
  }
  const agent = await getAgentName()
  if (!agent || isUpgradeTerminalForcedForTesting()) {
    if (!signal) {
      return
    }
    const nudge = await prepareUpgradeNudge(directory, config, signal)
    if (!nudge) {
      return
    }
    const { promptUpgrade } = require('./prompt') as typeof import('./prompt')
    const action = await promptUpgrade(nudge.message, signal, true)
    if (signal.aborted) {
      return 'skip'
    }
    await recordUpgradeNudgeChoice(directory, nudge, action)
    return action
  }
  const installedVersion = process.env.__NEXT_VERSION || 'unknown'
  const reminder = await assessUpgrade(
    directory,
    { ...config, experimental: { agenticAutoUpgrade: policy } },
    installedVersion,
    null,
    requested !== null
  )
  if (!reminder || signal?.aborted) {
    return
  }
  await nudgeUpgradeForAgent(
    { directory, distDir: config.distDir, command },
    reminder
  )
}
