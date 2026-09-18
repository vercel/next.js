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

  // TODO: Handle prereleases
  if (semver.prerelease(installedVersion)) {
    throw new Error(
      'AI upgrades are not available for prerelease versions of Next.js yet.'
    )
  }

  if (targetRequest === 'latest' || targetRequest === 'future') {
    const url = `${NPM_REGISTRY}next/latest`
    const { value } = await fetchJSON(url)
    const release = value as { version: string } | null

    if (
      !release ||
      !semver.valid(release.version) ||
      semver.prerelease(release.version)
    ) {
      throw new Error('Could not determine the latest stable Next.js version.')
    }

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
        reason: `Next.js ${installedVersion} is already the latest stable release.`,
      }
    }

    if (
      targetRequest === 'latest' &&
      semver.lt(release.version, installedVersion)
    ) {
      return {
        status: 'unaffected',
        reason: `Next.js ${installedVersion} is newer than the latest stable release ${release.version}.`,
      }
    }

    let pendingFutureDefaults: FutureDefaultEntry[] = []

    if (targetRequest === 'future') {
      const securitySnapshot = await readSecuritySnapshot(targetVersion)

      if (
        securitySnapshot?.ranges.some((range) =>
          semver.satisfies(targetVersion, range)
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
      references: [url],
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

export async function getLatestUpgradeVersion(version: string) {
  // TODO: Support prerelease upgrade policies once their target selection is
  // defined for explicit upgrades and background reminders.
  if (!semver.valid(version) || semver.prerelease(version)) {
    return null
  }

  const { value } = await fetchJSON(`${NPM_REGISTRY}next/latest`)
  const release = value as { version: string } | null

  if (
    !release ||
    !semver.valid(release.version) ||
    semver.prerelease(release.version) !== null ||
    !semver.gt(release.version, version)
  ) {
    return null
  }

  // Patch releases remain available to explicit upgrades without a reminder.
  if (
    semver.major(release.version) === semver.major(version) &&
    semver.minor(release.version) === semver.minor(version)
  ) {
    return null
  }

  return release.version
}

// Count only advisories affecting the running version for the startup prompt.
// Full release selection remains in the explicit upgrade command.
export async function getSecurityAdvisory(version: string) {
  if (!semver.valid(version)) {
    throw new Error('The running Next.js version is not valid semver.')
  }

  if (semver.prerelease(version)) {
    return null
  }

  let advisories: Advisory[]
  let reference: string

  try {
    const result = await readGitHubAdvisories(version)
    advisories = result.advisories
    reference = result.reference
  } catch {
    advisories = await readNpmAdvisories([version])
    reference = NPM_ADVISORIES
  }

  if (
    !affectedRanges(advisories).some((range) =>
      semver.satisfies(version, range)
    )
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
      !githubRanges.some((range) => semver.satisfies(installedVersion, range))
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
    releases = parseReleases(value)

    if (githubRanges) {
      ranges = githubRanges
      advisoryReference = ADVISORIES
    } else {
      // Query every published version, including prereleases: querying only the
      // installed version could miss advisories affecting a candidate target.
      const versions = Object.keys(
        (value as { versions: Record<string, unknown> }).versions
      ).filter((version) => semver.valid(version))
      ranges = affectedRanges(await readNpmAdvisories(versions))
      advisoryReference = NPM_ADVISORIES
    }
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

  if (!ranges.some((range) => semver.satisfies(source, range))) {
    return
  }

  const releases = snapshot.releases
  // Consider only the latest stable release of each major, not an older patch
  // that happens to be safe while that major's latest release is affected.
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
