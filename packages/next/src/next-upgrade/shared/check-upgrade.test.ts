import semver from 'next/dist/compiled/semver'
import { getLatestUpgradeVersion, getUpgradeAssessment } from './check-upgrade'

describe('upgrade checks', () => {
  const originalFetch = global.fetch

  function mockLatestVersion(version: string) {
    global.fetch = jest.fn(async (input) => {
      if (String(input).includes('/security/advisories/bulk')) {
        return Response.json({})
      }
      return Response.json({ version, engines: { node: '>=18' } })
    })
  }

  function mockSecurityMetadata({
    ranges = ['>=17.2.0-canary.0 <17.2.0-canary.5'],
    target = '17.2.0-canary.5' as string | null,
    published = ['17.2.0', '17.2.0-canary.5', '17.3.0-canary.0'],
    npmFailure = false,
  } = {}) {
    global.fetch = jest.fn(async (input, init) => {
      const url = String(input)
      if (url === 'https://registry.npmjs.org/next') {
        return Response.json({
          'dist-tags': target === null ? {} : { canary: target },
          versions: Object.fromEntries(
            published.map((version) => [version, { version }])
          ),
        })
      }
      if (
        url === 'https://registry.npmjs.org/next/canary' ||
        url === 'https://registry.npmjs.org/next/latest'
      ) {
        return Response.json({ version: target })
      }
      if (
        url === 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk'
      ) {
        if (npmFailure) {
          return new Response(null, { status: 500 })
        }
        const { next: versions } = JSON.parse(String(init?.body)) as {
          next: string[]
        }
        // Model npm's default prerelease exclusion instead of returning every
        // advisory regardless of the versions submitted in the request.
        return Response.json({
          next: ranges
            .filter((range) =>
              versions.some((version) => semver.satisfies(version, range))
            )
            .map((range) => ({ vulnerable_versions: range })),
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })
  }

  it('does not request canary target metadata after a release dismissal', async () => {
    global.fetch = jest.fn()
    await expect(
      getUpgradeAssessment('16.4.0-canary.1', 'experimental-future', true)
    ).resolves.toMatchObject({ affected: null, upgrade: { status: 'blocked' } })
    expect(global.fetch).toHaveBeenCalledTimes(0)
  })

  it('checks advisories without target metadata after a release dismissal', async () => {
    mockLatestVersion('17.0.0')
    await expect(
      getUpgradeAssessment('16.4.0', 'experimental-future', true)
    ).resolves.toMatchObject({
      affected: false,
      upgrade: { status: 'unaffected' },
    })
    expect(
      jest.mocked(global.fetch).mock.calls.map(([url]) => String(url))
    ).toEqual(['https://registry.npmjs.org/-/npm/v1/security/advisories/bulk'])
  })

  it('queries only the installed version and newest eligible release per major', async () => {
    mockSecurityMetadata({
      ranges: ['17.2.0', '17.3.0'],
      published: [
        '16.9.0',
        '17.2.0',
        '17.2.1',
        '17.3.0',
        '18.0.0',
        '18.0.1',
        '18.1.0-canary.0',
      ],
    })

    await expect(
      getUpgradeAssessment('17.2.0', 'security')
    ).resolves.toMatchObject({
      affected: true,
      upgrade: { status: 'ready', targetVersion: '18.0.1' },
    })

    const requests = jest.mocked(global.fetch).mock.calls
    expect(requests.map(([url]) => String(url))).toEqual([
      'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',
      'https://registry.npmjs.org/next',
      'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',
    ])
    expect(JSON.parse(String(requests[0][1]?.body))).toEqual({
      next: ['17.2.0'],
    })
    expect(JSON.parse(String(requests[2][1]?.body))).toEqual({
      next: ['17.3.0', '18.0.1'],
    })
  })

  it('keeps a confirmed warning when the candidate advisory request fails', async () => {
    mockSecurityMetadata({
      ranges: ['17.2.0'],
      published: ['17.2.0', '17.2.1'],
    })
    const fetchMetadata = global.fetch
    let advisoryRequests = 0
    global.fetch = jest.fn(async (input, init) => {
      if (String(input).includes('/security/advisories/bulk')) {
        advisoryRequests++
        if (advisoryRequests === 2) {
          return new Response(null, { status: 503 })
        }
      }
      return fetchMetadata(input, init)
    })

    await expect(
      getUpgradeAssessment('17.2.0', 'security')
    ).resolves.toMatchObject({
      affected: true,
      upgrade: {
        status: 'unknown',
        reason: 'Could not check for security updates. Please try again.',
      },
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })
})

describe('latest nudge release selection', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it.each<[string, string, string | null]>([
    ['15.5.9', '16.0.0', '16.0.0'],
    ['16.0.9', '16.1.0', '16.1.0'],
    ['16.1.0', '16.1.1', null],
    ['16.1.1', '16.1.1', null],
    ['16.2.0', '16.1.1', null],
    ['16.1.0', '17.0.0-canary.1', null],
    ['16.1.0-canary.1', '16.1.0', null],
    ['16.0.0-canary.1', '16.1.0', null],
    ['17.2.0-canary.4', '17.2.0-canary.9', null],
    ['17.2.0-canary.9', '17.2.0-canary.10', null],
    ['17.2.0-canary.4', '17.2.1-canary.0', null],
    ['17.2.0-canary.4', '17.3.0-canary.0', '17.3.0-canary.0'],
    ['17.2.0-canary.4', '18.0.0-canary.0', '18.0.0-canary.0'],
    ['17.2.0-canary.4', '17.2.0-canary.4', null],
    ['17.2.0-canary.4', '17.1.0-canary.99', null],
    ['17.2.0-canary.4', '17.3.0-rc.1', null],
    ['17.2.0-rc.1', '17.3.0', '17.3.0'],
    ['17.2.0-rc.1', '17.2.0', '17.2.0'],
    ['17.2.0-rc.1', '17.2.0-rc.2', null],
    ['17.2.0-beta.1', '17.2.0', '17.2.0'],
    ['17.2.0-beta.1', '18.0.0-beta.1', null],
    ['17.2.0-preview.1', '17.2.0', '17.2.0'],
    ['17.2.0-rc.1', '17.3.0-rc.1', null],
    ['17.2.0-beta.1', '17.3.0-beta.1', null],
    ['17.2.0-preview.1', '17.3.0-preview.1', null],
    ['17.2.0-rc.1', '17.3.0-beta.1', null],
    ['16.4.0-preview-84cee7e6-20260917', '17.0.0', null],
  ])(
    'selects an eligible latest reminder for %s → %s',
    async (installed, latest, expected) => {
      expect(getLatestUpgradeVersion(installed, latest)).toBe(expected)
    }
  )
})
