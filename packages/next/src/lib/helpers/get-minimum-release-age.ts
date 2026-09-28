import crossSpawn from 'next/dist/compiled/cross-spawn'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import picomatch from 'next/dist/compiled/picomatch'
import semver from 'next/dist/compiled/semver'

export type AgeGatedPackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

function run(
  command: string,
  args: string[],
  directory: string,
  env: NodeJS.ProcessEnv,
  input: string | undefined = undefined
): string {
  if (process.platform !== 'win32') {
    return execFileSync(command, args, {
      cwd: directory,
      encoding: 'utf8',
      env,
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
      timeout: 10_000,
    }).trim()
  }
  const result = crossSpawn.sync(command, args, {
    cwd: directory,
    encoding: 'utf8',
    env,
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    timeout: 10_000,
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr}`)
  }
  return result.stdout.trim()
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
  const args = ['config', 'get', key, '--json']
  if (manager === 'npm') {
    args.push('--no-workspaces')
  }
  const output = run(manager, args, directory, env)
  if (output === '' || output === 'undefined') {
    return null
  }
  if (
    (key === 'registry' ||
      key.endsWith(':registry') ||
      key.includes('npmRegistryServer')) &&
    /^https?:\/\//.test(output)
  ) {
    return output
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

function bunConfigPaths(directory: string, env: NodeJS.ProcessEnv): string[] {
  const globalDirectory =
    env.XDG_CONFIG_HOME || env.HOME || env.USERPROFILE || homedir()
  const ancestors: string[] = []
  let current = resolve(directory)
  while (true) {
    ancestors.unshift(join(current, 'bunfig.toml'))
    const parent = dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }
  return [join(globalDirectory, '.bunfig.toml'), ...new Set(ancestors)]
}

function readBunAgePolicy(
  directory: string,
  env: NodeJS.ProcessEnv
): { age: unknown; excludes: unknown } {
  const contents = bunConfigPaths(directory, env)
    .filter((path) => existsSync(path))
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
    if (!versionAtLeast(version, 4, 10)) {
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
      // npmMinimalAgeGate uses minutes.
      age =
        value === null
          ? 0
          : parseNonNegativeNumber(value, 'npmMinimalAgeGate') * 60_000
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

export class NoAgeEligibleReleaseError extends Error {}

export type AgeGatedPackage = {
  name: string
  minimumReleaseAge: number
  exclusions?: string[]
  registry?: string
  range?: string
  directory?: string
  manager?: AgeGatedPackageManager
}

type Packument = {
  'dist-tags': Record<string, string>
  versions: Record<string, unknown>
  time: Record<string, string>
}

const NPM_REGISTRY = 'https://registry.npmjs.org/'

export function getMinimumReleaseAgeExclusions(
  directory: string,
  manager: AgeGatedPackageManager,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  let value: unknown
  if (manager === 'pnpm') {
    value = readJsonConfig('pnpm', 'minimumReleaseAgeExclude', directory, env)
  } else if (manager === 'npm') {
    value = readJsonConfig('npm', 'min-release-age-exclude', directory, env)
  } else if (manager === 'yarn') {
    value = readJsonConfig('yarn', 'npmPreapprovedPackages', directory, env)
  } else if (manager === 'bun') {
    value = readBunAgePolicy(directory, env).excludes
  } else {
    throw new Error(`Unsupported package manager: ${manager}`)
  }
  if (value === null || value === undefined) {
    return []
  }
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === 'string')
  ) {
    throw new Error('Invalid minimum release age exclusions')
  }
  return value
}

export function getAgeGateRegistry(
  directory: string,
  manager: AgeGatedPackageManager,
  packageName: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const scope = /^@([^/]+)\//.exec(packageName)?.[1]
  let registry: unknown
  if (manager === 'yarn') {
    const classic = !versionAtLeast(
      run('yarn', ['--version'], directory, env),
      2,
      0
    )
    if (classic) {
      registry = readJsonConfig('yarn', 'registry', directory, env)
    } else if (scope) {
      registry = readJsonConfig(
        'yarn',
        `npmScopes[${JSON.stringify(scope)}].npmRegistryServer`,
        directory,
        env
      )
    }
    if (!classic) {
      registry ??= readJsonConfig('yarn', 'npmRegistryServer', directory, env)
    }
  } else if (manager === 'bun') {
    let scopedRegistry: unknown
    let configuredRegistry: unknown
    for (const bunfig of bunConfigPaths(directory, env)) {
      if (existsSync(bunfig)) {
        const parsed = JSON.parse(
          run(
            'bun',
            [
              '-e',
              'console.log(JSON.stringify(Bun.TOML.parse(await Bun.stdin.text())))',
            ],
            directory,
            env,
            readFileSync(bunfig, 'utf8')
          )
        ) as {
          install?: {
            registry?: string | { url?: string }
            scopes?: Record<string, string | { url?: string }>
          }
        }
        const setting = parsed.install?.registry
        configuredRegistry =
          typeof setting === 'string'
            ? setting
            : (setting?.url ?? configuredRegistry)
        const scopedSetting = scope
          ? parsed.install?.scopes?.[`@${scope}`]
          : undefined
        if (scopedSetting !== undefined) {
          scopedRegistry =
            typeof scopedSetting === 'string'
              ? scopedSetting
              : scopedSetting?.url
        }
      }
    }
    registry =
      scopedRegistry ??
      env.npm_config_registry ??
      configuredRegistry ??
      NPM_REGISTRY
  } else {
    if (scope) {
      registry = readJsonConfig(manager, `@${scope}:registry`, directory, env)
    }
    registry ??= readJsonConfig(manager, 'registry', directory, env)
  }
  if (typeof registry !== 'string' || !/^https?:\/\//.test(registry)) {
    throw new Error(
      `Could not determine the ${manager} registry for ${packageName}.`
    )
  }
  return registry.endsWith('/') ? registry : `${registry}/`
}

export function getAgeGatedPackage(
  directory: string,
  manager: AgeGatedPackageManager,
  name: string,
  range: string | undefined = undefined
): AgeGatedPackage {
  const minimumReleaseAge = getMinimumReleaseAge(directory, manager, name)
  return {
    name,
    minimumReleaseAge,
    exclusions:
      minimumReleaseAge > 0
        ? getMinimumReleaseAgeExclusions(directory, manager)
        : [],
    registry:
      minimumReleaseAge > 0
        ? getAgeGateRegistry(directory, manager, name)
        : undefined,
    range,
    directory,
    manager,
  }
}

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

function getBunAuthorization(
  directory: string,
  registry: string,
  packageName: string,
  env: NodeJS.ProcessEnv
): string | null {
  const scope = /^@[^/]+/.exec(packageName)?.[0]
  let setting: unknown
  let scopedSetting: unknown
  for (const bunfig of bunConfigPaths(directory, env)) {
    if (existsSync(bunfig)) {
      const config = JSON.parse(
        run(
          'bun',
          [
            '-e',
            'console.log(JSON.stringify(Bun.TOML.parse(await Bun.stdin.text())))',
          ],
          directory,
          env,
          readFileSync(bunfig, 'utf8')
        )
      ) as {
        install?: { registry?: unknown; scopes?: Record<string, unknown> }
      }
      setting = config.install?.registry ?? setting
      scopedSetting =
        (scope ? config.install?.scopes?.[scope] : undefined) ?? scopedSetting
    }
  }
  const effectiveSetting = scopedSetting ?? setting
  if (!effectiveSetting || typeof effectiveSetting !== 'object') {
    return null
  }
  const auth = effectiveSetting as {
    url?: string
    token?: string
    username?: string
    password?: string
  }
  if (`${auth.url?.replace(/\/$/, '')}/` !== registry) {
    return null
  }
  const expand = (value: string): string => {
    const variable = /^\$([A-Za-z_][A-Za-z0-9_]*)$/.exec(value)?.[1]
    if (!variable) {
      return value
    }
    const resolved = env[variable]
    if (!resolved) {
      throw new Error(
        `Missing Bun registry credential environment variable ${variable}.`
      )
    }
    return resolved
  }
  if (typeof auth.token === 'string') {
    return `Bearer ${expand(auth.token)}`
  }
  if (typeof auth.username === 'string' && typeof auth.password === 'string') {
    return `Basic ${Buffer.from(`${expand(auth.username)}:${expand(auth.password)}`).toString('base64')}`
  }
  return null
}

async function fetchPackument(pkg: AgeGatedPackage): Promise<Packument> {
  const { name, registry = NPM_REGISTRY, directory, manager } = pkg
  const registryUrl = new URL(registry)
  const registryAuthorization =
    registryUrl.username || registryUrl.password
      ? `Basic ${Buffer.from(`${decodeURIComponent(registryUrl.username)}:${decodeURIComponent(registryUrl.password)}`).toString('base64')}`
      : null
  registryUrl.username = ''
  registryUrl.password = ''
  const safeRegistry = registryUrl.toString()
  const bunAuthorization =
    directory && manager === 'bun'
      ? getBunAuthorization(directory, registry, pkg.name, process.env)
      : null
  const authorization = registryAuthorization ?? bunAuthorization
  if (authorization) {
    const path = encodeURIComponent(name).replace('%40', '@')
    const response = await fetch(`${safeRegistry}${path}`, {
      headers: { Authorization: authorization },
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
  if (directory && manager) {
    // Use the selected manager's registry client so its configured credentials
    // are applied to private registries without exposing tokens in our output.
    const output =
      manager === 'yarn'
        ? run('yarn', ['npm', 'info', name, '--json'], directory, process.env)
        : run(
            manager === 'bun' ? 'npm' : manager,
            [
              'view',
              name,
              'time',
              'versions',
              'dist-tags',
              '--json',
              `--registry=${safeRegistry}`,
              ...(manager === 'npm' || manager === 'bun'
                ? ['--no-workspaces']
                : []),
            ],
            directory,
            process.env
          )
    const value: unknown = JSON.parse(output)
    if (isPackument(value) && Array.isArray(value.versions)) {
      value.versions = Object.fromEntries(
        value.versions.map((version: string) => [version, true])
      )
    }
    if (!isPackument(value)) {
      throw new Error(`Could not read ${name} release times.`)
    }
    return value
  }
  const path = encodeURIComponent(name).replace('%40', '@')
  const response = await fetch(`${safeRegistry}${path}`, {
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

/** Select the newest published release allowed by the age gate. */
export async function resolveAgeEligibleVersion(
  pkg: AgeGatedPackage,
  channel: ReleaseChannel,
  also: AgeGatedPackage | null = null
): Promise<string> {
  const packument = await fetchPackument(pkg)
  const alsoPackument = also ? await fetchPackument(also) : null
  const taggedRange =
    pkg.range && Object.hasOwn(packument['dist-tags'], pkg.range)
      ? packument['dist-tags'][pkg.range]
      : null
  const now = Date.now()
  const eligible = (
    candidate: AgeGatedPackage,
    metadata: Packument,
    version: string
  ) => {
    if (!Object.hasOwn(metadata.versions, version)) {
      return false
    }
    if (
      candidate.minimumReleaseAge === 0 ||
      candidate.exclusions?.some(
        (pattern) =>
          picomatch.isMatch(candidate.name, pattern) ||
          picomatch.isMatch(`${candidate.name}@${version}`, pattern)
      )
    ) {
      return true
    }
    const published = Date.parse(metadata.time[version])
    return (
      Number.isFinite(published) &&
      published <= now - candidate.minimumReleaseAge
    )
  }
  const candidates = Object.keys(packument.versions)
    .filter((version) => {
      if (taggedRange !== null) {
        return (
          semver.valid(version) !== null &&
          version === taggedRange &&
          eligible(pkg, packument, version) &&
          (!also || !alsoPackument || eligible(also, alsoPackument, version))
        )
      }
      if (!semver.valid(version) || !matchesChannel(version, channel)) {
        return false
      }
      if (pkg.range && !semver.satisfies(version, pkg.range)) {
        return false
      }

      if (!pkg.range) {
        const taggedVersion = packument['dist-tags'][channel]
        if (!semver.valid(taggedVersion) || semver.gt(version, taggedVersion)) {
          return false
        }
      }
      return (
        eligible(pkg, packument, version) &&
        (!also ||
          !alsoPackument ||
          ((pkg.range ||
            (semver.valid(alsoPackument['dist-tags'][channel]) &&
              !semver.gt(version, alsoPackument['dist-tags'][channel]))) &&
            eligible(also, alsoPackument, version)))
      )
    })
    .sort(semver.rcompare)

  if (candidates.length === 0) {
    throw new NoAgeEligibleReleaseError(
      `No ${channel} version of ${pkg.name} satisfies the project's minimum release age.`
    )
  }
  return candidates[0]
}
