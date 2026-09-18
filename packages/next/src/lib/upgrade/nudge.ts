import { createHash, randomUUID } from 'crypto'
import { mkdir, readFile, realpath, rename, rm, writeFile } from 'fs/promises'
import { join, resolve } from 'path'

import semver from 'next/dist/compiled/semver'

import * as Log from '../../build/output/log'
import type { NextConfigComplete } from '../../server/config-shared'
import { getAgentName } from '../../telemetry/agent-name'
import { futureDefaults } from './future-defaults'

type SecurityNudgeOptions = {
  directory: string
  distDir: string
  command: 'dev' | 'build'
}

type NudgeKind = 'security' | 'latest' | 'future'

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
  { directory, distDir, command }: SecurityNudgeOptions,
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
  options: SecurityNudgeOptions,
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

async function getLatestUpgrade(
  installedVersion: string = process.env.__NEXT_VERSION || 'unknown'
): Promise<{ installedVersion: string; latestVersion: string } | null> {
  try {
    if (!(await getAgentName())) {
      return null
    }

    const { getLatestUpgradeVersion } =
      require('./prepare-upgrade') as typeof import('./prepare-upgrade')
    const latestVersion = await getLatestUpgradeVersion(installedVersion)

    if (!latestVersion) {
      return null
    }

    return { installedVersion, latestVersion }
  } catch {
    // A release reminder is best-effort; lookup failures should stay quiet.
    return null
  }
}

async function nudgeForSecurity(
  options: SecurityNudgeOptions,
  policy: 'security' | 'latest' | 'future'
): Promise<boolean> {
  let advisory
  const version = process.env.__NEXT_VERSION || 'unknown'

  try {
    if (!(await getAgentName())) {
      return false
    }

    // Reuse upgrade's advisory readers only after detecting an agent.
    const { getSecurityAdvisory } =
      require('./prepare-upgrade') as typeof import('./prepare-upgrade')
    advisory = await getSecurityAdvisory(version)
  } catch {
    Log.warn(
      'Could not check Next.js security advisories. Continuing without an upgrade assessment.'
    )
    return false
  }

  if (!advisory) {
    return false
  }

  const { reference } = advisory
  await showNudge(
    options,
    version,
    'security',
    `Your version of Next.js is affected by a published security advisory and can be automatically upgraded.

**We strongly recommend you upgrade Next.js.**

This command stopped so the reminder you configured is not missed. Retry the same command to continue the original task.

At the end of the task, ask the user whether they want you to run the security upgrade in the background from this app's directory:

\`\`\`
next upgrade --ai
\`\`\`

Reference: ${reference}

Note: This security gate is enabled by \`experimental.agenticAutoUpgrade: '${policy}'\`.`,
    `Your version of Next.js is affected by a published security advisory. This command is continuing after the reminder you configured.\nReference: ${reference}`,
    'SecurityFatalError'
  )
  return true
}

async function nudgeForLatest(
  options: SecurityNudgeOptions,
  policy: 'latest' | 'future'
): Promise<boolean> {
  const version = process.env.__NEXT_VERSION || 'unknown'
  const latest = await getLatestUpgrade(version)
  if (!latest) return false

  const { installedVersion, latestVersion } = latest
  const reference = 'https://registry.npmjs.org/next/latest'
  await showNudge(
    options,
    version,
    'latest',
    `Next.js ${latestVersion} is available. You're using ${installedVersion}.

**We recommend you upgrade Next.js.**

This command stopped so the reminder you configured is not missed. Retry the same command to continue the original task.

At the end of the task, ask the user whether they want you to run the latest upgrade in the background from this app's directory:

\`\`\`
next upgrade --ai
\`\`\`

Reference: ${reference}

Note: This reminder is enabled by \`experimental.agenticAutoUpgrade: '${policy}'\`.`,
    `Next.js ${latestVersion} is available. This command is continuing after the reminder you configured.\nReference: ${reference}`,
    'UpgradeNudgeError'
  )
  return true
}

export async function getFutureUpgrade(
  config: NextConfigComplete,
  installedVersion: string = process.env.__NEXT_VERSION || 'unknown'
): Promise<{ installedVersion: string; names: string[] } | null> {
  try {
    if (
      !(await getAgentName()) ||
      !semver.valid(installedVersion) ||
      semver.prerelease(installedVersion)
    ) {
      return null
    }

    const available = futureDefaults.filter(
      (futureDefault) =>
        semver.gte(installedVersion, futureDefault.availableSince) &&
        !futureDefault.isAdopted(config)
    )

    if (available.length === 0) {
      return null
    }

    return {
      installedVersion,
      names: available.map((futureDefault) => futureDefault.name),
    }
  } catch {
    // A Future Defaults reminder is best-effort; failures should stay quiet.
    return null
  }
}

async function nudgeForFuture(
  options: SecurityNudgeOptions,
  config: NextConfigComplete
): Promise<void> {
  const version = process.env.__NEXT_VERSION || 'unknown'
  const future = await getFutureUpgrade(config, version)
  if (!future) return

  const defaults = future.names.map((name) => `- ${name}`).join('\n')
  await showNudge(
    options,
    version,
    'future',
    `Installed Next.js ${future.installedVersion} includes Future Defaults available for this app:

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
  const policy = config.experimental.agenticAutoUpgrade
  if (policy !== 'security' && policy !== 'latest' && policy !== 'future') {
    return
  }

  const options = { directory, distDir: config.distDir, command }
  if (await nudgeForSecurity(options, policy)) return

  if (policy === 'latest' || policy === 'future') {
    if (await nudgeForLatest(options, policy)) return
  }

  if (policy === 'future') {
    await nudgeForFuture(options, config)
  }
}
