import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { join } from 'path'
import { resetEnv } from '@next/env'
import semver from 'next/dist/compiled/semver'
import loadConfig from '../../server/config'
import { PHASE_INFO } from '../../shared/lib/constants'
import { futureDefaults, type FutureDefaultEntry } from './future-defaults'

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

  if (semver.prerelease(installedVersion) && !isCanary(installedVersion)) {
    throw new Error(
      'AI upgrades are not available for prerelease versions of Next.js yet.'
    )
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
  const pendingFutureDefaults = futureDefaults.filter(
    (futureDefault) =>
      semver.gte(upgrade.targetVersion, futureDefault.availableSince) &&
      !futureDefault.isAdopted(config)
  )

  if (
    upgrade.targetVersion === installedVersion &&
    pendingFutureDefaults.length === 0
  ) {
    return {
      status: 'unaffected',
      reason: `Next.js ${installedVersion} is current and all available Future Defaults are enabled.`,
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
  policy: 'security' | 'latest' | 'future'
): Promise<UpgradeAssessment> {
  if (!semver.valid(installedVersion)) {
    throw new Error('The running Next.js version is not valid semver.')
  }
  if (semver.prerelease(installedVersion) && !isCanary(installedVersion)) {
    throw new Error(
      'AI upgrades are not available for prerelease versions of Next.js yet.'
    )
  }
  const canary = isCanary(installedVersion)
  if (canary && policy === 'security') {
    return {
      affected: null,
      reference: null,
      upgrade: {
        status: 'blocked',
        reason:
          'Security upgrades are not supported for canary versions of Next.js. Use --ai=latest or --ai=future to upgrade on the canary channel.',
      },
    }
  }
  // Canary version ordering does not establish which security fixes it contains.
  // Keep canary latest/Future upgrades independent of advisory assessment.
  const snapshot = canary ? null : await readAdvisorySnapshot(installedVersion)
  const affected = snapshot
    ? snapshot.ranges.some((range) => semver.satisfies(installedVersion, range))
    : null
  const assessment = { affected, reference: snapshot?.reference ?? null }

  if (snapshot && snapshot.targetError !== null) {
    return {
      ...assessment,
      upgrade: { status: 'unknown', reason: snapshot.targetError },
    }
  }

  if (policy === 'security' && !affected) {
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
      const registry = snapshot.registry ?? (await fetchJSON(registryURL)).value
      const releases = parseReleases(registry)
      references = [snapshot.reference, registryURL]
      try {
        targetVersion = selectSecurityTarget(installedVersion, {
          ranges: snapshot.ranges,
          releases,
          references,
        })!.version
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
          canary
            ? 'Could not determine the latest Next.js version on the canary dist-tag.'
            : 'Could not determine the latest stable Next.js version.'
        )
      }
      targetVersion =
        policy === 'future' && semver.gt(installedVersion, release.version)
          ? installedVersion
          : release.version
      references = [release.reference]
      const releaseKind = canary ? 'canary release' : 'stable release'

      if (policy === 'latest' && semver.lt(targetVersion, installedVersion)) {
        return {
          ...assessment,
          upgrade: {
            status: 'unaffected',
            reason: `Next.js ${installedVersion} is newer than the latest ${releaseKind} ${targetVersion}.`,
          },
        }
      }

      // The tag can advance after npm's published-version snapshot was read.
      // Include that exact target in the fallback query as well.
      if (
        snapshot &&
        snapshot.registry !== null &&
        !advisoryVersions(snapshot.registry, installedVersion).includes(
          targetVersion
        )
      ) {
        snapshot.ranges = affectedRanges(
          await readNpmAdvisories([
            ...advisoryVersions(snapshot.registry, installedVersion),
            targetVersion,
          ])
        )
        assessment.affected ||= snapshot.ranges.some((range) =>
          semver.satisfies(installedVersion, range)
        )
      }
      if (
        snapshot?.ranges.some((range) => semver.satisfies(targetVersion, range))
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

type Advisory = {
  withdrawn_at: string | null
  vulnerabilities: {
    package: { ecosystem: string; name: string }
    vulnerable_version_range: string
  }[]
}

type PackageRelease = {
  version: string
}

type SecuritySnapshot = {
  ranges: string[]
  releases: PackageRelease[]
  references: string[]
}

const ADVISORIES =
  'https://api.github.com/advisories?ecosystem=npm&affects=next&type=reviewed&per_page=100'
const NPM_REGISTRY = 'https://registry.npmjs.org/'
const NPM_ADVISORIES = `${NPM_REGISTRY}-/npm/v1/security/advisories/bulk`

async function fetchJSON(
  url: string,
  init: RequestInit | undefined = undefined
): Promise<{ value: unknown; headers: Headers }> {
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

    return { value: await response.json(), headers: response.headers }
  } catch (error) {
    throw new Error('Could not fetch upgrade metadata. Please try again.', {
      cause: error,
    })
  }
}

function isCanary(version: string): boolean {
  return semver.prerelease(version)?.[0] === 'canary'
}

function parseReleases(value: unknown): SecuritySnapshot['releases'] {
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

function affectedRanges(advisories: Advisory[]): string[] {
  const ranges: string[] = []

  for (const advisory of advisories) {
    if (
      !advisory ||
      !Array.isArray(advisory.vulnerabilities) ||
      !('withdrawn_at' in advisory)
    ) {
      throw new Error('Could not check for security updates.')
    }

    if (advisory.withdrawn_at) {
      continue
    }

    for (const finding of advisory.vulnerabilities) {
      if (
        !finding.package ||
        typeof finding.package.name !== 'string' ||
        typeof finding.package.ecosystem !== 'string'
      ) {
        throw new Error('Could not check for security updates.')
      }

      if (
        finding.package.ecosystem !== 'npm' ||
        finding.package.name !== 'next'
      ) {
        continue
      }

      if (
        typeof finding.vulnerable_version_range !== 'string' ||
        !finding.vulnerable_version_range.trim()
      ) {
        throw new Error('Could not check for security updates.')
      }

      const range = finding.vulnerable_version_range.replace(/,\s*/g, ' ')

      if (!semver.validRange(range)) {
        throw new Error('Could not check for security updates.')
      }

      ranges.push(range)
    }
  }

  return ranges
}

export function getLatestUpgradeVersion(
  version: string,
  targetVersion: string
) {
  if (
    !semver.valid(version) ||
    !semver.valid(targetVersion) ||
    (semver.prerelease(version) && !isCanary(version)) ||
    (isCanary(version)
      ? !isCanary(targetVersion)
      : semver.prerelease(targetVersion)) ||
    !semver.gt(targetVersion, version)
  ) {
    return null
  }
  // Patches and consecutive canaries remain available to explicit upgrades
  // without a reminder.
  if (
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
  const canary = isCanary(installedVersion)
  const reference = `${NPM_REGISTRY}next/${canary ? 'canary' : 'latest'}`
  const { value } = await fetchJSON(reference)
  const release = value as { version: string } | null

  if (
    !release ||
    !semver.valid(release.version) ||
    (canary ? !isCanary(release.version) : semver.prerelease(release.version))
  ) {
    return null
  }

  return { version: release.version, reference }
}

async function readGitHubAdvisories(version: string | null) {
  const advisories: Advisory[] = []
  const visited = new Set<string>()
  const affects = version === null ? 'next' : `next@${version}`
  const firstPage = new URL(ADVISORIES)
  firstPage.searchParams.set('affects', affects)
  let url: string | undefined = firstPage.href

  for (let page = 0; url; page++) {
    if (page === 100) {
      throw new Error('Could not check for security updates.')
    }

    visited.add(url)
    const { value, headers } = await fetchJSON(url)

    if (!Array.isArray(value)) {
      throw new Error('Could not check for security updates.')
    }

    advisories.push(...value)
    const next = headers
      .get('link')
      ?.split(',')
      .find((part) => /rel="next"/.test(part))
      ?.match(/<([^>]+)>/)?.[1]

    if (next) {
      const parsed = new URL(next)

      if (
        parsed.origin !== 'https://api.github.com' ||
        parsed.pathname !== '/advisories' ||
        parsed.searchParams.get('ecosystem') !== 'npm' ||
        parsed.searchParams.get('affects') !== affects ||
        parsed.searchParams.get('type') !== 'reviewed' ||
        visited.has(next)
      ) {
        throw new Error('Could not check for security updates.')
      }
    }

    url = next
  }

  return { advisories, reference: firstPage.href }
}

async function readNpmAdvisories(versions: string[]): Promise<Advisory[]> {
  const { value } = await fetchJSON(NPM_ADVISORIES, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ next: versions }),
  })

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

  const advisories: Advisory[] = data.next.map((finding) => {
    if (!finding || typeof finding.vulnerable_versions !== 'string') {
      throw new Error('Could not check for security updates.')
    }

    return {
      // npm's active advisory feed does not expose withdrawal metadata.
      withdrawn_at: null,
      vulnerabilities: [
        {
          package: { ecosystem: 'npm', name: 'next' },
          vulnerable_version_range: finding.vulnerable_versions,
        },
      ],
    }
  })
  return advisories
}

function advisoryVersions(value: unknown, checkedVersion: string): string[] {
  const data = value as { versions: Record<string, unknown> | undefined }
  if (
    !data?.versions ||
    typeof data.versions !== 'object' ||
    Array.isArray(data.versions)
  ) {
    throw new Error('Could not check for security updates.')
  }

  // Include all published versions to retrieve advisories affecting candidates,
  // not only the installed version.
  const versions = Object.keys(data.versions).filter((version) =>
    semver.valid(version)
  )
  if (!versions.includes(checkedVersion)) {
    versions.push(checkedVersion)
  }
  return versions
}

// TODO: Replace provider-specific requests with a Next.js-maintained endpoint
// that returns advisory ranges and exact safe targets for each major.
async function readAdvisorySnapshot(installedVersion: string): Promise<{
  ranges: string[]
  reference: string
  registry: unknown | null
  targetError: string | null
}> {
  // Accept GitHub evidence only after every page and range validates. On
  // failure, npm replaces the entire set, including candidate advisories.
  try {
    const { advisories, reference } = await readGitHubAdvisories(null)
    return {
      ranges: affectedRanges(advisories),
      reference,
      registry: null,
      targetError: null,
    }
  } catch (githubFailure) {
    try {
      const { value } = await fetchJSON(`${NPM_REGISTRY}next`)
      const ranges = affectedRanges(
        await readNpmAdvisories(advisoryVersions(value, installedVersion))
      )
      return {
        ranges,
        reference: NPM_ADVISORIES,
        registry: value,
        targetError: null,
      }
    } catch (error) {
      // A source-only response can still establish a warning, but cannot
      // establish target safety.
      try {
        const ranges = affectedRanges(
          await readNpmAdvisories([installedVersion])
        )
        if (ranges.some((range) => semver.satisfies(installedVersion, range))) {
          return {
            ranges,
            reference: NPM_ADVISORIES,
            registry: null,
            targetError: 'Could not assess upgrade targets. Please try again.',
          }
        }
      } catch {
        // Neither provider could establish even a source-only warning.
      }
      throw new Error(
        'Could not check for security updates. Please try again.',
        { cause: [githubFailure, error] }
      )
    }
  }
}

function selectSecurityTarget(
  source: string,
  snapshot: SecuritySnapshot
): PackageRelease | undefined {
  const ranges = snapshot.ranges

  if (!ranges.some((range) => semver.satisfies(source, range))) {
    return
  }

  const releases = snapshot.releases
  // Consider only the latest stable release of each major, not an older safe patch.
  const latest = new Map<number, PackageRelease>()

  for (const release of releases) {
    const major = semver.major(release.version)
    const previous = latest.get(major)

    if (!previous || semver.gt(release.version, previous.version)) {
      latest.set(major, release)
    }
  }

  for (const major of [...latest.keys()].sort((a, b) => a - b)) {
    if (major < semver.major(source)) {
      continue
    }

    const candidate = latest.get(major)!

    if (
      semver.gt(candidate.version, source) &&
      !ranges.some((range) => semver.satisfies(candidate.version, range))
    ) {
      return candidate
    }
  }

  throw new Error('No safe Next.js update is currently available.')
}
