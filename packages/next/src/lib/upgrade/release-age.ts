import { readFileSync } from 'fs'
import { basename, dirname, join } from 'path'
import spawn from 'next/dist/compiled/cross-spawn'
import findUp from 'next/dist/compiled/find-up'
import semver from 'next/dist/compiled/semver'
import { getNpxCommand } from '../helpers/get-npx-command'
import { getPkgManager, type PackageManager } from '../helpers/get-pkg-manager'

export type ReleaseAgePackage = 'next' | '@next/codemod'

// A rule that lifts the gate for one package, for every version or for an
// explicit list of versions.
type Exemption = { name: string; versions: string[] | null }

// A package manager refuses releases published after `cutoff` unless the
// package is exempted.
export type ReleaseAgeGate = {
  cutoff: number
  exemptions: Exemption[]
}

// What one step of an upgrade may install. No gate means nothing restricts it:
// unreadable configuration yields no gate, so probing a package manager can
// never fail an upgrade that would otherwise succeed.
//
// Reading a policy more strictly than the package manager enforces it only
// costs an older target, while reading it more loosely breaks the install, so
// every reader approximates toward the stricter side.
export type ReleaseAgeCheck = {
  gates: ReleaseAgeGate[]
  // Registry metadata shared by every check in one upgrade. The `next`
  // packument costs tens of megabytes to parse, so it is fetched at most once.
  packuments?: Map<string, Promise<Packument>>
}

export type ReleaseAgeChecks = {
  // Applied when the app's package manager installs the target. The codemod
  // installs with the same manager, so this covers it too.
  install: ReleaseAgeCheck
  // Applied when npx/dlx fetches the CLI or the codemod.
  runner: ReleaseAgeCheck
}

export type Packument = {
  'dist-tags': Record<string, string>
  versions: Record<string, { version: string }>
  time: Record<string, string> | undefined
}

export const NO_RELEASE_AGE_CHECK: ReleaseAgeCheck = { gates: [] }

export function getReleaseAgeChecks(directory: string): ReleaseAgeChecks {
  const install = tryRead(() => {
    const { manager, root } = installer(directory)
    // Bun has no release-age gate.
    return manager === 'bun'
      ? null
      : readGate({ directory: root, manager, operation: 'install' })
  })
  const runner = tryRead(() =>
    readGate({
      directory,
      manager: runnerManager(directory),
      operation: 'exec',
    })
  )
  const packuments = new Map<string, Promise<Packument>>()
  return {
    install: { gates: install ? [install] : [], packuments },
    runner: { gates: runner ? [runner] : [], packuments },
  }
}

export function isReleaseAllowed({
  check,
  packageName,
  version,
  publishedAt,
}: {
  check: ReleaseAgeCheck
  packageName: ReleaseAgePackage
  version: string
  publishedAt: string | undefined
}): boolean {
  const published = publishedAt === undefined ? NaN : Date.parse(publishedAt)
  return check.gates.every(
    (gate) =>
      gate.exemptions.some(
        ({ name, versions }) =>
          name === packageName &&
          (versions === null || versions.includes(version))
      ) ||
      (Number.isFinite(published) && published <= gate.cutoff)
  )
}

// Resolves a publish date from the registry only when the gates need one.
export async function isReleaseInstallable({
  check,
  packageName,
  version,
}: {
  check: ReleaseAgeCheck
  packageName: ReleaseAgePackage
  version: string
}): Promise<boolean> {
  if (
    isReleaseAllowed({ check, packageName, version, publishedAt: undefined })
  ) {
    return true
  }
  const packument = await getPackument(check, packageName)
  return (
    packument.versions[version]?.version === version &&
    isReleaseAllowed({
      check,
      packageName,
      version,
      publishedAt: packument.time?.[version],
    })
  )
}

export function getPackument(
  check: ReleaseAgeCheck,
  name: ReleaseAgePackage
): Promise<Packument> {
  let packument = check.packuments?.get(name)
  if (!packument) {
    packument = fetchPackument(name)
    check.packuments?.set(name, packument)
  }
  return packument
}

async function fetchPackument(name: string): Promise<Packument> {
  let value
  try {
    const response = await fetch(`https://registry.npmjs.org/${name}`, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json' },
      redirect: 'error',
      cache: 'no-store',
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    value = await response.json()
  } catch (error) {
    throw new Error('Could not fetch upgrade metadata. Please try again.', {
      cause: error,
    })
  }
  if (!value?.versions || !value['dist-tags']) {
    throw new Error(`Could not determine ${name} release dates.`)
  }
  return value
}

function readGate({
  directory,
  manager,
  operation,
}: {
  directory: string
  manager: PackageManager
  operation: 'install' | 'exec'
}): ReleaseAgeGate | null {
  if (manager === 'npm') {
    return npmGate(directory, operation)
  }
  if (manager === 'pnpm') {
    return pnpmGate(directory)
  }
  return yarnGate(directory)
}

function npmGate(
  directory: string,
  operation: 'install' | 'exec'
): ReleaseAgeGate | null {
  // `min-release-age` arrived in npm 11.10.0. Older npm reports a configured
  // value through `config get` but ignores it while installing.
  const keys = semver.gte(managerVersion(directory, 'npm'), '11.10.0')
    ? ['before', 'min-release-age', 'min-release-age-exclude']
    : ['before']
  const config = new Map<string, string>()
  for (const line of managerOutput(directory, 'npm', [
    'config',
    'get',
    ...keys,
    '--no-workspaces',
  ]).split(/\r?\n/)) {
    const entry = /^([^=]+)=(.*)$/.exec(line)
    if (entry && entry[2] !== 'null' && entry[2] !== 'undefined') {
      config.set(entry[1], entry[2])
    }
  }
  const before = config.get('before')
  const days = config.get('min-release-age')
  // npm reconciles `before` with `min-release-age` itself, so the stricter of
  // the two effective values is always installable.
  const cutoff = strictest([
    before === undefined ? NaN : Date.parse(before),
    days === undefined ? NaN : ageCutoff(Number(days) * 1440),
  ])
  if (cutoff === null) {
    return null
  }
  return {
    cutoff,
    // npm exec resolves its initial manifest without install's exemptions.
    exemptions:
      operation === 'exec'
        ? []
        : // npm matches exemptions by name only, so a rule naming a version is
          // a name that never matches.
          exemptions(config.get('min-release-age-exclude')?.split(','), {
            versions: false,
          }),
  }
}

function pnpmGate(directory: string): ReleaseAgeGate | null {
  const version = managerVersion(directory, 'pnpm')
  if (!semver.gte(version, '10.16.0')) {
    return null
  }
  const configured = json(
    managerOutput(directory, 'pnpm', [
      'config',
      'get',
      'minimumReleaseAge',
      '--json',
    ])
  )
  // pnpm does not print defaults, and pnpm 11 defaults to a one day delay.
  const cutoff = ageCutoff(
    configured ?? (semver.gte(version, '11.0.0') ? 1440 : 0)
  )
  if (!Number.isFinite(cutoff)) {
    return null
  }
  return {
    cutoff,
    exemptions: exemptions(
      json(
        managerOutput(directory, 'pnpm', [
          'config',
          'get',
          'minimumReleaseAgeExclude',
          '--json',
        ])
      ),
      { versions: true }
    ),
  }
}

function yarnGate(directory: string): ReleaseAgeGate | null {
  if (!semver.gte(managerVersion(directory, 'yarn'), '2.0.0')) {
    // Yarn Classic has no age gate.
    return null
  }
  const settings = new Map<string, unknown>()
  for (const line of managerOutput(directory, 'yarn', [
    'config',
    '--json',
  ]).split(/\r?\n/)) {
    const entry = json(line) as { key?: string; effective?: unknown }
    if (entry?.key) {
      settings.set(entry.key, entry.effective)
    }
  }
  const scopes = settings.get('npmScopes') as
    | Record<string, { npmMinimalAgeGate?: unknown }>
    | undefined
  // A `next` scope gate covers @next/codemod. Applying the stricter of the
  // scope and the default to both packages avoids tracking a gate per package.
  const cutoff = strictest(
    [settings.get('npmMinimalAgeGate'), scopes?.next?.npmMinimalAgeGate].map(
      ageCutoff
    )
  )
  if (cutoff === null) {
    return null
  }
  return {
    cutoff,
    exemptions: exemptions(settings.get('npmPreapprovedPackages'), {
      versions: true,
    }),
  }
}

const INSTALL_MARKERS: Record<string, PackageManager | 'bun'> = {
  'pnpm-workspace.yaml': 'pnpm',
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
  'bun.lock': 'bun',
  'bun.lockb': 'bun',
  'package-lock.json': 'npm',
}

// The agent installs with the app's manager from its install root, detected the
// way the guide describes: the declared manager, then the nearest lockfile, and
// only then whichever manager launched this CLI. `npx` in a pnpm app must still
// read pnpm's policy.
function installer(directory: string): {
  manager: PackageManager | 'bun'
  root: string
} {
  const marker = findUp.sync(Object.keys(INSTALL_MARKERS), { cwd: directory })
  const root = marker ? dirname(marker) : directory
  return {
    manager:
      declaredManager(directory) ??
      declaredManager(root) ??
      (marker ? INSTALL_MARKERS[basename(marker)] : getPkgManager(directory)),
    root,
  }
}

function declaredManager(
  directory: string
): PackageManager | 'bun' | undefined {
  try {
    const { packageManager } = JSON.parse(
      readFileSync(join(directory, 'package.json'), 'utf8')
    )
    return /^(npm|pnpm|yarn|bun)@/.exec(packageManager)?.[1] as
      | PackageManager
      | 'bun'
      | undefined
  } catch {
    return undefined
  }
}

function runnerManager(directory: string): PackageManager {
  const command = getNpxCommand(directory).split(' ')[0]
  return command === 'npx' ? 'npm' : command === 'pnpm' ? 'pnpm' : 'yarn'
}

function managerVersion(directory: string, manager: PackageManager): string {
  const version = managerOutput(directory, manager, ['--version']).trim()
  if (!semver.valid(version)) {
    throw new Error(`Could not determine the ${manager} version.`)
  }
  return version
}

// Query the installed manager rather than reimplementing rc/workspace
// discovery. Never include its output in an error: it can contain credentials.
function managerOutput(
  directory: string,
  manager: PackageManager,
  args: string[]
): string {
  const result = spawn.sync(manager, args, {
    cwd: directory,
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  })
  if (result.error || result.status !== 0) {
    throw new Error(`Could not read ${manager} release-age configuration.`, {
      cause: result.error,
    })
  }
  return result.stdout
}

function json(output: string): unknown {
  const value = output.trim()
  if (!value || value === 'undefined') {
    return undefined
  }
  try {
    return JSON.parse(value)
  } catch (error) {
    throw new Error(
      'Could not parse package manager release-age configuration.',
      { cause: error }
    )
  }
}

// Returns the timestamp after which releases are refused, or NaN when the
// setting imposes no delay.
function ageCutoff(minutes: unknown): number {
  if (minutes === null || minutes === undefined) {
    return NaN
  }
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) {
    throw new Error(
      'Invalid minimum release age in package manager configuration.'
    )
  }
  return minutes === 0 ? NaN : Date.now() - minutes * 60_000
}

function strictest(cutoffs: number[]): number | null {
  const known = cutoffs.filter((cutoff) => Number.isFinite(cutoff))
  return known.length === 0 ? null : Math.min(...known)
}

function exemptions(
  value: unknown,
  { versions }: { versions: boolean }
): Exemption[] {
  if (value === undefined || value === null) {
    return []
  }
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string')
  ) {
    throw new Error(
      'Invalid release-age exclusions in package manager configuration.'
    )
  }
  return (value as string[]).flatMap((rule): Exemption[] => {
    const trimmed = rule.trim()
    // Only a plain name, or a name with explicit versions, is honored. Glob
    // and range dialects differ per manager, and leaving them gated is the
    // safe reading.
    if (!trimmed || /[*!?+[(]/.test(trimmed)) {
      return []
    }
    const separator = trimmed.indexOf('@', trimmed.startsWith('@') ? 1 : 0)
    if (separator < 0) {
      return [{ name: trimmed, versions: null }]
    }
    const requested = trimmed
      .slice(separator + 1)
      .split('||')
      .map((entry) => semver.valid(entry.trim()))
    return versions && requested.every((entry) => entry !== null)
      ? [{ name: trimmed.slice(0, separator), versions: requested as string[] }]
      : []
  })
}

function tryRead<T>(read: () => T): T | null {
  try {
    return read()
  } catch {
    // A policy probe is an optimization. When the package manager cannot be
    // read, the upgrade proceeds as it did before release-age gates existed.
    return null
  }
}
