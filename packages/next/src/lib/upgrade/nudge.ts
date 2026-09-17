import { createHash, randomUUID } from 'crypto'
import { mkdir, readFile, realpath, rename, rm, writeFile } from 'fs/promises'
import { join, resolve } from 'path'

import * as Log from '../../build/output/log'
import type { NextConfigComplete } from '../../server/config-shared'
import { getAgentName } from '../../telemetry/agent-name'

type SecurityNudgeOptions = {
  directory: string
  distDir: string
  command: 'dev' | 'build'
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

async function allowSecurityRetry(
  { directory, distDir, command }: SecurityNudgeOptions,
  version: string
): Promise<boolean> {
  const project = await realpath(directory)
  const identity = createHash('sha256')
    .update(`${project}\0${version}\0${command}`)
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

async function nudgeForSecurity(options: SecurityNudgeOptions): Promise<void> {
  let advisory
  const version = process.env.__NEXT_VERSION || 'unknown'

  try {
    if (!(await getAgentName())) {
      return
    }

    // Reuse upgrade's advisory readers only after detecting an agent.
    const { getSecurityAdvisory } =
      require('./prepare-upgrade') as typeof import('./prepare-upgrade')
    advisory = await getSecurityAdvisory(version)
  } catch {
    Log.warn(
      'Could not check Next.js security advisories. Continuing without an upgrade assessment.'
    )
    return
  }

  if (!advisory) {
    return
  }

  const { reference } = advisory
  let retryAllowed = false
  try {
    retryAllowed = await allowSecurityRetry(options, version)
  } catch {
    Log.warn(
      'Could not prepare a security retry. This command will remain blocked.'
    )
  }

  if (retryAllowed) {
    Log.warn(
      `Your version of Next.js is affected by a published security advisory. This command is continuing after the reminder you configured.\nReference: ${reference}`
    )
    return
  }

  const error =
    new Error(`Your version of Next.js is affected by a published security advisory and can be automatically upgraded.

**We strongly recommend you upgrade Next.js.**

This command stopped so the reminder you configured is not missed. Retry the same command to continue the original task.

At the end of the task, ask the user whether they want you to run the security upgrade in the background from this app's directory:

\`\`\`
next upgrade --ai
\`\`\`

Reference: ${reference}

Note: This security gate is enabled by \`experimental.agenticAutoUpgrade: 'security'\`.`)
  error.name = 'SecurityFatalError'
  Object.assign(error, { exitCode: 1 })
  throw error
}

export async function nudgeForUpgrade(
  directory: string,
  config: NextConfigComplete,
  command: 'dev' | 'build'
): Promise<void> {
  if (config.experimental.agenticAutoUpgrade !== 'security') {
    return
  }

  await nudgeForSecurity({ directory, distDir: config.distDir, command })
}
