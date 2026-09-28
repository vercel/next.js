import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import semver from 'next/dist/compiled/semver'
import {
  getLatestUpgradeVersion,
  getUpgradeAssessment,
  prepareUpgrade,
} from 'next/dist/lib/upgrade/prepare-upgrade'
import loadConfig from 'next/dist/server/config'

jest.mock('next/dist/server/config', () => ({
  __esModule: true,
  default: jest.fn(),
}))

describe('prepare latest upgrade', () => {
  const directories: string[] = []
  const originalFetch = global.fetch

  async function createApp(version: string): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'next-latest-upgrade-'))
    directories.push(directory)
    await mkdir(join(directory, 'app'))
    await mkdir(join(directory, 'node_modules/next'), { recursive: true })
    await writeFile(join(directory, 'package.json'), '{}')
    await writeFile(
      join(directory, 'node_modules/next/package.json'),
      JSON.stringify({ version, engines: { node: '>=18' } })
    )
    return directory
  }

  function mockLatestVersion(version: string) {
    global.fetch = jest.fn(async (input) => {
      if (String(input).includes('/security/advisories/bulk')) {
        return Response.json({})
      }
      return Response.json({ version, engines: { node: '>=18' } })
    })
  }

  function mockFutureMetadata(vulnerableVersions: string) {
    global.fetch = jest.fn(async (input, init) => {
      const url = String(input)

      if (url === 'https://registry.npmjs.org/next/latest') {
        return Response.json({
          version: '16.4.0',
          engines: { node: '>=18' },
        })
      }

      if (
        url === 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk'
      ) {
        const { next: versions } = JSON.parse(String(init?.body)) as {
          next: string[]
        }
        return Response.json({
          next: versions.some((version) =>
            semver.satisfies(version, vulnerableVersions)
          )
            ? [
                {
                  id: 1,
                  url: 'https://github.com/advisories/GHSA-next-test',
                  severity: 'high',
                  vulnerable_versions: vulnerableVersions,
                },
              ]
            : [],
        })
      }

      throw new Error(`Unexpected request: ${url}`)
    })
  }

  beforeEach(() => {
    jest.mocked(loadConfig).mockResolvedValue({
      cacheComponents: false,
    } as never)
  })

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

  it('rejects canary security upgrades without querying advisories or releases', async () => {
    const directory = await createApp('17.2.0-canary.4')
    global.fetch = jest.fn()
    await expect(
      getUpgradeAssessment('17.2.0-canary.4', 'security')
    ).resolves.toMatchObject({
      affected: null,
      reference: null,
      upgrade: {
        status: 'blocked',
        reason:
          "The installed Next.js version (17.2.0-canary.4) is a canary prerelease. Security advisories target stable versions, and prereleases do not reliably follow stable version ordering, so an advisory could be a false positive. To upgrade to the latest canary release, run this command from the app's directory:\n\nnpx next@canary upgrade --ai=latest",
      },
    })
    await expect(prepareUpgrade(directory, 'security')).rejects.toThrow(
      'The installed Next.js version (17.2.0-canary.4) is a canary prerelease.'
    )
    expect(global.fetch).toHaveBeenCalledTimes(0)
  })

  it('does not treat a failed advisory request as an unaffected version', async () => {
    const directory = await createApp('17.2.0')
    mockSecurityMetadata({ npmFailure: true })
    await expect(
      getUpgradeAssessment('17.2.0', 'security')
    ).resolves.toMatchObject({
      affected: null,
      upgrade: { status: 'unknown' },
    })
    await expect(prepareUpgrade(directory, 'security')).rejects.toThrow(
      'Could not check for security updates.'
    )
  })

  it.each(['17.2.0', '17.1.9'])(
    'blocks a stable security upgrade without a newer safe target: %s',
    async (target) => {
      const directory = await createApp('17.2.0')
      mockSecurityMetadata({ ranges: ['17.2.0'], published: [target] })
      await expect(
        getUpgradeAssessment('17.2.0', 'security')
      ).resolves.toMatchObject({
        affected: true,
        upgrade: { status: 'blocked' },
      })
      await expect(prepareUpgrade(directory, 'security')).rejects.toThrow(
        'No safe Next.js update is currently available.'
      )
    }
  )

  it('does not request canary target metadata after a release dismissal', async () => {
    global.fetch = jest.fn()
    await expect(
      getUpgradeAssessment('16.4.0-canary.1', 'future', true)
    ).resolves.toMatchObject({ affected: null, upgrade: { status: 'blocked' } })
    expect(global.fetch).toHaveBeenCalledTimes(0)
  })

  it('checks advisories without target metadata after a release dismissal', async () => {
    mockLatestVersion('17.0.0')
    await expect(
      getUpgradeAssessment('16.4.0', 'future', true)
    ).resolves.toMatchObject({
      affected: false,
      upgrade: { status: 'unaffected' },
    })
    expect(
      jest.mocked(global.fetch).mock.calls.map(([url]) => String(url))
    ).toEqual(['https://registry.npmjs.org/-/npm/v1/security/advisories/bulk'])
  })

  describe('shared stable eligibility', () => {
    const installed = '17.2.0'
    it.each(['security', 'latest', 'future'] as const)(
      'uses the same safe target in the %s nudge and command',
      async (policy) => {
        const directory = await createApp(installed)
        const target = '17.3.0'
        mockSecurityMetadata({
          ranges: ['>=17.0.0 <17.2.1'],
          target,
          published: [installed, target],
        })
        const advisory = await getUpgradeAssessment(installed, policy)
        expect(advisory).toMatchObject({
          upgrade: { status: 'ready', targetVersion: target },
        })
        expect(await prepareUpgrade(directory, policy)).toMatchObject({
          status: 'ready',
          targetVersion: target,
        })
      }
    )

    it.each(['security', 'latest', 'future'] as const)(
      'retains the advisory when the %s target metadata cannot be fetched',
      async (policy) => {
        const directory = await createApp(installed)
        mockSecurityMetadata({ ranges: ['>=17.0.0 <17.2.1'] })
        const fetchMetadata = global.fetch
        global.fetch = jest.fn(async (input, init) => {
          if (String(input).startsWith('https://registry.npmjs.org/next')) {
            return new Response(null, { status: 503 })
          }
          return fetchMetadata(input, init)
        })
        await expect(
          getUpgradeAssessment(installed, policy)
        ).resolves.toMatchObject({
          upgrade: {
            status: 'unknown',
            reason: expect.stringContaining('Could not fetch upgrade metadata'),
          },
        })
        await expect(prepareUpgrade(directory, policy)).rejects.toThrow(
          'Could not fetch upgrade metadata'
        )
      }
    )

    it.each(['latest', 'future'] as const)(
      'checks the %s target even when the installed version is unaffected',
      async (policy) => {
        const directory = await createApp(installed)
        const target = '17.3.0'
        mockSecurityMetadata({
          ranges: [target],
          target,
          published: [installed, target],
        })
        await expect(
          getUpgradeAssessment(installed, policy)
        ).resolves.toMatchObject({
          affected: false,
          upgrade: { status: 'blocked' },
        })
        await expect(prepareUpgrade(directory, policy)).rejects.toThrow(
          `${target} is affected by an active advisory`
        )
      }
    )

    it.each(['security', 'latest', 'future'] as const)(
      'retains npm advisory warnings without release metadata for %s',
      async (policy) => {
        const directory = await createApp(installed)
        mockSecurityMetadata({ ranges: [installed] })
        const fetchMetadata = global.fetch
        global.fetch = jest.fn(async (input, init) => {
          if (String(input).startsWith('https://registry.npmjs.org/next')) {
            return new Response(null, { status: 503 })
          }
          return fetchMetadata(input, init)
        })
        await expect(
          getUpgradeAssessment(installed, policy)
        ).resolves.toMatchObject({
          affected: true,
          reference:
            'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',
          upgrade: { status: 'unknown' },
        })
        await expect(prepareUpgrade(directory, policy)).rejects.toThrow(
          'Could not fetch upgrade metadata.'
        )
      }
    )
  })

  it('checks a newly published target tag', async () => {
    const target = '17.3.0'
    const directory = await createApp('17.2.0')
    mockSecurityMetadata({
      ranges: [target],
      target,
      published: ['17.2.0'],
    })
    await expect(
      getUpgradeAssessment('17.2.0', 'latest')
    ).resolves.toMatchObject({
      affected: false,
      upgrade: {
        status: 'blocked',
        reason: `Next.js ${target} is affected by an active advisory.`,
      },
    })
    await expect(prepareUpgrade(directory, 'latest')).rejects.toThrow(
      'affected by an active advisory'
    )
  })

  it('assesses the configured policy rather than a different safe security target', async () => {
    const directory = await createApp('17.2.0')
    mockSecurityMetadata({
      ranges: ['17.2.0', '17.3.0'],
      target: '17.3.0',
      published: ['17.2.0', '17.3.0', '18.0.0'],
    })
    await expect(
      getUpgradeAssessment('17.2.0', 'security')
    ).resolves.toMatchObject({
      upgrade: { status: 'ready', targetVersion: '18.0.0' },
    })
    for (const policy of ['latest', 'future'] as const) {
      await expect(
        getUpgradeAssessment('17.2.0', policy)
      ).resolves.toMatchObject({ upgrade: { status: 'blocked' } })
      await expect(prepareUpgrade(directory, policy)).rejects.toThrow(
        '17.3.0 is affected by an active advisory'
      )
    }
  })

  it('preserves stable security target selection', async () => {
    const directory = await createApp('17.2.0')
    mockSecurityMetadata({
      ranges: ['>=17.0.0 <17.2.1'],
      published: ['17.2.0', '17.2.1', '18.0.0', '17.3.0-canary.0'],
    })
    await expect(prepareUpgrade(directory, 'security')).resolves.toEqual(
      expect.objectContaining({ targetVersion: '17.2.1' })
    )
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

  it.each(['17.2.0-rc.1', '17.2.0-beta.1', '17.2.0-preview.1'])(
    'blocks security upgrades for prereleases without querying advisories: %s',
    async (version) => {
      const directory = await createApp(version)
      global.fetch = jest.fn()
      await expect(prepareUpgrade(directory, 'security')).rejects.toThrow(
        `The installed Next.js version (${version}) is a`
      )
      await expect(getUpgradeAssessment(version, 'security')).resolves.toEqual(
        expect.objectContaining({
          affected: null,
          upgrade: expect.objectContaining({
            status: 'blocked',
            reason: expect.stringContaining(
              'npx next@canary upgrade --ai=latest'
            ),
          }),
        })
      )
      expect(global.fetch).toHaveBeenCalledTimes(0)
    }
  )

  it.each(['17.2.0-rc.1', '17.2.0-beta.1', '17.2.0-preview.1'])(
    'blocks Future Defaults upgrades for prereleases without querying metadata: %s',
    async (version) => {
      const directory = await createApp(version)
      global.fetch = jest.fn()
      await expect(prepareUpgrade(directory, 'future')).rejects.toThrow(
        `Future Defaults upgrades are not supported for Next.js ${version}.`
      )
      await expect(getUpgradeAssessment(version, 'future')).resolves.toEqual(
        expect.objectContaining({
          affected: null,
          upgrade: expect.objectContaining({
            status: 'blocked',
            reason: expect.stringContaining(
              'npx next@canary upgrade --ai=latest'
            ),
          }),
        })
      )
      expect(global.fetch).toHaveBeenCalledTimes(0)
    }
  )

  it('rejects commit preview builds before requesting a dist-tag', async () => {
    const version = '16.4.0-preview-84cee7e6-20260917'
    const directory = await createApp(version)
    global.fetch = jest.fn()
    await expect(prepareUpgrade(directory, 'latest')).rejects.toThrow(
      'AI upgrades are not available for this prerelease version of Next.js.'
    )
    await expect(getUpgradeAssessment(version, 'latest')).rejects.toThrow(
      'AI upgrades are not available for this prerelease version of Next.js.'
    )
    expect(global.fetch).toHaveBeenCalledTimes(0)
  })

  it.each([
    ['rc', '17.2.0-rc.1'],
    ['beta', '17.2.0-beta.1'],
    ['preview', '17.2.0-preview.1'],
  ])(
    'selects stable latest for a %s installation',
    async (channel, installed) => {
      const target = '17.2.0'
      const directory = await createApp(installed)
      mockLatestVersion(target)
      await expect(
        getUpgradeAssessment(installed, 'latest')
      ).resolves.toMatchObject({
        affected: null,
        upgrade: { status: 'ready', targetVersion: target },
      })
      await expect(prepareUpgrade(directory, 'latest')).resolves.toEqual(
        expect.objectContaining({
          status: 'ready',
          installedVersion: installed,
          targetVersion: target,
          references: ['https://registry.npmjs.org/next/latest'],
        })
      )
      const advisoryRequests = jest
        .mocked(global.fetch)
        .mock.calls.filter(([url]) =>
          String(url).includes('/security/advisories/bulk')
        )
      expect(
        advisoryRequests.map(([, init]) => JSON.parse(String(init?.body)))
      ).toEqual([
        { next: [installed] },
        { next: [target] },
        { next: [installed] },
        { next: [target] },
      ])
    }
  )

  it('blocks an advised stable target for a prerelease', async () => {
    const installed = '17.2.0-rc.1'
    const target = '17.2.0'
    const directory = await createApp(installed)
    mockSecurityMetadata({ ranges: [target], target })
    await expect(
      getUpgradeAssessment(installed, 'latest')
    ).resolves.toMatchObject({
      affected: null,
      upgrade: {
        status: 'blocked',
        reason: `Next.js ${target} is affected by an active advisory.`,
      },
    })
    await expect(prepareUpgrade(directory, 'latest')).rejects.toThrow(
      `Next.js ${target} is affected by an active advisory.`
    )
  })

  it('does not offer stable latest when advisory validation fails for a prerelease', async () => {
    const installed = '17.2.0-rc.1'
    const directory = await createApp(installed)
    mockSecurityMetadata({ npmFailure: true })
    await expect(
      getUpgradeAssessment(installed, 'latest')
    ).resolves.toMatchObject({
      affected: null,
      upgrade: {
        status: 'unknown',
        reason: 'Could not check for security updates. Please try again.',
      },
    })
    await expect(prepareUpgrade(directory, 'latest')).rejects.toThrow(
      'Could not check for security updates.'
    )
  })

  it.each([
    '17.2.0-rc.2',
    '17.2.0-beta.2',
    '17.2.0-alpha.2',
    '17.2.0-preview-84cee7e6-20260917',
    'invalid',
  ])('rejects a prerelease or invalid stable dist-tag: %s', async (target) => {
    const directory = await createApp('17.2.0-rc.1')
    mockLatestVersion(target)
    await expect(prepareUpgrade(directory, 'latest')).rejects.toThrow(
      'Could not determine the latest stable Next.js version.'
    )
  })

  it.each(['17.3.0-rc.1', '17.3.0-beta.1', '17.3.0-preview.1'])(
    'does not downgrade %s when stable latest is older',
    async (installed) => {
      const directory = await createApp(installed)
      mockLatestVersion('17.2.0')
      await expect(prepareUpgrade(directory, 'latest')).resolves.toEqual({
        status: 'unaffected',
        reason: `Next.js ${installed} is newer than the latest stable release 17.2.0.`,
      })
      expect(global.fetch).toHaveBeenCalledTimes(2)
    }
  )

  afterEach(async () => {
    global.fetch = originalFetch
    await Promise.all(
      directories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true }))
    )
  })

  describe.each(['latest', 'future'] as const)(
    '%s canary upgrades',
    (policy) => {
      it.each([
        '17.2.0-canary.5',
        '17.2.1-canary.0',
        '17.3.0-canary.0',
        '18.0.0-canary.0',
      ])(
        'selects the exact canary tag %s for an explicit upgrade',
        async (target) => {
          const directory = await createApp('17.2.0-canary.4')
          mockSecurityMetadata({ target, ranges: [] })
          await expect(prepareUpgrade(directory, policy)).resolves.toEqual(
            expect.objectContaining({
              status: 'ready',
              targetVersion: target,
              references: ['https://registry.npmjs.org/next/canary'],
            })
          )
          expect(global.fetch).toHaveBeenCalledWith(
            'https://registry.npmjs.org/next/canary',
            expect.any(Object)
          )
        }
      )

      it.each(['17.2.0-canary.4', '17.2.0-canary.3'])(
        'does not change versions when the tag is equal or older: %s',
        async (target) => {
          const directory = await createApp('17.2.0-canary.4')
          jest
            .mocked(loadConfig)
            .mockResolvedValue({ cacheComponents: true } as never)
          mockSecurityMetadata({ target, ranges: [] })
          await expect(prepareUpgrade(directory, policy)).resolves.toEqual(
            expect.objectContaining({ status: 'unaffected' })
          )
        }
      )

      it.each([null, 'invalid', '17.3.0', '17.3.0-rc.1'])(
        'rejects invalid or wrong-channel tag metadata: %s',
        async (target) => {
          const directory = await createApp('17.2.0-canary.4')
          mockSecurityMetadata({ target })
          await expect(prepareUpgrade(directory, policy)).rejects.toThrow(
            'Could not determine the latest Next.js version on the canary dist-tag.'
          )
        }
      )
    }
  )

  it.each(['latest', 'future'] as const)(
    'runs canary %s without advisory assessment even when providers are unavailable',
    async (policy) => {
      const directory = await createApp('17.2.0-canary.4')
      global.fetch = jest.fn(async (input) => {
        if (String(input) === 'https://registry.npmjs.org/next/canary') {
          return Response.json({ version: '17.2.0-canary.5' })
        }
        throw new Error('Advisory lookup should not run for canaries')
      })
      await expect(
        getUpgradeAssessment('17.2.0-canary.4', policy)
      ).resolves.toMatchObject({
        affected: null,
        reference: null,
        upgrade: { status: 'ready', targetVersion: '17.2.0-canary.5' },
      })
      await expect(prepareUpgrade(directory, policy)).resolves.toMatchObject({
        status: 'ready',
        targetVersion: '17.2.0-canary.5',
      })
      expect(
        jest.mocked(global.fetch).mock.calls.map(([url]) => String(url))
      ).toEqual([
        'https://registry.npmjs.org/next/canary',
        'https://registry.npmjs.org/next/canary',
      ])
    }
  )

  it.each(['17.2.0-canary.4', '17.2.0-canary.3'])(
    'adopts available defaults without a version change when the tag is %s',
    async (target) => {
      const directory = await createApp('17.2.0-canary.4')
      mockSecurityMetadata({ target, ranges: [] })
      await expect(prepareUpgrade(directory, 'future')).resolves.toEqual(
        expect.objectContaining({
          status: 'ready',
          targetVersion: '17.2.0-canary.4',
          futureDefaults: [
            expect.objectContaining({ name: 'Cache Components' }),
          ],
        })
      )
    }
  )

  it('keeps the stable Future availability boundary for a same-base canary', async () => {
    const directory = await createApp('16.3.0-canary.1')
    mockSecurityMetadata({ target: '16.3.0-canary.1', ranges: [] })
    await expect(prepareUpgrade(directory, 'future')).resolves.toEqual(
      expect.objectContaining({ status: 'unaffected' })
    )
  })

  it('assesses a retained Future version missing from registry metadata', async () => {
    const directory = await createApp('17.2.9')
    mockSecurityMetadata({
      ranges: ['17.2.9'],
      target: '17.2.1',
      published: ['17.2.0', '17.2.1'],
    })
    await expect(prepareUpgrade(directory, 'future')).rejects.toThrow(
      '17.2.9 is affected by an active advisory.'
    )
  })

  it.each(['latest', 'future'] as const)(
    'fails a %s assessment when the advisory endpoint is unavailable',
    async (policy) => {
      const directory = await createApp('17.2.0')
      mockSecurityMetadata({ npmFailure: true })
      await expect(prepareUpgrade(directory, policy)).rejects.toThrow(
        'Could not check for security updates.'
      )
    }
  )

  it('selects the exact latest stable release', async () => {
    const directory = await createApp('16.2.1')
    mockLatestVersion('17.1.0')

    await expect(prepareUpgrade(directory, 'latest')).resolves.toEqual(
      expect.objectContaining({
        status: 'ready',
        installedVersion: '16.2.1',
        targetVersion: '17.1.0',
        references: ['https://registry.npmjs.org/next/latest'],
      })
    )
    expect(global.fetch).toHaveBeenCalledTimes(3)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://registry.npmjs.org/next/latest',
      expect.any(Object)
    )
  })

  it('allows an explicit patch upgrade without a reminder', async () => {
    const directory = await createApp('17.1.0')
    mockLatestVersion('17.1.1')

    await expect(prepareUpgrade(directory, 'latest')).resolves.toEqual(
      expect.objectContaining({ status: 'ready', targetVersion: '17.1.1' })
    )
    expect(getLatestUpgradeVersion('17.1.0', '17.1.1')).toBeNull()
  })

  it.each([null, {}, { version: 'invalid' }, { version: '17.2.0-canary.1' }])(
    'reports invalid metadata for explicit upgrades but suppresses reminders: %j',
    async (metadata) => {
      const directory = await createApp('17.1.0')
      global.fetch = jest.fn(async (input) =>
        String(input).includes('/security/advisories/bulk')
          ? Response.json({})
          : Response.json(metadata)
      )

      await expect(prepareUpgrade(directory, 'latest')).rejects.toThrow(
        'Could not determine the latest stable Next.js version.'
      )
      expect(
        getLatestUpgradeVersion(
          '17.1.0',
          String(metadata && 'version' in metadata ? metadata.version : '')
        )
      ).toBeNull()
    }
  )

  it('preserves target lookup failures in the shared assessment and command', async () => {
    const directory = await createApp('17.1.0')
    global.fetch = jest.fn(async (input) => {
      if (String(input).includes('/security/advisories/bulk')) {
        return Response.json({})
      }
      throw new Error('Network unavailable')
    })

    await expect(prepareUpgrade(directory, 'latest')).rejects.toThrow(
      'Could not fetch upgrade metadata.'
    )
    await expect(
      getUpgradeAssessment('17.1.0', 'latest')
    ).resolves.toMatchObject({
      upgrade: {
        status: 'unknown',
        reason: expect.stringContaining('Could not fetch upgrade metadata.'),
      },
    })
  })

  it('does nothing when the app already uses latest', async () => {
    const directory = await createApp('17.1.0')
    mockLatestVersion('17.1.0')

    await expect(prepareUpgrade(directory, 'latest')).resolves.toEqual({
      status: 'unaffected',
      reason: 'Next.js 17.1.0 is already the latest stable release.',
    })
  })

  it('does not downgrade an app newer than latest', async () => {
    const directory = await createApp('18.0.0')
    mockLatestVersion('17.1.0')

    await expect(prepareUpgrade(directory, 'latest')).resolves.toEqual({
      status: 'unaffected',
      reason: 'Next.js 18.0.0 is newer than the latest stable release 17.1.0.',
    })
  })

  it('ignores an affected older latest target', async () => {
    const directory = await createApp('17.3.0')
    mockSecurityMetadata({
      ranges: ['17.2.0'],
      target: '17.2.0',
      published: ['17.2.0', '17.3.0'],
    })

    await expect(
      getUpgradeAssessment('17.3.0', 'latest')
    ).resolves.toMatchObject({
      affected: false,
      upgrade: { status: 'unaffected' },
    })
    await expect(prepareUpgrade(directory, 'latest')).resolves.toEqual({
      status: 'unaffected',
      reason: 'Next.js 17.3.0 is newer than the latest stable release 17.2.0.',
    })
  })

  it('still blocks an affected equal latest target', async () => {
    const directory = await createApp('17.3.0')
    mockSecurityMetadata({
      ranges: ['17.3.0'],
      target: '17.3.0',
      published: ['17.3.0'],
    })

    await expect(
      getUpgradeAssessment('17.3.0', 'latest')
    ).resolves.toMatchObject({
      affected: true,
      upgrade: { status: 'blocked' },
    })
    await expect(prepareUpgrade(directory, 'latest')).rejects.toThrow(
      'Next.js 17.3.0 is affected by an active advisory.'
    )
  })

  it('allows a Future target outside npm advisory ranges', async () => {
    const directory = await createApp('16.2.0')
    mockFutureMetadata('<16.3.0')

    await expect(prepareUpgrade(directory, 'future')).resolves.toEqual(
      expect.objectContaining({
        status: 'ready',
        installedVersion: '16.2.0',
        targetVersion: '16.4.0',
      })
    )
  })

  it('blocks a Future target inside npm advisory ranges', async () => {
    const directory = await createApp('16.2.0')
    mockFutureMetadata('<=16.4.0')

    await expect(prepareUpgrade(directory, 'future')).rejects.toThrow(
      'Next.js 16.4.0 is affected by an active advisory.'
    )
  })

  it('uses the adapter to detect an adopted Future Default', async () => {
    const directory = await createApp('16.4.0')
    jest.mocked(loadConfig).mockResolvedValue({
      cacheComponents: true,
    } as never)
    mockFutureMetadata('<16.3.0')

    await expect(prepareUpgrade(directory, 'future')).resolves.toEqual({
      status: 'unaffected',
      reason:
        'Next.js 16.4.0 is current and no applicable Future Defaults are pending.',
    })
  })
  it('keeps version upgrades but excludes adoption for a Pages-only app', async () => {
    const directory = await createApp('16.2.0')
    await rm(join(directory, 'app'), { recursive: true })
    await mkdir(join(directory, 'pages'))
    mockFutureMetadata('<16.3.0')
    await expect(prepareUpgrade(directory, 'future')).resolves.toMatchObject({
      status: 'ready',
      targetVersion: '16.4.0',
      futureDefaults: [],
    })
  })
})
