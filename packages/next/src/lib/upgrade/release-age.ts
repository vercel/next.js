import { readFile } from 'fs/promises'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { escapeStringRegexp } from '../../shared/lib/escape-regexp'
import { basename, dirname, isAbsolute, join } from 'path'
import spawn from 'next/dist/compiled/cross-spawn'
import findUp from 'next/dist/compiled/find-up'
import picomatch from 'next/dist/compiled/picomatch'
import semver from 'next/dist/compiled/semver'
import { getNpxCommand } from '../helpers/get-npx-command'
import { getPkgManager } from '../helpers/get-pkg-manager'

type Manager = 'npm' | 'pnpm' | 'yarn' | 'bun'

export type ReleaseAgePolicy = {
  manager: Manager
  before: number | null
  exclude: string[]
}

export type UpgradeReleaseAge = {
  installer: ReleaseAgePolicy
  codemodInstaller: ReleaseAgePolicy
}

export type ReleaseMetadata = {
  'dist-tags': Record<string, string>
  versions: Record<string, { version: string }>
  time: Record<string, string> | undefined
}

// Query the installed manager rather than reimplementing rc/workspace discovery.
// Never include its config output in an error: it can contain credentials.
function configOutput(directory: string, manager: Manager, args: string[]) {
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

function configValue(output: string): unknown {
  if (!output.trim() || output.trim() === 'undefined') {
    return undefined
  }
  try {
    return JSON.parse(output)
  } catch (error) {
    throw new Error(
      'Could not parse package manager release-age configuration.',
      { cause: error }
    )
  }
}

function ageCutoff(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(
      'Invalid minimum release age in package manager configuration.'
    )
  }
  return value === 0 ? null : Date.now() - value * 60_000
}

function exclusions(value: unknown): string[] {
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
  return value
}

export function parseNpmReleaseAge(
  output: string,
  execution: boolean
): ReleaseAgePolicy {
  const supported = new Set<string>()
  const sources: Record<string, unknown>[] = []
  let source: Record<string, unknown> | null = null
  let defaults = false

  // Native npm output preserves source order and synthesized `before` values.
  // publishConfig and unknown keys do not affect installation policy.
  for (const line of output.split(/\r?\n/)) {
    const section = /^; "([^"]+)" (?:config )?from /.exec(line)
    if (section) {
      defaults = section[1] === 'default'
      source = /^(default|global|user|project|env|cli)$/.test(section[1])
        ? {}
        : null
      if (source) {
        sources.push(source)
      }
      continue
    }
    const entry =
      /^(; )?(before|min-release-age|min-release-age-exclude) = (.*?)(?: ; overridden by .*|)$/.exec(
        line
      )
    if (!entry || !source) {
      continue
    }
    if (defaults) {
      supported.add(entry[2])
    }
    if (!entry[1] && supported.has(entry[2])) {
      source[entry[2]] = configValue(entry[3])
    }
  }
  if (!supported.has('before')) {
    throw new Error('Could not determine npm release-age configuration.')
  }

  let before: number | null = null
  let exclude: string[] = []
  for (const values of sources) {
    if (Object.hasOwn(values, 'before')) {
      const value = values.before
      const cutoff =
        value === null
          ? null
          : typeof value === 'string'
            ? Date.parse(value)
            : NaN
      if (cutoff !== null && !Number.isFinite(cutoff)) {
        throw new Error('Invalid npm before configuration.')
      }
      before = cutoff
    } else if (
      values['min-release-age'] !== null &&
      values['min-release-age'] !== undefined
    ) {
      const age = values['min-release-age']
      if (typeof age !== 'number') {
        throw new Error('Invalid npm minimum release age.')
      }
      before = ageCutoff(age * 1440)
    }
    if (Object.hasOwn(values, 'min-release-age-exclude')) {
      exclude = exclusions(values['min-release-age-exclude']).flatMap((entry) =>
        entry
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean)
      )
    }
  }

  // npm exec's initial manifest lookup does not apply install's exemptions.
  return { manager: 'npm', before, exclude: execution ? [] : exclude }
}

export function readReleaseAgePolicy(
  directory: string,
  manager: Manager,
  execution: boolean,
  packageName: 'next' | '@next/codemod'
): ReleaseAgePolicy {
  if (manager === 'npm') {
    const prefix = configOutput(directory, manager, ['prefix']).trim()
    if (!isAbsolute(prefix)) {
      throw new Error('Could not determine the npm installation root.')
    }
    return parseNpmReleaseAge(
      configOutput(prefix, manager, [
        'config',
        'list',
        '--long',
        '--no-workspaces',
      ]),
      execution
    )
  }
  if (manager === 'pnpm') {
    const version = configOutput(directory, manager, ['--version']).trim()
    if (!semver.valid(version)) {
      throw new Error('Could not determine the pnpm version.')
    }
    if (semver.lt(version, '10.16.0')) {
      return { manager, before: null, exclude: [] }
    }
    let queryDirectory = directory
    let temporary: string | null = null
    try {
      if (execution && semver.major(version) < 11) {
        // Older dlx reads home settings instead of project security settings.
        // Pin its manager in a disposable context so Corepack preserves the version.
        temporary = mkdtempSync(join(tmpdir(), 'next-upgrade-policy-'))
        queryDirectory = temporary
        writeFileSync(
          join(temporary, 'package.json'),
          JSON.stringify({ packageManager: `pnpm@${version}` })
        )
        writeFileSync(
          join(temporary, '.npmrc'),
          'manage-package-manager-versions=true\n'
        )
        if (
          configOutput(temporary, manager, ['--version']).trim() !== version
        ) {
          throw new Error(
            'Could not query the running pnpm release-age policy.'
          )
        }
      }
      const contextArgs = temporary
        ? [
            '--dir',
            homedir(),
            '--ignore-workspace',
            '--config.manage-package-manager-versions=false',
            '--config.package-manager-strict=false',
          ]
        : []
      const rawAge = configValue(
        configOutput(queryDirectory, manager, [
          ...contextArgs,
          'config',
          'get',
          'minimumReleaseAge',
          '--json',
        ])
      )
      // pnpm 11+ does not print defaults through config get; the native age gate
      // defaults to one day. Older versions have no implicit delay.
      const age = rawAge ?? (semver.major(version) >= 11 ? 1440 : 0)
      const exclude = exclusions(
        configValue(
          configOutput(queryDirectory, manager, [
            ...contextArgs,
            'config',
            'get',
            'minimumReleaseAgeExclude',
            '--json',
          ])
        )
      )
      for (const rule of exclude) {
        const separator = rule.indexOf('@', rule.startsWith('@') ? 1 : 0)
        if (
          separator >= 0 &&
          (rule.slice(0, separator).includes('*') ||
            rule
              .slice(separator + 1)
              .split('||')
              .some((entry) => !semver.valid(entry.trim())))
        ) {
          throw new Error('Invalid pnpm release-age version exclusion.')
        }
      }
      return { manager, before: ageCutoff(age), exclude }
    } finally {
      if (temporary) {
        rmSync(temporary, { recursive: true, force: true })
      }
    }
  }
  if (manager === 'yarn') {
    const version = configOutput(directory, manager, ['--version']).trim()
    if (!semver.valid(version)) {
      throw new Error('Could not determine the Yarn version.')
    }
    if (semver.major(version) === 1) {
      return { manager, before: null, exclude: [] }
    }
    const settings = configOutput(directory, manager, ['config', '--json'])
      .trim()
      .split(/\r?\n/)
      .map((line) => configValue(line) as { key: string; effective: unknown })
    const age = settings.find((entry) => entry.key === 'npmMinimalAgeGate')
    const exclude = settings.find(
      (entry) => entry.key === 'npmPreapprovedPackages'
    )
    const scopes = settings.find((entry) => entry.key === 'npmScopes')
      ?.effective as
      | Record<string, { npmMinimalAgeGate: number | undefined }>
      | undefined
    const scopedAge =
      packageName === '@next/codemod'
        ? scopes?.next?.npmMinimalAgeGate
        : undefined
    return {
      manager,
      before: ageCutoff(scopedAge ?? age?.effective),
      exclude: exclusions(exclude?.effective),
    }
  }

  // Preserve the existing Bun installation path; Bun age support is separate.
  return { manager, before: null, exclude: [] }
}

export function getRunnerReleaseAge(
  directory: string,
  packageName: 'next' | '@next/codemod'
): ReleaseAgePolicy {
  const command = getNpxCommand(directory).split(' ')[0]
  return readReleaseAgePolicy(
    directory,
    command === 'npx' ? 'npm' : command === 'pnpm' ? 'pnpm' : 'yarn',
    true,
    packageName
  )
}

async function declaredManager(directory: string): Promise<Manager | null> {
  let contents: string
  try {
    contents = await readFile(join(directory, 'package.json'), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
  const match = /^(npm|pnpm|yarn|bun)@/.exec(
    JSON.parse(contents).packageManager ?? ''
  )
  return match ? (match[1] as Manager) : null
}

export async function getInstallerReleaseAge(
  directory: string
): Promise<UpgradeReleaseAge> {
  const marker = findUp.sync(
    [
      'pnpm-workspace.yaml',
      'pnpm-lock.yaml',
      'yarn.lock',
      'bun.lock',
      'bun.lockb',
      'package-lock.json',
    ],
    { cwd: directory }
  )
  const installRoot = marker ? dirname(marker) : directory
  const appManager = await declaredManager(directory)
  const rootManager =
    installRoot === directory ? appManager : await declaredManager(installRoot)
  const lockManager = marker
    ? basename(marker).startsWith('pnpm')
      ? 'pnpm'
      : basename(marker) === 'yarn.lock'
        ? 'yarn'
        : basename(marker).startsWith('bun')
          ? 'bun'
          : 'npm'
    : null
  const userAgentManager = /^(npm|pnpm|yarn|bun)\//.exec(
    process.env.npm_config_user_agent ?? ''
  )?.[1] as Manager | undefined
  const codemodLock = findUp.sync(
    [
      'yarn.lock',
      'pnpm-lock.yaml',
      'bun.lock',
      'bun.lockb',
      'package-lock.json',
    ],
    { cwd: directory }
  )
  const codemodLockManager = codemodLock
    ? basename(codemodLock) === 'yarn.lock'
      ? 'yarn'
      : basename(codemodLock) === 'pnpm-lock.yaml'
        ? 'pnpm'
        : basename(codemodLock).startsWith('bun')
          ? 'bun'
          : 'npm'
    : null
  const codemodManager =
    appManager ?? userAgentManager ?? codemodLockManager ?? 'npm'
  const installerManager =
    appManager ?? rootManager ?? lockManager ?? getPkgManager(directory)
  const installer = readReleaseAgePolicy(
    installRoot,
    installerManager,
    false,
    'next'
  )
  const codemodInstaller =
    codemodManager === installerManager && installRoot === directory
      ? installer
      : readReleaseAgePolicy(directory, codemodManager, false, 'next')
  return { installer, codemodInstaller }
}

export function isReleaseAllowed(
  packageName: 'next' | '@next/codemod',
  version: string,
  publishedAt: string | undefined,
  policy: ReleaseAgePolicy
): boolean {
  if (policy.before === null) {
    return true
  }
  for (const rule of policy.exclude) {
    // npm exemptions match names only; pnpm/Yarn can name exact versions or descriptors.
    const separator = rule.indexOf('@', rule.startsWith('@') ? 1 : 0)
    const name =
      policy.manager === 'npm' || separator < 0
        ? rule
        : rule.slice(0, separator)
    let matchesName: boolean
    if (policy.manager === 'pnpm') {
      const negative = name.startsWith('!')
      const pattern = negative ? name.slice(1) : name
      const matches = new RegExp(
        `^${pattern.split('*').map(escapeStringRegexp).join('.*')}$`
      ).test(packageName)
      matchesName = negative ? !matches : matches
    } else {
      matchesName = picomatch.isMatch(packageName, name, {
        nonegate: policy.manager === 'npm',
        noext: policy.manager === 'npm',
      })
    }
    if (!matchesName) {
      continue
    }
    if (policy.manager === 'npm' || separator < 0) {
      return true
    }
    const requested = rule.slice(separator + 1)
    const matches =
      policy.manager === 'pnpm'
        ? requested
            .split('||')
            .some((candidate) => semver.valid(candidate.trim()) === version)
        : semver.validRange(requested) !== null &&
          semver.satisfies(version, requested)
    if (matches) {
      return true
    }
    if (policy.manager === 'pnpm') {
      break
    }
  }
  const time = publishedAt === undefined ? NaN : Date.parse(publishedAt)
  return Number.isFinite(time) && time <= policy.before
}

export function isUpgradeReleaseAllowed(
  version: string,
  publishedAt: string | undefined,
  installedVersion: string,
  policies: UpgradeReleaseAge
): boolean {
  return (
    isReleaseAllowed('next', version, publishedAt, policies.installer) &&
    (semver.major(version) <= semver.major(installedVersion) ||
      isReleaseAllowed('next', version, publishedAt, policies.codemodInstaller))
  )
}

export async function getReleaseMetadata(
  name: 'next' | '@next/codemod'
): Promise<ReleaseMetadata> {
  const response = await fetch(`https://registry.npmjs.org/${name}`, {
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: 'application/json' },
    redirect: 'error',
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(
      `Could not fetch ${name} release dates (HTTP ${response.status}).`
    )
  }
  const value = await response.json()
  if (
    !value ||
    typeof value.versions !== 'object' ||
    !value.versions ||
    !value['dist-tags'] ||
    typeof value['dist-tags'] !== 'object'
  ) {
    throw new Error(`Could not determine ${name} release dates.`)
  }
  return value
}

export function assertToolReleaseAllowed(
  name: 'next' | '@next/codemod',
  version: string,
  metadata: ReleaseMetadata,
  policy: ReleaseAgePolicy
) {
  if (
    metadata.versions[version]?.version !== version ||
    !isReleaseAllowed(name, version, metadata.time?.[version], policy)
  ) {
    throw new Error(
      `${name}@${version} does not satisfy the package manager release-age policy.`
    )
  }
}
