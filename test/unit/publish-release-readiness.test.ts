const {
  findExactWorkspacePrerequisites,
  getExactWorkspacePublishLayers,
  publishWorkspacePackages,
  waitForExactPackageVersion,
} = require('../../scripts/npm-release-readiness')

const version = '16.4.0-canary.22'

function packageFixture(
  name: string,
  dependencies: Record<string, string> = {},
  extra: Record<string, unknown> = {}
) {
  return {
    dir: `packages/${name}`,
    manifest: { name, version, dependencies, ...extra },
  }
}

describe('npm release readiness', () => {
  const packages = [
    packageFixture('@next/env'),
    packageFixture('next', { '@next/env': version }),
    packageFixture('@next/eslint-plugin-next'),
    packageFixture('eslint-config-next', {
      '@next/eslint-plugin-next': version,
    }),
    packageFixture('@next/ranged-consumer', { '@next/env': `^${version}` }),
    packageFixture('@next/workspace-consumer', { '@next/env': 'workspace:*' }),
    packageFixture('@next/private-prerequisite', {}, { private: true }),
    packageFixture(
      '@next/private-consumer',
      { '@next/private-prerequisite': version },
      { private: true }
    ),
  ]

  it('finds public exact-version workspace prerequisites', () => {
    expect(
      findExactWorkspacePrerequisites(packages, version).map(
        ({ manifest }: any) => manifest.name
      )
    ).toEqual(['@next/env', '@next/eslint-plugin-next'])
  })

  it('orders chained prerequisites in dependency-first layers', () => {
    const chainedPackages = [
      packageFixture('@next/leaf'),
      packageFixture('@next/middle', { '@next/leaf': version }),
      packageFixture('@next/consumer', { '@next/middle': version }),
    ]

    expect(
      getExactWorkspacePublishLayers(chainedPackages, version).map(
        (layer: any[]) => layer.map(({ manifest }) => manifest.name)
      )
    ).toEqual([['@next/leaf'], ['@next/middle']])
  })

  it('waits for exact companions before publishing their dependents', async () => {
    const events: string[] = []

    await publishWorkspacePackages({
      packages,
      version,
      npmDistTag: 'canary',
      dryRun: false,
      publish: async (label: string, args: string[]) => {
        events.push(`publish:${label}`)
        if (label === 'workspace') {
          expect(args).toEqual(
            expect.arrayContaining([
              '!@next/env',
              '!@next/eslint-plugin-next',
              '--recursive',
              '--report-summary',
            ])
          )
        }
      },
      waitForVersions: async (prerequisites: any[]) => {
        events.push(
          `ready:${prerequisites
            .map(({ manifest }) => manifest.name)
            .join(',')}`
        )
      },
    })

    expect(events.slice(0, 2).sort()).toEqual([
      'publish:@next/env',
      'publish:@next/eslint-plugin-next',
    ])
    expect(events[2]).toBe('ready:@next/env,@next/eslint-plugin-next')
    expect(events[3]).toBe('publish:workspace')
  })

  it('polls the exact encoded package version until it is ready', async () => {
    const urls: string[] = []
    const statuses = [404, 404, 200]
    const sleep = jest.fn(async () => {})

    await waitForExactPackageVersion('@next/env', version, {
      attempts: 3,
      delaySeconds: 1,
      sleep,
      fetchImpl: async (url: string) => {
        urls.push(url)
        const status = statuses.shift()!
        return {
          ok: status === 200,
          status,
          statusText: status === 200 ? 'OK' : 'Not Found',
        }
      },
    })

    expect(urls).toEqual(
      Array(3).fill(
        `https://registry.npmjs.org/%40next%2Fenv/${encodeURIComponent(version)}`
      )
    )
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('fails closed when an exact companion never becomes ready', async () => {
    await expect(
      waitForExactPackageVersion('@next/eslint-plugin-next', version, {
        attempts: 2,
        delaySeconds: 1,
        sleep: async () => {},
        fetchImpl: async () => ({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        }),
      })
    ).rejects.toThrow(
      '@next/eslint-plugin-next@16.4.0-canary.22 was not available from npm after 2 attempts'
    )
  })

  it('does not publish dependents when readiness fails', async () => {
    const published: string[] = []

    await expect(
      publishWorkspacePackages({
        packages,
        version,
        npmDistTag: 'canary',
        dryRun: false,
        publish: async (label: string) => {
          published.push(label)
        },
        waitForVersions: async () => {
          throw new Error('exact version unavailable')
        },
      })
    ).rejects.toThrow('exact version unavailable')

    expect(published).not.toContain('workspace')
  })

  it('does not perform registry readiness checks during a dry run', async () => {
    const events: string[] = []
    const waitForVersions = jest.fn(async () => {})

    await publishWorkspacePackages({
      packages,
      version,
      npmDistTag: 'canary',
      dryRun: true,
      publish: async (label: string, args: string[]) => {
        events.push(label)
        expect(args).toContain('--dry-run')
      },
      waitForVersions,
    })

    expect(waitForVersions).not.toHaveBeenCalled()
    expect(events).toContain('workspace')
  })
})
