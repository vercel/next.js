import { getUpgradeAssessment } from './prepare-upgrade'

describe('age-gated security upgrade', () => {
  const originalFetch = global.fetch
  const now = Date.parse('2026-09-28T00:00:00.000Z')
  const age = 48 * 60 * 60 * 1000

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now)
  })

  afterEach(() => {
    global.fetch = originalFetch
    jest.useRealTimers()
  })

  function mockReleases(safeAge: number, candidateVulnerable = false) {
    const ages = {
      '16.0.0': 100,
      '16.0.1': 90,
      '16.0.2': safeAge,
      '17.0.0': 1,
    }
    global.fetch = jest.fn(async (input, init) => {
      const url = String(input)
      if (url.startsWith('https://api.github.com/advisories?')) {
        return Response.json([
          {
            withdrawn_at: null,
            vulnerabilities: [
              {
                package: { ecosystem: 'npm', name: 'next' },
                vulnerable_version_range: '<16.0.2',
              },
            ],
          },
        ])
      }
      if (
        url === 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk'
      ) {
        if (
          candidateVulnerable &&
          String(init?.body) === '{"next":["16.0.2"]}'
        ) {
          return Response.json({
            next: [{ vulnerable_versions: '16.0.2' }],
          })
        }
        return Response.json({
          next: [{ vulnerable_versions: '<16.0.2' }],
        })
      }
      if (url === 'https://registry.npmjs.org/next') {
        return Response.json({
          'dist-tags': { latest: '17.0.0' },
          versions: Object.fromEntries(
            Object.keys(ages).map((version) => [version, { version }])
          ),
          time: Object.fromEntries(
            Object.entries(ages).map(([version, hours]) => [
              version,
              new Date(now - hours * 60 * 60 * 1000).toISOString(),
            ])
          ),
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })
  }

  it('selects an old-enough safe patch', async () => {
    mockReleases(72)

    await expect(
      getUpgradeAssessment('16.0.0', 'security', false, null, {
        name: 'next',
        minimumReleaseAge: age,
      })
    ).resolves.toMatchObject({
      upgrade: { status: 'ready', targetVersion: '16.0.2' },
    })
  })

  it('blocks when every safe release is too young', async () => {
    mockReleases(1)

    await expect(
      getUpgradeAssessment('16.0.0', 'security', false, null, {
        name: 'next',
        minimumReleaseAge: age,
      })
    ).resolves.toMatchObject({
      upgrade: {
        status: 'blocked',
        reason:
          "No safe Next.js update satisfies the project's minimum release age.",
      },
    })
  })

  it('checks the actual age-selected release for advisories', async () => {
    mockReleases(72, true)

    await expect(
      getUpgradeAssessment('16.0.0', 'security', false, null, {
        name: 'next',
        minimumReleaseAge: age,
      })
    ).resolves.toMatchObject({
      upgrade: {
        status: 'blocked',
        reason:
          "No safe Next.js update satisfies the project's minimum release age.",
      },
    })
  })
})
