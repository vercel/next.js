import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { prepareUpgrade } from 'next/dist/lib/upgrade/prepare-upgrade'
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
