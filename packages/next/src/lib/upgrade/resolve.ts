import { readFile, stat } from 'fs/promises'
import { createRequire } from 'module'
import { join, resolve } from 'path'
import { resetEnv } from '@next/env'
import semver from 'next/dist/compiled/semver'
import loadConfig from '../../server/config'
import { PHASE_INFO } from '../../shared/lib/constants'
import { getNpxCommand } from '../helpers/get-npx-command'
import {
  fetchJSON,
  NPM_REGISTRY,
  readSecuritySnapshot,
  selectSecurityTarget,
} from './security'
import type { SecuritySnapshot } from './security'

export type UpgradeResolution =
  | {
      status: 'disabled' | 'unaffected' | 'blocked'
      reason: string
    }
  | {
      status: 'ready'
      app: {
        directory: string
        nextVersion: string
      }
      targetVersion: string
      tools: {
        command: string
        args: string[]
      }
      snapshot: SecuritySnapshot
    }

async function exists(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isDirectory()
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code

    if (code !== 'ENOENT' && code !== 'ENOTDIR') {
      throw error
    }

    return false
  }
}

async function hasUpgradeRouter(directory: string): Promise<boolean> {
  for (const router of ['app', 'pages'] as const) {
    if (
      (await exists(join(directory, router))) ||
      (await exists(join(directory, 'src', router)))
    ) {
      return true
    }
  }

  return false
}

async function readPackageVersion(
  name: string,
  revision: string
): Promise<string> {
  const { value } = await fetchJSON(
    `${NPM_REGISTRY}${encodeURIComponent(name)}/${encodeURIComponent(revision)}`
  )

  if (
    !value ||
    typeof value !== 'object' ||
    !('version' in value) ||
    typeof value.version !== 'string' ||
    semver.valid(value.version) !== value.version
  ) {
    throw new Error(`${name}@${revision} must resolve to an exact version.`)
  }

  return value.version
}

export async function resolveUpgrade(input: {
  directory: string
  revision: string | undefined
}): Promise<UpgradeResolution> {
  try {
    const appDirectory = resolve(input.directory)

    // Identify the app before loading config or fetching metadata. A config
    // file is optional; the selected directory must contain an app or pages router.
    const hasRouter = await hasUpgradeRouter(appDirectory)

    if (!hasRouter) {
      return {
        status: 'disabled',
        reason:
          `No App Router or Pages Router directory found in ${appDirectory}. ` +
          'Run from the app directory or pass it explicitly: next upgrade <app-directory> --experimental-agent.',
      }
    }

    // The flag selects agent execution, but the app's config controls opt-in.
    // Config assessment loads production dotenv files. Remove those additions
    // before child commands choose their own development or production env.
    const config = await loadConfig(PHASE_INFO, appDirectory).finally(resetEnv)
    const policy = config.experimental?.agenticAutoUpgrade

    if (policy === undefined) {
      return {
        status: 'disabled',
        reason:
          "Set experimental.agenticAutoUpgrade to 'security' to enable agent upgrades.",
      }
    }

    if (policy !== 'security') {
      throw new Error('Unsupported agenticAutoUpgrade policy.')
    }

    // Assess the installed version, not the dependency range in package.json.
    const requireFromApp = createRequire(join(appDirectory, 'package.json'))
    const next = JSON.parse(
      await readFile(requireFromApp.resolve('next/package.json'), 'utf8')
    )
    const app = {
      directory: appDirectory,
      nextVersion: next.version,
    }

    // Fetch fresh evidence on every invocation. Unaffected apps exit before
    // any codemod resolution or agent handoff.
    const snapshot = await readSecuritySnapshot()
    const targetRelease = selectSecurityTarget(
      app.nextVersion,
      snapshot,
      new Date()
    )

    if (!targetRelease) {
      return {
        status: 'unaffected',
        reason: `Next.js ${app.nextVersion} matches no reviewed, nonwithdrawn Next.js advisory in this snapshot.`,
      }
    }

    // A preceding dev/build check can pass the target it suggested. Refresh
    // security evidence, then ensure that suggestion still matches the policy.
    const revision = input.revision
      ? await readPackageVersion('next', input.revision)
      : undefined

    if (revision && revision !== targetRelease.version) {
      throw new Error(
        `The supplied target conflicts with the current security target ${targetRelease.version}.`
      )
    }

    if (
      !targetRelease.nodeRange ||
      !semver.satisfies(process.versions.node, targetRelease.nodeRange)
    ) {
      throw new Error(
        `Next.js ${targetRelease.version} requires Node.js ${targetRelease.nodeRange ?? '(metadata unavailable)'}. Install a supported runtime before continuing.`
      )
    }

    // Pin the codemod so a new canary published after handoff cannot change
    // the command the agent runs.
    const codemodVersion = await readPackageVersion('@next/codemod', 'canary')

    const [command, ...runnerArgs] = getNpxCommand(appDirectory).split(' ')
    // Avoid prompts and optional adoption transforms during security repairs.
    const args = [
      ...runnerArgs,
      `@next/codemod@${codemodVersion}`,
      'upgrade',
      targetRelease.version,
      '--yes',
      '--skip-adoption',
    ]
    return {
      status: 'ready',
      app,
      snapshot,
      targetVersion: targetRelease.version,
      tools: {
        command,
        args,
      },
    }
  } catch (error) {
    return {
      status: 'blocked',
      reason:
        error instanceof Error
          ? error.message
          : 'Could not resolve the security upgrade.',
    }
  }
}
