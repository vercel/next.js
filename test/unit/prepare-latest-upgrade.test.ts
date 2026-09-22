import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getLatestUpgradeVersion,
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

  function mockLatestVersion(version: string | null) {
    global.fetch = jest.fn(
      async () =>
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
          mockLatestVersion(target)
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
          mockLatestVersion(target)
          await expect(prepareUpgrade(directory, policy)).resolves.toEqual(
            expect.objectContaining({ status: 'unaffected' })
          )
        }
      )

      it.each([null, 'invalid', '17.3.0', '17.3.0-rc.1'])(
        'rejects invalid or wrong-channel tag metadata: %s',
        async (target) => {
          const directory = await createApp('17.2.0-canary.4')
          mockLatestVersion(target)
          await expect(prepareUpgrade(directory, policy)).rejects.toThrow(
            'Could not determine the latest Next.js version on the canary dist-tag.'
          )
        }
      )

      it.each(['17.2.0-rc.1', '17.2.0-beta.1', '17.2.0-preview.1'])(
        'keeps other prereleases unsupported: %s',
        async (installed) => {
          const directory = await createApp(installed)
          mockLatestVersion('17.2.0-canary.5')
          await expect(prepareUpgrade(directory, policy)).rejects.toThrow(
            'AI upgrades are not available for prerelease versions'
          )
          expect(global.fetch).toHaveBeenCalledTimes(0)
        }
      )
    }
  )

  it.each(['17.2.0-canary.4', '17.2.0-canary.3'])(
    'adopts available defaults without a version change when the tag is %s',
    async (target) => {
      const directory = await createApp('17.2.0-canary.4')
      mockLatestVersion(target)
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
    mockLatestVersion('16.3.0-canary.1')
    await expect(prepareUpgrade(directory, 'future')).resolves.toEqual(
      expect.objectContaining({ status: 'unaffected' })
    )
  })

  it('rejects canary security upgrades without querying metadata', async () => {
    const directory = await createApp('17.2.0-canary.4')
    global.fetch = jest.fn()
    await expect(prepareUpgrade(directory, 'security')).rejects.toThrow(
      'Security upgrades are not supported for canary'
    )
    expect(global.fetch).toHaveBeenCalledTimes(0)
  })

  it.each(['latest', 'future'] as const)(
    'runs canary %s without querying advisory providers',
    async (policy) => {
      const directory = await createApp('17.2.0-canary.4')
      global.fetch = jest.fn(async (input) => {
        if (String(input) === 'https://registry.npmjs.org/next/canary') {
          return Response.json({ version: '17.2.0-canary.5' })
        }
        throw new Error('Advisory lookup should not run for canaries')
      })
      await expect(prepareUpgrade(directory, policy)).resolves.toMatchObject({
        status: 'ready',
        targetVersion: '17.2.0-canary.5',
      })
      expect(global.fetch).toHaveBeenCalledTimes(1)
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
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(jest.mocked(global.fetch).mock.calls[0][0]).toBe(
      'https://registry.npmjs.org/next/latest'
    )
  })

  it('allows an explicit patch upgrade without a reminder', async () => {
    const directory = await createApp('17.1.0')
    mockLatestVersion('17.1.1')

    await expect(prepareUpgrade(directory, 'latest')).resolves.toEqual(
      expect.objectContaining({ status: 'ready', targetVersion: '17.1.1' })
    )
    await expect(getLatestUpgradeVersion('17.1.0')).resolves.toBeNull()
  })

  it.each([null, {}, { version: 'invalid' }, { version: '17.2.0-canary.1' }])(
    'reports invalid metadata for explicit upgrades but suppresses reminders: %j',
    async (metadata) => {
      const directory = await createApp('17.1.0')
      global.fetch = jest.fn(async () => Response.json(metadata))

      await expect(prepareUpgrade(directory, 'latest')).rejects.toThrow(
        'Could not determine the latest stable Next.js version.'
      )
      await expect(getLatestUpgradeVersion('17.1.0')).resolves.toBeNull()
    }
  )

  it('preserves metadata fetch errors in both callers', async () => {
    const directory = await createApp('17.1.0')
    global.fetch = jest.fn().mockRejectedValue(new Error('Network unavailable'))

    await expect(prepareUpgrade(directory, 'latest')).rejects.toThrow(
      'Could not fetch upgrade metadata.'
    )
    await expect(getLatestUpgradeVersion('17.1.0')).rejects.toThrow(
      'Could not fetch upgrade metadata.'
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
