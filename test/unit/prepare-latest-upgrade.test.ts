import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getLatestUpgradeVersion,
  getSecurityAdvisory,
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
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
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

  function mockSecurityMetadata({
    ranges = ['>=17.2.0-canary.0 <17.2.0-canary.5'],
    target = '17.2.0-canary.5' as string | null,
    published = ['17.2.0-canary.4', '17.2.0-canary.5', '17.3.0-canary.0'],
    tag = 'canary',
    fallback = false,
  } = {}) {
    global.fetch = jest.fn(async (input) => {
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
          'dist-tags': target === null ? {} : { [tag]: target },
          versions: Object.fromEntries(
            published.map((version) => [version, { version }])
          ),
        })
      }

      if (
        url === 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk'
      ) {
        return Response.json({
          next: ranges.map((range) => ({ vulnerable_versions: range })),
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

  afterEach(async () => {
    global.fetch = originalFetch
    await Promise.all(
      directories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true }))
    )
  })

  describe.each([false, true])('security with npm fallback=%s', (fallback) => {
    it('detects advisories explicitly covering prereleases', async () => {
      mockSecurityMetadata({ fallback })

      await expect(getSecurityAdvisory('17.2.0-canary.4')).resolves.toEqual({
        reference: expect.stringContaining(
          fallback ? 'registry.npmjs.org' : 'api.github.com'
        ),
      })
      if (fallback) {
        expect(global.fetch).toHaveBeenLastCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: JSON.stringify({ next: ['17.2.0-canary.4'] }),
          })
        )
      }
    })

    it.each(['17.2.0-canary.5', '17.2.1-canary.0'])(
      'allows a same-line security fix at %s',
      async (target) => {
        const directory = await createApp('17.2.0-canary.4')
        mockSecurityMetadata({
          fallback,
          target,
          // The tag, not the highest published prerelease, selects the fix.
          published: [target, '17.3.0-canary.0'],
        })

        await expect(prepareUpgrade(directory, 'security')).resolves.toEqual(
          expect.objectContaining({ status: 'ready', targetVersion: target })
        )
        if (fallback) {
          expect(global.fetch).toHaveBeenLastCalledWith(
            expect.any(String),
            expect.objectContaining({
              body: JSON.stringify({
                next: [target, '17.3.0-canary.0', '17.2.0-canary.4'],
              }),
            })
          )
        }
      }
    )

    it('rejects a target affected by another advisory', async () => {
      const directory = await createApp('17.2.0-canary.4')
      mockSecurityMetadata({
        fallback,
        ranges: [
          '>=17.2.0-canary.0 <17.2.0-canary.5',
          '>=17.2.0-canary.5 <17.2.0-canary.6',
        ],
      })

      await expect(prepareUpgrade(directory, 'security')).rejects.toThrow(
        'No safe Next.js update is currently available.'
      )
    })

    it('does not extend stable-only advisory ranges to prereleases', async () => {
      const directory = await createApp('17.2.0-canary.4')
      mockSecurityMetadata({
        fallback,
        ranges: ['>=17.0.0 <17.2.1'],
        target: null,
      })

      await expect(getSecurityAdvisory('17.2.0-canary.4')).resolves.toBeNull()
      await expect(prepareUpgrade(directory, 'security')).resolves.toEqual(
        expect.objectContaining({ status: 'unaffected' })
      )
    })
  })

  it.each(['17.2.0-canary.4', '17.2.0-canary.3'])(
    'rejects a security target that is not newer: %s',
    async (target) => {
      const directory = await createApp('17.2.0-canary.4')
      mockSecurityMetadata({
        ranges: ['17.2.0-canary.4'],
        target,
        published: [target],
      })

      await expect(prepareUpgrade(directory, 'security')).rejects.toThrow(
        'No safe Next.js update is currently available.'
      )
    }
  )

  it.each([null, 'invalid', '17.2.0', '17.2.0-rc.1'])(
    'rejects a missing or mismatched prerelease security tag: %s',
    async (target) => {
      const directory = await createApp('17.2.0-canary.4')
      mockSecurityMetadata({ target, published: target ? [target] : [] })

      await expect(prepareUpgrade(directory, 'security')).rejects.toThrow(
        'Could not determine the latest Next.js version on the canary dist-tag.'
      )
    }
  )

  it('rejects an unpublished dist-tag target', async () => {
    const directory = await createApp('17.2.0-canary.4')
    mockSecurityMetadata({ published: ['17.2.0-canary.4'] })

    await expect(prepareUpgrade(directory, 'security')).rejects.toThrow(
      'Could not determine the latest Next.js version on the canary dist-tag.'
    )
  })

  it('keeps security fixes on non-canary prerelease channels', async () => {
    const directory = await createApp('17.2.0-rc.1')
    mockSecurityMetadata({
      ranges: ['>=17.2.0-rc.0 <17.2.0-rc.2'],
      tag: 'rc',
      target: '17.2.0-rc.2',
      published: ['17.2.0-rc.1', '17.2.0-rc.2'],
    })

    await expect(prepareUpgrade(directory, 'security')).resolves.toEqual(
      expect.objectContaining({ status: 'ready', targetVersion: '17.2.0-rc.2' })
    )
  })

  it('preserves stable security target selection', async () => {
    const directory = await createApp('17.2.0')
    mockSecurityMetadata({
      ranges: ['>=17.0.0 <17.2.1'],
      published: ['17.2.0', '17.2.1', '17.3.0-canary.0', '18.0.0'],
    })

    await expect(prepareUpgrade(directory, 'security')).resolves.toEqual(
      expect.objectContaining({ status: 'ready', targetVersion: '17.2.1' })
    )
  })

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
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(jest.mocked(global.fetch).mock.calls[0][0]).toBe(
      'https://registry.npmjs.org/next/latest'
    )
  })

  it('selects the latest release from the installed prerelease dist-tag', async () => {
    const directory = await createApp('17.1.0-canary.4')
    mockLatestVersion('17.2.0-canary.9')

    await expect(prepareUpgrade(directory, 'latest')).resolves.toEqual(
      expect.objectContaining({
        status: 'ready',
        installedVersion: '17.1.0-canary.4',
        targetVersion: '17.2.0-canary.9',
        references: ['https://registry.npmjs.org/next/canary'],
      })
    )
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(jest.mocked(global.fetch).mock.calls[0][0]).toBe(
      'https://registry.npmjs.org/next/canary'
    )
  })

  it('nudges prereleases only across a major or minor boundary', async () => {
    mockLatestVersion('17.2.0-canary.9')

    await expect(getLatestUpgradeVersion('17.1.0-canary.4')).resolves.toBe(
      '17.2.0-canary.9'
    )
    expect(jest.mocked(global.fetch).mock.calls[0][0]).toBe(
      'https://registry.npmjs.org/next/canary'
    )
  })

  it('does not nudge within the same prerelease major/minor line', async () => {
    mockLatestVersion('17.2.1-canary.0')

    await expect(getLatestUpgradeVersion('17.2.0-canary.4')).resolves.toBeNull()
  })

  it('does not upgrade within the same prerelease major/minor line', async () => {
    const directory = await createApp('17.2.0-canary.4')
    mockLatestVersion('17.2.0-canary.9')

    await expect(prepareUpgrade(directory, 'latest')).resolves.toEqual({
      status: 'unaffected',
      reason:
        'Next.js 17.2.0-canary.4 is already on the latest canary major/minor line 17.2.',
    })
  })

  it('rejects a prerelease dist-tag that resolves to another channel', async () => {
    const directory = await createApp('17.2.0-rc.1')
    mockLatestVersion('17.2.0')

    await expect(prepareUpgrade(directory, 'latest')).rejects.toThrow(
      'Could not determine the latest Next.js version on the rc dist-tag.'
    )
  })

  it('does nothing when the app already uses latest', async () => {
    const directory = await createApp('17.1.0')
    mockLatestVersion('17.1.0')

    await expect(prepareUpgrade(directory, 'latest')).resolves.toEqual({
      status: 'unaffected',
      reason: 'Next.js 17.1.0 is already the latest stable release.',
    })
  })

  it('does nothing when the app already uses the latest prerelease', async () => {
    const directory = await createApp('17.2.0-beta.3')
    mockLatestVersion('17.2.0-beta.3')

    await expect(prepareUpgrade(directory, 'latest')).resolves.toEqual({
      status: 'unaffected',
      reason:
        'Next.js 17.2.0-beta.3 is already the latest release on the beta dist-tag.',
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
