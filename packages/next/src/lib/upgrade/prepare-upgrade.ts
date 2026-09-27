import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { join } from 'path'
import { resetEnv } from '@next/env'
import semver from 'next/dist/compiled/semver'
import loadConfig from '../../server/config'
import { PHASE_INFO } from '../../shared/lib/constants'
import {
  getPendingFutureDefaults,
  type FutureDefaultEntry,
} from './future-defaults'

type UpgradePreparation =
  | { status: 'unaffected'; reason: string }
  | {
      status: 'ready'
      installedVersion: string
      targetVersion: string
      references: string[]
      futureDefaults: FutureDefaultEntry[]
    }

export async function prepareUpgrade(
  directory: string,
  targetRequest: string = 'security'
): Promise<UpgradePreparation> {
  if (
    targetRequest !== 'security' &&
    targetRequest !== 'latest' &&
    targetRequest !== 'future'
  ) {
    throw new Error(
      `Unsupported AI upgrade type ${JSON.stringify(targetRequest)}. Expected "security", "latest", or "future".`
    )
  }

  // Resolve from the app: the invoking canary is only the upgrade tooling.
  const requireFromApp = createRequire(join(directory, 'package.json'))
  const installedNext = JSON.parse(
    await readFile(requireFromApp.resolve('next/package.json'), 'utf8')
  ) as {
    version: string
  }
  const installedVersion = installedNext.version

  if (!semver.valid(installedVersion)) {
    throw new Error('Could not determine the installed Next.js version.')
  }

  const { upgrade } = await getUpgradeAssessment(
    installedVersion,
    targetRequest
  )
  if (upgrade.status === 'blocked' || upgrade.status === 'unknown') {
    throw new Error(upgrade.reason)
  }
  if (upgrade.status !== 'ready' || targetRequest !== 'future') {
    return upgrade
  }

  const config = await loadConfig(PHASE_INFO, directory, {
    silent: true,
  }).finally(resetEnv)
  const pendingFutureDefaults = getPendingFutureDefaults(
    directory,
    config,
    upgrade.targetVersion
  )

  if (
    upgrade.targetVersion === installedVersion &&
    pendingFutureDefaults.length === 0
  ) {
    return {
      status: 'unaffected',
      reason: `Next.js ${installedVersion} is current and no applicable Future Defaults are pending.`,
    }
  }

  return { ...upgrade, futureDefaults: pendingFutureDefaults }
}

export type UpgradeAssessment = {
  // null means advisory assessment is unsupported for this release channel.
  affected: boolean | null
  reference: string | null
  upgrade:
    | UpgradePreparation
    | { status: 'blocked'; reason: string }
    | { status: 'unknown'; reason: string }
}

// TODO: Cache assessments briefly by installed version, policy, and resolved
// target to avoid repeating nudge lookups. New advisories can affect the same
// target, so expire cached results and refresh metadata before execution.
export async function getUpgradeAssessment(
  installedVersion: string,
  policy: 'security' | 'latest' | 'future',
  onlyIfAffected: boolean = false
): Promise<UpgradeAssessment> {
  if (!semver.valid(installedVersion)) {
    throw new Error('The running Next.js version is not valid semver.')
  }
  const channel = getPrereleaseChannel(installedVersion)
  if (semver.prerelease(installedVersion) && !channel) {
    throw new Error(
      'AI upgrades are not available for this prerelease version of Next.js.'
    )
  }
  if (channel && (policy === 'security' || onlyIfAffected)) {
    return {
      affected: null,
      reference: null,
      upgrade: {
        status: 'blocked',
        reason: `The installed Next.js version (${installedVersion}) is a ${channel} prerelease. Security advisories target stable versions, and prereleases do not reliably follow stable version ordering, so an advisory could be a false positive. To upgrade to the latest ${channel === 'canary' ? 'canary' : 'stable'} release, run this command from the app's directory:\n\nnpx next@canary upgrade --ai=latest`,
      },
    }
  }
  if (channel && channel !== 'canary' && policy === 'future') {
    return {
      affected: null,
      reference: null,
      upgrade: {
        status: 'blocked',
        reason: `Future Defaults upgrades are not supported for Next.js ${installedVersion}. To upgrade to the latest stable release, run this command from the app's directory:\n\nnpx next@canary upgrade --ai=latest`,
      },
    }
  }
  // Prerelease version ordering does not establish which security fixes it
  // contains, but stable promotion targets still need advisory validation.
  let snapshot: { ranges: string[]; reference: string } | null = null
  if (channel !== 'canary') {
    try {
      snapshot = {
        ranges: await readNpmAdvisories([installedVersion]),
        reference: NPM_ADVISORIES,
      }
    } catch {
      return {
        affected: null,
        reference: null,
        upgrade: {
          status: 'unknown',
          reason: 'Could not check for security updates. Please try again.',
        },
      }
    }
  }
  const affected =
    snapshot && !channel
      ? snapshot.ranges.some((range) =>
          semver.satisfies(installedVersion, range)
        )
      : null
  const assessment = { affected, reference: snapshot?.reference ?? null }

  // A dismissed release reminder still checks advisories, but does not need
  // target metadata unless an advisory applies.
  if ((policy === 'security' || onlyIfAffected) && !affected) {
    return {
      ...assessment,
      upgrade: {
        status: 'unaffected',
        reason: `No security update is needed for Next.js ${installedVersion}.`,
      },
    }
  }

  // Keep a confirmed advisory even when target metadata cannot be read.
  try {
    let targetVersion: string
    let references: string[]
    if (policy === 'security' && snapshot) {
      const registryURL = `${NPM_REGISTRY}next`
      const registry = (await fetchJSON(registryURL)).value
      const releases = parseReleases(registry)
      references = [snapshot.reference, registryURL]
      const candidates = securityCandidates(installedVersion, releases)
      const ranges = [
        ...snapshot.ranges,
        ...(candidates.length
          ? await readNpmAdvisories(candidates.map(({ version }) => version))
          : []),
      ]
      try {
        targetVersion = selectSecurityTarget(
          installedVersion,
          releases,
          ranges
        )!.version
      } catch (error) {
        return {
          ...assessment,
          upgrade: { status: 'blocked', reason: (error as Error).message },
        }
      }
    } else {
      const release = await fetchLatestRelease(installedVersion)
      if (!release) {
        throw new Error(
          channel === 'canary'
            ? 'Could not determine the latest Next.js version on the canary dist-tag.'
            : 'Could not determine the latest stable Next.js version.'
        )
      }
      targetVersion =
        policy === 'future' && semver.gt(installedVersion, release.version)
          ? installedVersion
          : release.version
      references = [release.reference]
      const releaseKind =
        channel === 'canary' ? 'canary release' : 'stable release'

      if (policy === 'latest' && semver.lt(targetVersion, installedVersion)) {
        return {
          ...assessment,
          upgrade: {
            status: 'unaffected',
            reason: `Next.js ${installedVersion} is newer than the latest ${releaseKind} ${targetVersion}.`,
          },
        }
      }

      const targetRanges =
        snapshot && targetVersion !== installedVersion
          ? await readNpmAdvisories([targetVersion])
          : snapshot?.ranges
      if (
        targetRanges?.some((range) => semver.satisfies(targetVersion, range))
      ) {
        return {
          ...assessment,
          upgrade: {
            status: 'blocked',
            reason: `Next.js ${targetVersion} is affected by an active advisory.`,
          },
        }
      }

      if (policy === 'latest' && semver.eq(targetVersion, installedVersion)) {
        return {
          ...assessment,
          upgrade: {
            status: 'unaffected',
            reason: `Next.js ${installedVersion} is already the latest ${releaseKind}.`,
          },
        }
      }
    }

    return {
      ...assessment,
      upgrade: {
        status: 'ready',
        installedVersion,
        targetVersion,
        references,
        futureDefaults: [],
      },
    }
  } catch (error) {
    return {
      ...assessment,
      upgrade: { status: 'unknown', reason: (error as Error).message },
    }
  }
}

type PackageRelease = {
  version: string
}

const NPM_REGISTRY = 'https://registry.npmjs.org/'
const NPM_ADVISORIES = `${NPM_REGISTRY}-/npm/v1/security/advisories/bulk`

async function fetchJSON(
  url: string,
  init: RequestInit | undefined = undefined
): Promise<{ value: unknown }> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return { value: await response.json() }
  } catch (error) {
    throw new Error('Could not fetch upgrade metadata. Please try again.', {
      cause: error,
    })
  }
}

export function getPrereleaseChannel(version: string): string | null {
  const channel = semver.prerelease(version)?.[0]
  return channel === 'canary' ||
    channel === 'rc' ||
    channel === 'beta' ||
    channel === 'preview'
    ? channel
    : null
}

function parseReleases(value: unknown): PackageRelease[] {
  const data = value as {
    versions:
      | Record<
          string,
          {
            version: string
          }
        >
      | undefined
  }

  if (!data?.versions) {
    throw new Error('Could not determine a safe Next.js version.')
  }

  return Object.entries(data.versions).flatMap(([version, metadata]) => {
    if (!semver.valid(version) || semver.prerelease(version)) {
      return []
    }

    if (metadata.version !== version) {
      throw new Error('Could not determine a safe Next.js version.')
    }

    return [{ version }]
  })
}

export function getLatestUpgradeVersion(
  version: string,
  targetVersion: string
) {
  const channel = getPrereleaseChannel(version)
  const targetChannel = getPrereleaseChannel(targetVersion)
  if (
    !semver.valid(version) ||
    !semver.valid(targetVersion) ||
    (semver.prerelease(version) && !channel) ||
    (semver.prerelease(targetVersion) && !targetChannel) ||
    (channel === 'canary'
      ? targetChannel !== 'canary'
      : targetChannel !== null) ||
    !semver.gt(targetVersion, version)
  ) {
    return null
  }
  // Stable releases replacing prereleases still warrant a reminder, even
  // within the same minor. Patches and consecutive canaries remain explicit.
  if (
    !(channel && channel !== 'canary') &&
    semver.major(targetVersion) === semver.major(version) &&
    semver.minor(targetVersion) === semver.minor(version)
  ) {
    return null
  }
  return targetVersion
}

async function fetchLatestRelease(installedVersion: string): Promise<{
  version: string
  reference: string
} | null> {
  const channel = getPrereleaseChannel(installedVersion)
  const releaseChannel = channel === 'canary' ? 'canary' : 'latest'
  const reference = `${NPM_REGISTRY}next/${releaseChannel}`
  const { value } = await fetchJSON(reference)
  const release = value as { version: string } | null

  if (
    !release ||
    !semver.valid(release.version) ||
    (channel !== 'canary' && semver.prerelease(release.version)) ||
    getPrereleaseChannel(release.version) !==
      (channel === 'canary' ? 'canary' : null)
  ) {
    return null
  }

  return { version: release.version, reference }
}

// TODO: Record whether each advisory lookup succeeded or failed in upgrade telemetry.
async function readNpmAdvisories(versions: string[]): Promise<string[]> {
  let value: unknown
  try {
    value = (
      await fetchJSON(NPM_ADVISORIES, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ next: versions }),
      })
    ).value
  } catch (error) {
    throw new Error('Could not check for security updates. Please try again.', {
      cause: error,
    })
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Could not check for security updates.')
  }

  const data = value as Record<string, unknown>

  if (Object.keys(data).some((name) => name !== 'next')) {
    throw new Error('Could not check for security updates.')
  }

  // The bulk endpoint omits packages with no known vulnerabilities.
  if (!('next' in data)) {
    return []
  }

  if (!Array.isArray(data.next)) {
    throw new Error('Could not check for security updates.')
  }

  return data.next.map((finding) => {
    if (
      !finding ||
      typeof finding.vulnerable_versions !== 'string' ||
      !finding.vulnerable_versions.trim()
    ) {
      throw new Error('Could not check for security updates.')
    }
    const range = finding.vulnerable_versions.replace(/,\s*/g, ' ')
    if (!semver.validRange(range)) {
      throw new Error('Could not check for security updates.')
    }
    return range
  })
}

function securityCandidates(
  source: string,
  releases: PackageRelease[]
): PackageRelease[] {
  // Only the newest stable release of each eligible major is considered.
  const latest = new Map<number, PackageRelease>()
  for (const release of releases) {
    const major = semver.major(release.version)
    const previous = latest.get(major)
    if (!previous || semver.gt(release.version, previous.version)) {
      latest.set(major, release)
    }
  }
  return [...latest.entries()]
    .sort(([a], [b]) => a - b)
    .filter(
      ([major, release]) =>
        major >= semver.major(source) && semver.gt(release.version, source)
    )
    .map(([, release]) => release)
}

function selectSecurityTarget(
  source: string,
  releases: PackageRelease[],
  ranges: string[]
): PackageRelease | undefined {
  if (!ranges.some((range) => semver.satisfies(source, range))) {
    return
  }

  for (const candidate of securityCandidates(source, releases)) {
    if (!ranges.some((range) => semver.satisfies(candidate.version, range))) {
      return candidate
    }
  }

  throw new Error('No safe Next.js update is currently available.')
}
