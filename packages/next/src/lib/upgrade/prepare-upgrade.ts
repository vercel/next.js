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

  if (targetRequest === 'latest' || targetRequest === 'future') {
    const canary = isCanary(installedVersion)
    const release = await fetchLatestRelease(installedVersion)

    if (!release) {
      throw new Error(
        canary
          ? 'Could not determine the latest Next.js version on the canary dist-tag.'
          : 'Could not determine the latest stable Next.js version.'
      )
    }

    const releaseKind = canary ? 'canary release' : 'stable release'
    const targetVersion =
      targetRequest === 'future' && semver.gt(installedVersion, release.version)
        ? installedVersion
        : release.version

    if (
      targetRequest === 'latest' &&
      semver.eq(release.version, installedVersion)
    ) {
      return {
        status: 'unaffected',
        reason: `Next.js ${installedVersion} is already the latest ${releaseKind}.`,
      }
    }

    if (
      targetRequest === 'latest' &&
      semver.lt(release.version, installedVersion)
    ) {
      return {
        status: 'unaffected',
        reason: `Next.js ${installedVersion} is newer than the latest ${releaseKind} ${release.version}.`,
      }
    }

    let pendingFutureDefaults: FutureDefaultEntry[] = []

    if (targetRequest === 'future') {
      const securitySnapshot = await readSecuritySnapshot(targetVersion)

      if (
        securitySnapshot?.ranges.some((range) =>
          matchesAdvisory(targetVersion, range)
        )
      ) {
        throw new Error(
          `Next.js ${targetVersion} is affected by an active advisory.`
        )
      }

      const config = await loadConfig(PHASE_INFO, directory, {
        silent: true,
      }).finally(resetEnv)

      pendingFutureDefaults = futureDefaults.filter(
        (futureDefault) =>
          semver.gte(targetVersion, futureDefault.availableSince) &&
          !futureDefault.isAdopted(config)
      )

      if (
        targetVersion === installedVersion &&
        pendingFutureDefaults.length === 0
      ) {
        return {
          status: 'unaffected',
          reason: `Next.js ${installedVersion} is current and all available Future Defaults are enabled.`,
        }
      }
    }

    return {
      status: 'ready',
      installedVersion,
      targetVersion,
      references: [release.reference],
      futureDefaults: pendingFutureDefaults,
    }
  }

  const snapshot = await readSecuritySnapshot(installedVersion)

  if (!snapshot) {
    return {
      status: 'unaffected',
      reason: `No security update is needed for Next.js ${installedVersion}.`,
    }
  }

  const selected = selectSecurityTarget(installedVersion, snapshot)

  if (!selected) {
    return {
      status: 'unaffected',
      reason: `No security update is needed for Next.js ${installedVersion}.`,
    }
  }

  return {
    status: 'ready',
    installedVersion,
    targetVersion: selected.version,
    references: snapshot.references,
    futureDefaults: [],
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

function matchesAdvisory(version: string, range: string): boolean {
  return semver.satisfies(version, range, {
    includePrerelease: isCanary(version),
  })
}

function parseReleases(
  value: unknown,
  canary: boolean
): SecuritySnapshot['releases'] {
  const data = value as {
    versions:
      | Record<
          string,
          {
            version: string
          }
        >
      | undefined
    'dist-tags': Record<string, string> | undefined
  }

  if (!data?.versions) {
    throw new Error('Could not determine a safe Next.js version.')
  }

  if (canary) {
    const version = data['dist-tags']?.canary
    if (
      !version ||
      !semver.valid(version) ||
      !isCanary(version) ||
      data.versions[version]?.version !== version
    ) {
      throw new Error(
        'Could not determine a published Next.js version on the canary dist-tag.'
      )
    }

    // Follow the channel's current target, not an arbitrary published canary.
    return [{ version }]
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

export async function getLatestUpgradeVersion(version: string) {
  if (
    !semver.valid(version) ||
    (semver.prerelease(version) && !isCanary(version))
  ) {
    return null
  }

  const release = await fetchLatestRelease(version)

  if (!release || !semver.gt(release.version, version)) {
    return null
  }

  // Patches and consecutive canaries remain available to explicit upgrades
  // without a reminder.
  if (
    semver.major(release.version) === semver.major(version) &&
    semver.minor(release.version) === semver.minor(version)
  ) {
    return null
  }

  return release.version
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

// Count only advisories affecting the running version for the startup prompt.
// Full release selection remains in the explicit upgrade command.
export async function getSecurityAdvisory(version: string) {
  if (!semver.valid(version)) {
    throw new Error('The running Next.js version is not valid semver.')
  }

  if (semver.prerelease(version) && !isCanary(version)) {
    return null
  }

  let advisories: Advisory[]
  let reference: string

  try {
    // Match canaries locally against the complete package advisory set.
    const result = await readGitHubAdvisories(
      isCanary(version) ? null : version
    )
    advisories = result.advisories
    reference = result.reference
  } catch {
    if (isCanary(version)) {
      const { value } = await fetchJSON(`${NPM_REGISTRY}next`)
      advisories = await readNpmAdvisories(advisoryVersions(value, version))
    } else {
      advisories = await readNpmAdvisories([version])
    }
    reference = NPM_ADVISORIES
  }

  if (
    !affectedRanges(advisories).some((range) => matchesAdvisory(version, range))
  ) {
    return null
  }

  return { reference }
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

  // npm omits stable-range advisories when queried only for a canary. Include
  // published stable versions as well as prereleases to retrieve their ranges.
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
async function readSecuritySnapshot(
  installedVersion: string
): Promise<SecuritySnapshot | undefined> {
  // Accept GitHub evidence only after every page succeeds. On failure, npm
  // replaces the entire advisory set rather than supplementing partial results.
  let githubRanges: string[] | undefined
  let githubFailure: unknown

  try {
    githubRanges = affectedRanges((await readGitHubAdvisories(null)).advisories)

    if (
      !githubRanges.some((range) => matchesAdvisory(installedVersion, range))
    ) {
      return
    }
  } catch (error) {
    githubFailure = error
  }

  const registryURL = `${NPM_REGISTRY}next`
  let releases: SecuritySnapshot['releases']
  let ranges: string[]
  let advisoryReference: string

  try {
    const { value } = await fetchJSON(registryURL)

    if (githubRanges) {
      ranges = githubRanges
      advisoryReference = ADVISORIES
    } else {
      // Query every published version, including prereleases: querying only the
      // installed version could miss advisories affecting a candidate target.
      ranges = affectedRanges(
        await readNpmAdvisories(advisoryVersions(value, installedVersion))
      )
      advisoryReference = NPM_ADVISORIES
    }

    if (!ranges.some((range) => matchesAdvisory(installedVersion, range))) {
      return
    }

    releases = parseReleases(value, isCanary(installedVersion))
  } catch (error) {
    if (!githubRanges) {
      throw new Error(
        'Could not check for security updates. Please try again.',
        { cause: [githubFailure, error] }
      )
    }

    throw error
  }

  return {
    ranges,
    releases,
    references: [advisoryReference, registryURL],
  }
}

function selectSecurityTarget(
  source: string,
  snapshot: SecuritySnapshot
): PackageRelease | undefined {
  const ranges = snapshot.ranges

  if (!ranges.some((range) => matchesAdvisory(source, range))) {
    return
  }

  const releases = snapshot.releases
  // For stable installs, consider only the latest release of each major, not
  // an older safe patch. Canary installs have only the current dist-tag target.
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
      !ranges.some((range) => matchesAdvisory(candidate.version, range))
    ) {
      return candidate
    }
  }

  if (isCanary(source)) {
    const target = releases[0].version
    const affected = ranges.filter((range) => matchesAdvisory(target, range))
    throw new Error(
      `Next.js ${source} is affected by a published security advisory. ` +
        (affected.length > 0
          ? `The current canary target ${target} also matches an advisory (${affected.join('; ')}), so the upgrade cannot proceed.`
          : `The current canary target ${target} is not newer, so the upgrade cannot proceed.`) +
        `\nReferences:\n${snapshot.references.join('\n')}`
    )
  }

  throw new Error('No safe Next.js update is currently available.')
}
