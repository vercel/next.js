import semver from 'next/dist/compiled/semver'

type Advisory = {
  ghsa_id: string
  html_url: string
  withdrawn_at: string | null
  vulnerabilities: {
    package: { ecosystem: string; name: string }
    vulnerable_version_range: string
  }[]
}

type PackageRelease = {
  version: string
  publishedAt: string
  nodeRange: string | null
}

export type SecuritySnapshot = {
  checkedAt: string
  advisories: Advisory[]
  releases: PackageRelease[]
  evidenceReferences: string[]
}

const ADVISORIES =
  'https://api.github.com/advisories?ecosystem=npm&affects=next&type=reviewed&per_page=100'
export const NPM_REGISTRY = 'https://registry.npmjs.org/'
const NPM_ADVISORIES = `${NPM_REGISTRY}-/npm/v1/security/advisories/bulk`

export async function fetchJSON(
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
    const detail =
      error instanceof Error && error.name === 'TimeoutError'
        ? 'Request timed out (10-second limit).'
        : error instanceof Error
          ? error.message
          : String(error)
    throw new Error(
      'Could not fetch upgrade metadata.\n' +
        `URL: ${url}\nCause: ${detail}\n` +
        'Check access to this URL, then retry next upgrade --experimental-agent.',
      { cause: error }
    )
  }
}

function parseReleases(value: unknown): PackageRelease[] {
  const data = value as {
    versions:
      | Record<
          string,
          {
            version: string
            engines: { node: string | undefined } | undefined
          }
        >
      | undefined
    time: Record<string, string> | undefined
  }

  if (!data?.versions || !data.time) {
    throw new Error('Incomplete npm release metadata.')
  }

  const time = data.time

  return Object.entries(data.versions).flatMap(([version, metadata]) => {
    if (!semver.valid(version) || semver.prerelease(version)) {
      return []
    }

    const publishedAt = time[version]

    if (
      metadata.version !== version ||
      !publishedAt ||
      !Number.isFinite(Date.parse(publishedAt))
    ) {
      throw new Error(`Incomplete metadata for Next.js ${version}.`)
    }

    return [
      {
        version,
        publishedAt,
        nodeRange: metadata.engines?.node ?? null,
      },
    ]
  })
}

function affectedRanges(advisories: Advisory[]): string[] {
  const ranges: string[] = []

  for (const advisory of advisories) {
    if (
      !advisory ||
      typeof advisory.ghsa_id !== 'string' ||
      !Array.isArray(advisory.vulnerabilities) ||
      !('withdrawn_at' in advisory)
    ) {
      throw new Error('Incomplete advisory data.')
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
        throw new Error(`Incomplete vulnerability in ${advisory.ghsa_id}.`)
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
        throw new Error(`Missing affected range in ${advisory.ghsa_id}.`)
      }

      const range = finding.vulnerable_version_range.replace(/,\s*/g, ' ')

      if (!semver.validRange(range)) {
        throw new Error(`Unparseable affected range in ${advisory.ghsa_id}.`)
      }

      ranges.push(range)
    }
  }

  return ranges
}

async function readGitHubAdvisories() {
  const advisories: Advisory[] = []
  const evidenceReferences: string[] = []
  let url: string | undefined = ADVISORIES

  for (let page = 0; url; page++) {
    if (page === 100) {
      throw new Error('Advisory pagination exceeded its bound.')
    }

    const { value, headers } = await fetchJSON(url)

    if (!Array.isArray(value)) {
      throw new Error('Invalid advisory response.')
    }

    advisories.push(...value)
    evidenceReferences.push(url)
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
        parsed.searchParams.get('affects') !== 'next' ||
        parsed.searchParams.get('type') !== 'reviewed' ||
        evidenceReferences.includes(next)
      ) {
        throw new Error('Invalid advisory pagination link.')
      }
    }

    url = next
  }

  affectedRanges(advisories)
  return { advisories, evidenceReferences }
}

async function readNpmAdvisories(versions: string[]): Promise<Advisory[]> {
  const { value } = await fetchJSON(NPM_ADVISORIES, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ next: versions }),
  })

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid npm advisory response.')
  }

  const data = value as Record<string, unknown>

  if (Object.keys(data).some((name) => name !== 'next')) {
    throw new Error('Unexpected package in npm advisory response.')
  }

  // The bulk endpoint omits packages with no known vulnerabilities.
  if (!('next' in data)) {
    return []
  }

  if (!Array.isArray(data.next)) {
    throw new Error('Invalid npm advisory list.')
  }

  const advisories: Advisory[] = data.next.map((finding) => {
    if (
      !finding ||
      !Number.isInteger(finding.id) ||
      typeof finding.url !== 'string' ||
      !finding.url.startsWith('https://') ||
      typeof finding.vulnerable_versions !== 'string'
    ) {
      throw new Error('Incomplete npm advisory data.')
    }

    return {
      ghsa_id:
        finding.url.match(/GHSA-[a-z0-9-]+$/)?.[0] ?? `npm-${finding.id}`,
      html_url: finding.url,
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
  affectedRanges(advisories)
  return advisories
}

export async function readSecuritySnapshot(): Promise<SecuritySnapshot> {
  // Accept GitHub evidence only after every page succeeds. On failure, npm
  // replaces the entire advisory set rather than supplementing partial results.
  let github: Awaited<ReturnType<typeof readGitHubAdvisories>> | undefined
  let githubFailure: unknown

  try {
    github = await readGitHubAdvisories()
  } catch (error) {
    githubFailure = error
  }

  const registryURL = `${NPM_REGISTRY}next`
  let releases: PackageRelease[]
  let advisories: Advisory[]
  let evidenceReferences: string[]

  try {
    const { value } = await fetchJSON(registryURL)
    releases = parseReleases(value)

    if (github) {
      advisories = github.advisories
      evidenceReferences = github.evidenceReferences
    } else {
      // Query every published version, including prereleases: querying only the
      // installed version could miss advisories affecting a candidate target.
      const versions = Object.keys(
        (value as { versions: Record<string, unknown> }).versions
      ).filter((version) => semver.valid(version))
      advisories = await readNpmAdvisories(versions)
      evidenceReferences = [NPM_ADVISORIES]
    }
  } catch (error) {
    if (!github) {
      throw new Error(
        `GitHub advisory lookup failed: ${String(githubFailure)}\n` +
          `npm advisory fallback failed: ${String(error)}`
      )
    }

    throw error
  }

  return {
    checkedAt: new Date().toISOString(),
    advisories,
    releases,
    evidenceReferences: [...evidenceReferences, registryURL],
  }
}

export function selectSecurityTarget(
  source: string,
  snapshot: SecuritySnapshot,
  now: Date
): PackageRelease | undefined {
  if (!semver.valid(source)) {
    throw new Error('The installed Next.js version is not valid semver.')
  }

  const ranges = affectedRanges(snapshot.advisories)

  if (
    !ranges.some((range) =>
      semver.satisfies(source, range, { includePrerelease: true })
    )
  ) {
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

  const active = Math.max(...latest.keys())

  for (const major of [...latest.keys()].sort((a, b) => a - b)) {
    if (major < semver.major(source)) {
      continue
    }

    const first = releases.find((release) => release.version === `${major}.0.0`)

    if (!first) {
      throw new Error(`Missing initial release date for Next.js ${major}.`)
    }

    // Approximate support as two years from x.0.0; always keep the newest major
    // eligible. This is a local rule, not a fetched support-status declaration.
    const supportEnd = new Date(first.publishedAt)
    supportEnd.setUTCFullYear(supportEnd.getUTCFullYear() + 2)

    if (major !== active && supportEnd.getTime() <= now.getTime()) {
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

  throw new Error(
    'No supported stable Next.js target clears all reviewed affected ranges.'
  )
}
