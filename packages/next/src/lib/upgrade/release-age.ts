import { once } from 'events'
import { text } from 'stream/consumers'
import spawn from 'next/dist/compiled/cross-spawn'
import picomatch from 'next/dist/compiled/picomatch'
import { gte, major, satisfies, valid } from 'next/dist/compiled/semver'
import { escapeStringRegexp } from '../../shared/lib/escape-regexp'
import type { PackageManager } from '../helpers/get-pkg-manager'

type ManagerContext = {
  directory: string
  packageManager: PackageManager
}

// Capture output rather than forwarding configuration or authentication errors.
async function queryManager({
  directory,
  packageManager,
  args,
}: ManagerContext & { args: string[] }): Promise<string> {
  try {
    const child = spawn(packageManager, args, {
      cwd: directory,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
    })
    const [output, [code]] = await Promise.all([
      text(child.stdout!),
      once(child, 'close'),
    ])
    if (code !== 0) {
      throw new Error('Package manager query failed.')
    }
    return output.trim()
  } catch {
    throw new Error(
      `Could not query ${packageManager} release metadata or settings.`
    )
  }
}

export async function readReleaseAgePolicy(context: ManagerContext) {
  try {
    const version = await queryManager({ ...context, args: ['--version'] })
    const now = Date.now()
    let minutes: number | string = 0
    let before: string | null = null
    let patterns: string[] | undefined = []

    if (context.packageManager === 'npm') {
      const config = JSON.parse(
        await queryManager({
          ...context,
          args: ['config', 'list', '--json', '--no-workspaces'],
        })
      )
      // Use merged values: before takes precedence regardless of config source.
      before = config.before
      if (
        before === null &&
        gte(version, '11.10.0') &&
        config['min-release-age'] != null
      ) {
        minutes =
          typeof config['min-release-age'] === 'number'
            ? config['min-release-age'] * 1440
            : NaN
      }
      // Older npm also prints unknown .npmrc keys; ignore unsupported settings.
      patterns = gte(version, '12.0.0') ? config['min-release-age-exclude'] : []
    } else if (context.packageManager === 'pnpm') {
      if (!gte(version, '10.16.0')) {
        return null
      }
      const config = JSON.parse(
        await queryManager({ ...context, args: ['config', 'list', '--json'] })
      )
      // config list omits defaults and changed key casing in v11.
      const {
        minimumReleaseAge = config['minimum-release-age'],
        minimumReleaseAgeExclude = config['minimum-release-age-exclude'],
      } = config
      minutes =
        minimumReleaseAge === undefined
          ? major(version) >= 11
            ? 1440
            : 0
          : minimumReleaseAge
      patterns = minimumReleaseAgeExclude
    } else {
      if (!gte(version, '4.10.0')) {
        return null
      }
      const output = await queryManager({
        ...context,
        args: ['config', '--json'],
      })
      minutes = NaN
      for (const line of output.split(/\r?\n/)) {
        const { key, effective } = JSON.parse(line)
        if (key === 'npmMinimalAgeGate') {
          minutes = effective
        } else if (key === 'npmPreapprovedPackages') {
          patterns = effective
        }
      }
    }

    // Normalize units once, after resolving the effective policy.
    if (typeof minutes === 'string' && minutes.trim() !== '') {
      minutes = Number(minutes)
    }
    if (
      typeof minutes !== 'number' ||
      !Number.isFinite(minutes) ||
      minutes < 0 ||
      (before !== null && typeof before !== 'string')
    ) {
      throw new Error('Invalid minimum release age.')
    }
    const publishedBefore =
      before === null
        ? minutes === 0
          ? null
          : now - minutes * 60_000
        : Date.parse(before)
    if (publishedBefore === null) {
      return null
    }
    if (!Number.isFinite(publishedBefore)) {
      throw new Error('Invalid release-age cutoff.')
    }
    if (patterns === undefined) {
      patterns = []
    }
    if (!Array.isArray(patterns)) {
      throw new Error('Invalid release-age exclusions.')
    }

    let isExcluded: (version: string) => boolean = () => false
    if (context.packageManager === 'pnpm') {
      const supportsVersions = gte(version, '10.19.0')
      const supportsPatterns = gte(version, '10.17.0')
      // pnpm uses the first matching name rule and exact-version unions.
      for (const pattern of patterns) {
        const at = supportsVersions ? pattern.indexOf('@', 1) : -1
        const name = at === -1 ? pattern : pattern.slice(0, at)
        const negated = supportsPatterns && name.startsWith('!')
        const matches = supportsPatterns
          ? new RegExp(
              `^${escapeStringRegexp(negated ? name.slice(1) : name).replace(/\\\*/g, '.*')}$`
            ).test('next') !== negated
          : name === 'next'
        if (!matches) {
          continue
        }
        const versions =
          at === -1
            ? null
            : pattern
                .slice(at + 1)
                .split('||')
                .map((part) => valid(part.trim()))
        if (
          versions &&
          (name.includes('*') || versions.some((item) => item === null))
        ) {
          throw new Error('Invalid pnpm release-age exclusion versions.')
        }
        isExcluded = (candidate) =>
          versions === null || versions.includes(candidate)
        break
      }
    } else if (context.packageManager === 'yarn') {
      isExcluded = (candidate) =>
        patterns.some((pattern) => {
          const at = pattern.indexOf('@', 1)
          const name = at === -1 ? pattern : pattern.slice(0, at)
          // Yarn descriptors with a protocol aren't semver preapproval ranges.
          return (
            picomatch.isMatch('next', name) &&
            (at === -1 || satisfies(candidate, pattern.slice(at + 1)))
          )
        })
    } else {
      const excluded = patterns.some((pattern) =>
        picomatch.isMatch('next', pattern)
      )
      isExcluded = () => excluded
    }

    return { packageManagerVersion: version, publishedBefore, isExcluded }
  } catch {
    throw new Error(
      `Could not read ${context.packageManager} release-age settings.`
    )
  }
}

export async function queryReleaseMetadata(
  context: ManagerContext & { packageManagerVersion: string }
): Promise<string> {
  const fields = ['time', 'dist-tags', 'versions']
  const npmView =
    context.packageManager === 'npm' ||
    (context.packageManager === 'pnpm' &&
      !gte(context.packageManagerVersion, '11.0.0'))
  const args =
    context.packageManager === 'yarn'
      ? ['npm', 'info', 'next', '--fields', fields.join(','), '--json']
      : npmView
        ? [
            'view',
            'next@canary',
            ...fields,
            '--json',
            '--no-workspaces',
            '--prefer-online',
            '--update-notifier=false',
          ]
        : [
            '--config.prefer-online=true',
            'view',
            'next@canary',
            ...fields,
            '--json',
          ]

  return queryManager({ ...context, args })
}
