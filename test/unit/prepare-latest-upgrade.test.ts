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
    await mkdir(join(directory, 'node_modules/next'), { recursive: true })
    await writeFile(join(directory, 'package.json'), '{}')
    await writeFile(
      join(directory, 'node_modules/next/package.json'),
      JSON.stringify({ version, engines: { node: '>=18' } })
    )
    return directory
  }

  function mockLatestVersion(version: string) {
    global.fetch = jest.fn(async (input) =>
      String(input).startsWith('https://api.github.com/')
        ? Response.json([])
        : new Response(
            JSON.stringify({
              version,
              engines: { node: '>=18' },
            }),
            { status: 200 }
          )
    )
  }

  function mockFutureMetadata(vulnerableVersions: string) {
    global.fetch = jest.fn(async (input) => {
      const url = String(input)

      if (url === 'https://registry.npmjs.org/next/latest') {
        return Response.json({
          version: '16.4.0',
          engines: { node: '>=18' },
        })
      }

      if (url.startsWith('https://api.github.com/advisories?')) {
        return new Response(null, { status: 500 })
      }

      if (url === 'https://registry.npmjs.org/next') {
        return Response.json({
          versions: {
            '16.2.0': { version: '16.2.0' },
            '16.4.0': { version: '16.4.0' },
          },
        })
      }

      if (
        url === 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk'
      ) {
        return Response.json({
          next: [
            {
              id: 1,
              url: 'https://github.com/advisories/GHSA-next-test',
              severity: 'high',
              vulnerable_versions: vulnerableVersions,
            },
          ],
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
    fallback = false,
    npmFailure = false,
  } = {}) {
    global.fetch = jest.fn(async (input, init) => {
      const url = String(input)
      if (url.startsWith('https://api.github.com/advisories?')) {
        return fallback
          ? new Response(null, { status: 500 })
          : Response.json(
              ranges.map((range) => ({
                withdrawn_at: null,
                vulnerabilities: [
                  {
                    package: { ecosystem: 'npm', name: 'next' },
                    vulnerable_version_range: range,
                  },
                ],
              }))
            )
      }
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

  describe.each([false, true])(
    'canary security with npm fallback=%s',
    (fallback) => {
      it.each(['17.2.0-canary.5', '17.2.1-canary.0'])(
        'selects the tagged same-line fix %s, not the highest published canary',
        async (target) => {
          const directory = await createApp('17.2.0-canary.4')
          mockSecurityMetadata({
            fallback,
            target,
            published: [target, '17.3.0-canary.0'],
          })
          await expect(prepareUpgrade(directory, 'security')).resolves.toEqual(
            expect.objectContaining({ status: 'ready', targetVersion: target })
          )
        }
      )

      it('assesses stable advisory ranges with prereleases included', async () => {
        const directory = await createApp('17.2.0-canary.4')
        mockSecurityMetadata({
          fallback,
          ranges: ['>=17.0.0 <17.2.1'],
          target: '17.3.0-canary.0',
        })
        await expect(
          getUpgradeAssessment('17.2.0-canary.4', 'security')
        ).resolves.toMatchObject({
          reference: expect.stringContaining(
            fallback ? 'registry.npmjs.org' : 'api.github.com'
          ),
        })
        await expect(prepareUpgrade(directory, 'security')).resolves.toEqual(
          expect.objectContaining({ targetVersion: '17.3.0-canary.0' })
        )
        if (fallback) {
          expect(global.fetch).toHaveBeenLastCalledWith(
            expect.any(String),
            expect.objectContaining({
              body: JSON.stringify({
                next: [
                  '17.2.0',
                  '17.2.0-canary.5',
                  '17.3.0-canary.0',
                  '17.2.0-canary.4',
                ],
              }),
            })
          )
        } else {
          expect(
            new URL(
              jest.mocked(global.fetch).mock.calls[0][0] as string
            ).searchParams.get('affects')
          ).toBe('next')
        }
      })

      it('keeps the finding visible when the tagged target is still affected', async () => {
        const directory = await createApp('17.2.0-canary.4')
        mockSecurityMetadata({ fallback, ranges: ['>=17.0.0 <17.2.1'] })
        await expect(
          getUpgradeAssessment('17.2.0-canary.4', 'security')
        ).resolves.toMatchObject({
          reference: expect.any(String),
        })
        await expect(prepareUpgrade(directory, 'security')).rejects.toThrow(
          /17\.2\.0-canary\.4[\s\S]*17\.2\.0-canary\.5 also matches an advisory[\s\S]*References:/
        )
      })

      it('rejects a target affected by a different advisory', async () => {
        const directory = await createApp('17.2.0-canary.4')
        mockSecurityMetadata({
          fallback,
          ranges: ['17.2.0-canary.4', '17.2.0-canary.5'],
        })
        await expect(prepareUpgrade(directory, 'security')).rejects.toThrow(
          '17.2.0-canary.5 also matches an advisory'
        )
      })

      it('retains full-version lower bounds without requiring a fix for an unaffected version', async () => {
        const directory = await createApp('17.2.0-canary.4')
        mockSecurityMetadata({
          fallback,
          ranges: ['>=17.2.0 <17.2.1'],
          target: null,
        })
        await expect(
          getUpgradeAssessment('17.2.0-canary.4', 'security')
        ).resolves.toMatchObject({ affected: false })
        await expect(prepareUpgrade(directory, 'security')).resolves.toEqual(
          expect.objectContaining({ status: 'unaffected' })
        )
      })
    }
  )

  it.each([null, 'invalid', '17.2.0', '17.2.0-rc.1', '17.2.0-canary.99'])(
    'reports a missing, wrong-channel or unpublished security target: %s',
    async (target) => {
      const directory = await createApp('17.2.0-canary.4')
      mockSecurityMetadata({ target })
      await expect(
        getUpgradeAssessment('17.2.0-canary.4', 'security')
      ).resolves.toMatchObject({
        reference: expect.any(String),
      })
      await expect(prepareUpgrade(directory, 'security')).rejects.toThrow(
        'Could not determine a published Next.js version on the canary dist-tag.'
      )
    }
  )

  it('reports a non-newer security target without downgrading', async () => {
    const directory = await createApp('17.2.0-canary.4')
    mockSecurityMetadata({
      ranges: ['17.2.0-canary.4'],
      target: '17.2.0-canary.3',
      published: ['17.2.0-canary.3'],
    })
    await expect(prepareUpgrade(directory, 'security')).rejects.toThrow(
      '17.2.0-canary.3 is not newer'
    )
  })

  it('does not treat failed advisory providers as an unaffected version', async () => {
    const directory = await createApp('17.2.0-canary.4')
    mockSecurityMetadata({ fallback: true, npmFailure: true })
    await expect(
      getUpgradeAssessment('17.2.0-canary.4', 'security')
    ).rejects.toThrow()
    await expect(prepareUpgrade(directory, 'security')).rejects.toThrow(
      'Could not check for security updates.'
    )
  })

  describe.each(['17.2.0', '17.2.0-canary.4'])(
    'shared eligibility for %s',
    (installed) => {
      it.each(['security', 'latest', 'future'] as const)(
        'uses the same safe target in the %s nudge and command',
        async (policy) => {
          const directory = await createApp(installed)
          const target = installed.includes('canary')
            ? '17.3.0-canary.1'
            : '17.3.0'
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
              reason: expect.stringContaining(
                'Could not fetch upgrade metadata'
              ),
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
          const target = installed.includes('canary')
            ? '17.3.0-canary.1'
            : '17.3.0'
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
          mockSecurityMetadata({ fallback: true, ranges: [installed] })
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
            'Could not assess upgrade targets.'
          )
        }
      )
    }
  )

  it('reports incomplete canary advisory coverage when metadata is unavailable', async () => {
    mockSecurityMetadata({ fallback: true, ranges: ['>=17.0.0 <17.2.1'] })
    const fetchMetadata = global.fetch
    global.fetch = jest.fn(async (input, init) => {
      if (String(input) === 'https://registry.npmjs.org/next') {
        return new Response(null, { status: 503 })
      }
      return fetchMetadata(input, init)
    })
    // A source-only npm query excludes this stable range for the canary.
    // Reject so startup reports that advisories could not be checked.
    await expect(
      getUpgradeAssessment('17.2.0-canary.4', 'security')
    ).rejects.toThrow('Could not check for security updates.')
  })

  it('includes a newly published tag in npm fallback assessment', async () => {
    const target = '17.3.0-canary.7'
    const directory = await createApp('17.2.0-canary.4')
    mockSecurityMetadata({
      fallback: true,
      ranges: [target],
      target,
      published: ['17.2.0', '17.2.0-canary.4'],
    })
    await expect(
      getUpgradeAssessment('17.2.0-canary.4', 'latest')
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

  it.each([false, true])(
    'assesses the configured policy rather than a different safe security target, fallback=%s',
    async (fallback) => {
      const directory = await createApp('17.2.0')
      mockSecurityMetadata({
        fallback,
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
    }
  )

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

  it.each(['17.2.0-rc.1', '17.2.0-beta.1'])(
    'keeps other prerelease channels unsupported: %s',
    async (version) => {
      const directory = await createApp(version)
      mockSecurityMetadata()
      await expect(prepareUpgrade(directory, 'security')).rejects.toThrow(
        'AI upgrades are not available for prerelease versions'
      )
      await expect(getUpgradeAssessment(version, 'security')).rejects.toThrow(
        'prerelease versions'
      )
      expect(global.fetch).toHaveBeenCalledTimes(0)
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

      it.each(['17.2.0-rc.1', '17.2.0-beta.1', '17.2.0-preview.1'])(
        'keeps other prereleases unsupported: %s',
        async (installed) => {
          const directory = await createApp(installed)
          mockSecurityMetadata()
          await expect(prepareUpgrade(directory, policy)).rejects.toThrow(
            'AI upgrades are not available for prerelease versions'
          )
          expect(global.fetch).toHaveBeenCalledTimes(0)
        }
      )
    }
  )

  it.each([false, true])(
    'rejects an affected Future canary with npm fallback=%s',
    async (fallback) => {
      const directory = await createApp('17.2.0-canary.4')
      mockSecurityMetadata({ fallback, ranges: ['>=17.0.0 <17.2.1'] })
      await expect(prepareUpgrade(directory, 'future')).rejects.toThrow(
        '17.2.0-canary.5 is affected by an active advisory.'
      )
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

  it.each([false, true])(
    'assesses a retained Future version missing from registry metadata with npm fallback=%s',
    async (fallback) => {
      const directory = await createApp('17.2.0-canary.9')
      mockSecurityMetadata({ fallback, ranges: ['17.2.0-canary.9'] })
      await expect(prepareUpgrade(directory, 'future')).rejects.toThrow(
        '17.2.0-canary.9 is affected by an active advisory.'
      )
    }
  )

  it.each(['latest', 'future'] as const)(
    'fails a %s assessment when both advisory providers are unavailable',
    async (policy) => {
      const directory = await createApp('17.2.0-canary.4')
      mockSecurityMetadata({ fallback: true, npmFailure: true })
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
    expect(global.fetch).toHaveBeenCalledTimes(2)
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
        Response.json(
          String(input).startsWith('https://api.github.com/') ? [] : metadata
        )
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
      if (String(input).startsWith('https://api.github.com/')) {
        return Response.json([])
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

  it('allows a Future target outside npm fallback advisory ranges', async () => {
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

  it('blocks a Future target inside npm fallback advisory ranges', async () => {
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
        'Next.js 16.4.0 is current and all available Future Defaults are enabled.',
    })
  })
})
