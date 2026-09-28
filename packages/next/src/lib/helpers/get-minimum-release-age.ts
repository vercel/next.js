import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import picomatch from 'picomatch'
import semver from 'next/dist/compiled/semver'

export type AgeGatedPackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

function run(
  command: string,
  args: string[],
  directory: string,
  env: NodeJS.ProcessEnv,
  input: string | undefined = undefined
): string {
  return execFileSync(command, args, {
    cwd: directory,
    encoding: 'utf8',
    env,
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

function versionAtLeast(
  version: string,
  major: number,
  minor: number
): boolean {
  const match = /^(\d+)\.(\d+)\./.exec(version)
  if (!match) {
    throw new Error(`Could not parse package manager version: ${version}`)
  }

  const actualMajor = Number(match[1])
  const actualMinor = Number(match[2])
  return actualMajor > major || (actualMajor === major && actualMinor >= minor)
}

function parseNonNegativeNumber(value: unknown, setting: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid ${setting} value`)
  }
  return value
}

function readJsonConfig(
  manager: 'npm' | 'pnpm' | 'yarn',
  key: string,
  directory: string,
  env: NodeJS.ProcessEnv
): unknown {
  const output = run(manager, ['config', 'get', key, '--json'], directory, env)
  if (output === '' || output === 'undefined') {
    return null
  }
  return JSON.parse(output)
}

function isExcluded(value: unknown, packageName: string | null): boolean {
  if (packageName === null || value === null || value === undefined) {
    return false
  }
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === 'string')
  ) {
    throw new Error('Invalid minimum release age exclusions')
  }
  return value.some((pattern) => picomatch.isMatch(packageName, pattern))
}

function readBunAgePolicy(
  directory: string,
  env: NodeJS.ProcessEnv
): { age: unknown; excludes: unknown } {
  const globalDirectory = env.XDG_CONFIG_HOME || env.HOME
  const paths = [
    globalDirectory ? join(globalDirectory, '.bunfig.toml') : null,
    join(directory, 'bunfig.toml'),
  ]
  const contents = paths
    .filter((path): path is string => path !== null && existsSync(path))
    .map((path) => readFileSync(path, 'utf8'))

  if (contents.length === 0) {
    return { age: undefined, excludes: undefined }
  }

  // Bun's own TOML parser handles the complete format, including quoted keys.
  const parsed = JSON.parse(
    run(
      'bun',
      [
        '-e',
        'const files = JSON.parse(await Bun.stdin.text()); console.log(JSON.stringify(files.map((file) => Bun.TOML.parse(file))))',
      ],
      directory,
      env,
      JSON.stringify(contents)
    )
  ) as Array<{
    install:
      | { minimumReleaseAge: unknown; minimumReleaseAgeExcludes: unknown }
      | undefined
  }>

  // Project settings override global settings, as Bun does during install.
  let age: unknown = undefined
  let excludes: unknown = undefined
  for (const config of parsed) {
    if (config.install && Object.hasOwn(config.install, 'minimumReleaseAge')) {
      age = config.install.minimumReleaseAge
    }
    if (
      config.install &&
      Object.hasOwn(config.install, 'minimumReleaseAgeExcludes')
    ) {
      excludes = config.install.minimumReleaseAgeExcludes
    }
  }
  return { age, excludes }
}

/**
 * Returns the effective minimum release age in milliseconds, or zero when the
 * selected manager does not enforce an age gate or exempts the package.
 * Registry-side restrictions must be checked separately.
 */
export function getMinimumReleaseAge(
  directory: string,
  manager: AgeGatedPackageManager,
  packageName: string | null = null,
  env: NodeJS.ProcessEnv = process.env
): number {
  if (manager === 'pnpm') {
    const version = run('pnpm', ['--version'], directory, env)
    if (!versionAtLeast(version, 10, 16)) {
      return 0
    }
    const value = readJsonConfig('pnpm', 'minimumReleaseAge', directory, env)
    const age =
      value === null
        ? 0
        : parseNonNegativeNumber(value, 'minimumReleaseAge') * 60_000
    if (age === 0 || packageName === null) {
      return age
    }
    const excludes = readJsonConfig(
      'pnpm',
      'minimumReleaseAgeExclude',
      directory,
      env
    )
    return isExcluded(excludes, packageName) ? 0 : age
  }

  if (manager === 'npm') {
    const version = run('npm', ['--version'], directory, env)
    if (!versionAtLeast(version, 11, 10)) {
      return 0
    }
    const value = readJsonConfig('npm', 'min-release-age', directory, env)
    const age =
      value === null
        ? 0
        : parseNonNegativeNumber(value, 'min-release-age') * 86_400_000
    if (age === 0 || packageName === null) {
      return age
    }
    const excludes = readJsonConfig(
      'npm',
      'min-release-age-exclude',
      directory,
      env
    )
    return isExcluded(excludes, packageName) ? 0 : age
  }

  if (manager === 'yarn') {
    const version = run('yarn', ['--version'], directory, env)
    if (!versionAtLeast(version, 4, 12)) {
      return 0
    }
    const scope = /^@([^/]+)\//.exec(packageName ?? '')?.[1]
    let age: number | null = null
    if (scope) {
      const scopedValue = readJsonConfig(
        'yarn',
        `npmScopes[${JSON.stringify(scope)}].npmMinimalAgeGate`,
        directory,
        env
      )
      if (scopedValue !== null) {
        age = parseNonNegativeNumber(scopedValue, 'npmMinimalAgeGate') * 60_000
      }
    }
    if (age === null) {
      const value = readJsonConfig('yarn', 'npmMinimalAgeGate', directory, env)
      // Yarn stores duration settings in the unit specified by its definition.
      // npmMinimalAgeGate uses minutes and defaults to one day in Yarn 4.12+.
      age = parseNonNegativeNumber(value, 'npmMinimalAgeGate') * 60_000
    }
    if (age === 0 || packageName === null) {
      return age
    }
    const excludes = readJsonConfig(
      'yarn',
      'npmPreapprovedPackages',
      directory,
      env
    )
    return isExcluded(excludes, packageName) ? 0 : age
  }

  if (manager === 'bun') {
    // Older Bun versions accept bunfig.toml without implementing this setting.
    if (
      !run('bun', ['install', '--help'], directory, env).includes(
        '--minimum-release-age'
      )
    ) {
      return 0
    }
    const { age, excludes } = readBunAgePolicy(directory, env)
    const ageInMilliseconds =
      age === undefined
        ? 0
        : parseNonNegativeNumber(age, 'minimumReleaseAge') * 1_000
    return ageInMilliseconds > 0 && isExcluded(excludes, packageName)
      ? 0
      : ageInMilliseconds
  }

  throw new Error(`Unsupported package manager: ${manager}`)
}

type ReleaseChannel = 'latest' | 'canary' | 'rc' | 'beta' | 'preview'

export type AgeGatedPackage = {
  name: string
  minimumReleaseAge: number
}

type Packument = {
  'dist-tags': Record<string, string>
  versions: Record<string, unknown>
  time: Record<string, string>
}

const NPM_REGISTRY = 'https://registry.npmjs.org/'

function isPackument(value: unknown): value is Packument {
  if (!value || typeof value !== 'object') {
    return false
  }
  const data = value as Partial<Packument>
  return (
    !!data['dist-tags'] &&
    typeof data['dist-tags'] === 'object' &&
    !!data.versions &&
    typeof data.versions === 'object' &&
    !!data.time &&
    typeof data.time === 'object'
  )
}

async function fetchPackument(name: string): Promise<Packument> {
  const path = encodeURIComponent(name).replace('%40', '@')
  const response = await fetch(`${NPM_REGISTRY}${path}`, {
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
    redirect: 'error',
  })
  if (!response.ok) {
    throw new Error(
      `Could not read ${name} releases (HTTP ${response.status}).`
    )
  }
  const value: unknown = await response.json()
  if (!isPackument(value)) {
    throw new Error(`Could not read ${name} release times.`)
  }
  return value
}

function matchesChannel(version: string, channel: ReleaseChannel): boolean {
  const prerelease = semver.prerelease(version)
  return channel === 'latest'
    ? prerelease === null
    : prerelease?.[0] === channel
}

/** Select the newest release every package manager age gate permits. */
export async function resolveAgeEligibleVersion(
  packages: AgeGatedPackage[],
  channel: ReleaseChannel,
  range: string | null = null
): Promise<string> {
  if (packages.length === 0) {
    throw new Error('No packages were provided for upgrade resolution.')
  }

  const packuments = await Promise.all(
    packages.map(async (pkg) => ({
      ...pkg,
      packument: await fetchPackument(pkg.name),
    }))
  )
  const now = Date.now()
  const candidates = Object.keys(packuments[0].packument.versions)
    .filter((version) => {
      if (
        !semver.valid(version) ||
        !matchesChannel(version, channel) ||
        (range !== null && !semver.satisfies(version, range))
      ) {
        return false
      }

      return packuments.every(({ minimumReleaseAge, packument }) => {
        const taggedVersion = packument['dist-tags'][channel]
        if (
          !semver.valid(taggedVersion) ||
          semver.gt(version, taggedVersion) ||
          !(version in packument.versions)
        ) {
          return false
        }
        if (minimumReleaseAge === 0) {
          return true
        }
        const published = Date.parse(packument.time[version])
        return (
          Number.isFinite(published) && published <= now - minimumReleaseAge
        )
      })
    })
    .sort(semver.rcompare)

  if (candidates.length === 0) {
    const names = packages.map(({ name }) => name).join(' and ')
    throw new Error(
      `No ${channel} version of ${names} satisfies the project's minimum release age.`
    )
  }
  return candidates[0]
}
