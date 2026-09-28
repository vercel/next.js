import { execFileSync } from 'node:child_process'
import crossSpawn from 'next/dist/compiled/cross-spawn'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getNpxCommand } from './get-npx-command'
import { getPkgManager } from './get-pkg-manager'
import {
  getAgeGateRegistry,
  getMinimumReleaseAge,
  getMinimumReleaseAgeExclusions,
  resolveAgeEligibleVersion,
} from './get-minimum-release-age'

jest.mock('node:child_process', () => ({
  execFileSync: jest.fn(),
}))

const mockExecFileSync = jest.mocked(execFileSync)

describe('upgrade package manager detection', () => {
  it('finds Bun from a workspace root lockfile', () => {
    const root = mkdtempSync(join(tmpdir(), 'next-upgrade-pkg-manager-'))
    try {
      const app = join(root, 'apps', 'web')
      mkdirSync(app, { recursive: true })
      writeFileSync(join(root, 'bun.lock'), '')

      expect(getPkgManager(app, 'upgrade')).toBe('bun')
      expect(getNpxCommand(app, getPkgManager(app, 'upgrade'))).toBe('bunx')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('uses a workspace packageManager field', () => {
    const root = mkdtempSync(join(tmpdir(), 'next-upgrade-pkg-manager-'))
    try {
      const app = join(root, 'apps', 'web')
      mkdirSync(app, { recursive: true })
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ packageManager: 'pnpm@10.33.0' })
      )

      expect(getPkgManager(app, 'upgrade')).toBe('pnpm')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('getMinimumReleaseAge', () => {
  const directory = '/app'

  beforeEach(() => {
    mockExecFileSync.mockReset()
  })

  describe('pnpm', () => {
    it('accepts an unquoted registry config value', () => {
      mockExecFileSync.mockReturnValueOnce(
        'https://mirror.example/npm/' as never
      )
      expect(getAgeGateRegistry(directory, 'pnpm', 'next')).toBe(
        'https://mirror.example/npm/'
      )
    })
    it('uses a Windows-safe launcher for command shims', () => {
      const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
      const sync = jest.spyOn(crossSpawn, 'sync')
      Object.defineProperty(process, 'platform', {
        configurable: true,
        value: 'win32',
      })
      try {
        sync
          .mockReturnValueOnce({
            status: 0,
            stdout: '10.33.0',
            stderr: '',
          } as never)
          .mockReturnValueOnce({ status: 0, stdout: '0', stderr: '' } as never)
        expect(getMinimumReleaseAge(directory, 'pnpm')).toBe(0)
        expect(sync).toHaveBeenCalledWith(
          'pnpm',
          ['--version'],
          expect.objectContaining({ cwd: directory })
        )
      } finally {
        sync.mockRestore()
        Object.defineProperty(process, 'platform', platform)
      }
    })
    it('reads version-qualified exclusions without removing the package age', () => {
      mockExecFileSync
        .mockReturnValueOnce('10.33.0' as never)
        .mockReturnValueOnce('2880' as never)
        .mockReturnValueOnce('["next@17.0.0-canary.35"]' as never)
        .mockReturnValueOnce('["next@17.0.0-canary.35"]' as never)

      expect(getMinimumReleaseAge(directory, 'pnpm', 'next')).toBe(
        48 * 60 * 60 * 1000
      )
      expect(getMinimumReleaseAgeExclusions(directory, 'pnpm')).toEqual([
        'next@17.0.0-canary.35',
      ])
    })
    it('reads minutes from effective config', () => {
      mockExecFileSync
        .mockReturnValueOnce('10.33.0' as never)
        .mockReturnValueOnce('2880' as never)

      expect(getMinimumReleaseAge(directory, 'pnpm')).toBe(48 * 60 * 60 * 1000)
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'pnpm',
        ['config', 'get', 'minimumReleaseAge', '--json'],
        expect.objectContaining({ cwd: directory })
      )
    })

    it('returns zero when no age is configured', () => {
      mockExecFileSync
        .mockReturnValueOnce('10.33.0' as never)
        .mockReturnValueOnce('undefined' as never)

      expect(getMinimumReleaseAge(directory, 'pnpm')).toBe(0)
    })

    it('respects package exclusions', () => {
      mockExecFileSync
        .mockReturnValueOnce('10.33.0' as never)
        .mockReturnValueOnce('2880' as never)
        .mockReturnValueOnce('["next", "@next/*"]' as never)

      expect(getMinimumReleaseAge(directory, 'pnpm', '@next/codemod')).toBe(0)
    })

    it('ignores the setting on versions that do not implement it', () => {
      mockExecFileSync.mockReturnValue('10.15.0' as never)

      expect(getMinimumReleaseAge(directory, 'pnpm')).toBe(0)
      expect(mockExecFileSync).toHaveBeenCalledTimes(1)
    })

    it('rejects malformed settings', () => {
      mockExecFileSync
        .mockReturnValueOnce('10.33.0' as never)
        .mockReturnValueOnce('-1' as never)

      expect(() => getMinimumReleaseAge(directory, 'pnpm')).toThrow(
        'Invalid minimumReleaseAge value'
      )
    })
  })

  describe('npm', () => {
    it('uses the configured registry in a workspace', () => {
      mockExecFileSync.mockReturnValueOnce(
        '"https://mirror.example/npm"' as never
      )
      expect(getAgeGateRegistry(directory, 'npm', 'next')).toBe(
        'https://mirror.example/npm/'
      )
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'npm',
        ['config', 'get', 'registry', '--json', '--no-workspaces'],
        expect.objectContaining({ cwd: directory })
      )
    })
    it('ignores the setting on versions that do not implement it', () => {
      mockExecFileSync.mockReturnValue('9.8.1' as never)

      expect(getMinimumReleaseAge(directory, 'npm')).toBe(0)
      expect(mockExecFileSync).toHaveBeenCalledTimes(1)
    })

    it('reads days on supported versions', () => {
      mockExecFileSync
        .mockReturnValueOnce('11.10.0' as never)
        .mockReturnValueOnce('2' as never)

      expect(getMinimumReleaseAge(directory, 'npm')).toBe(
        2 * 24 * 60 * 60 * 1000
      )
      expect(mockExecFileSync).toHaveBeenLastCalledWith(
        'npm',
        ['config', 'get', 'min-release-age', '--json', '--no-workspaces'],
        expect.objectContaining({ cwd: directory })
      )
    })

    it('returns zero when no age is configured', () => {
      mockExecFileSync
        .mockReturnValueOnce('11.10.0' as never)
        .mockReturnValueOnce('null' as never)

      expect(getMinimumReleaseAge(directory, 'npm')).toBe(0)
    })

    it('respects package exclusions', () => {
      mockExecFileSync
        .mockReturnValueOnce('11.10.0' as never)
        .mockReturnValueOnce('2' as never)
        .mockReturnValueOnce('["next"]' as never)

      expect(getMinimumReleaseAge(directory, 'npm', 'next')).toBe(0)
    })

    it('rejects malformed settings', () => {
      mockExecFileSync
        .mockReturnValueOnce('11.10.0' as never)
        .mockReturnValueOnce('-1' as never)

      expect(() => getMinimumReleaseAge(directory, 'npm')).toThrow(
        'Invalid min-release-age value'
      )
    })
  })

  describe('yarn', () => {
    it('uses the scoped registry for scoped packages', () => {
      mockExecFileSync
        .mockReturnValueOnce('4.10.0' as never)
        .mockReturnValueOnce('"https://mirror.example/scoped"' as never)
      expect(getAgeGateRegistry(directory, 'yarn', '@next/codemod')).toBe(
        'https://mirror.example/scoped/'
      )
    })
    it('reads the age gate in Yarn 4.10', () => {
      mockExecFileSync
        .mockReturnValueOnce('4.10.0' as never)
        .mockReturnValueOnce('1440' as never)

      expect(getMinimumReleaseAge(directory, 'yarn')).toBe(24 * 60 * 60 * 1000)
    })
    it('treats an unset age gate in Yarn 4.10 as disabled', () => {
      mockExecFileSync
        .mockReturnValueOnce('4.10.0' as never)
        .mockReturnValueOnce('null' as never)

      expect(getMinimumReleaseAge(directory, 'yarn')).toBe(0)
    })
    it('uses no age gate on Yarn Classic', () => {
      mockExecFileSync.mockReturnValue('1.22.19' as never)

      expect(getMinimumReleaseAge(directory, 'yarn')).toBe(0)
      expect(mockExecFileSync).toHaveBeenCalledTimes(1)
    })

    it('reads Yarn 4.12 default duration in minutes', () => {
      mockExecFileSync
        .mockReturnValueOnce('4.12.0' as never)
        .mockReturnValueOnce('1440' as never)

      expect(getMinimumReleaseAge(directory, 'yarn')).toBe(24 * 60 * 60 * 1000)
      expect(mockExecFileSync).toHaveBeenLastCalledWith(
        'yarn',
        ['config', 'get', 'npmMinimalAgeGate', '--json'],
        expect.objectContaining({ cwd: directory })
      )
    })

    it('reads a configured duration', () => {
      mockExecFileSync
        .mockReturnValueOnce('4.12.0' as never)
        .mockReturnValueOnce('2880' as never)

      expect(getMinimumReleaseAge(directory, 'yarn')).toBe(
        2 * 24 * 60 * 60 * 1000
      )
    })

    it('returns zero when the age gate is disabled', () => {
      mockExecFileSync
        .mockReturnValueOnce('4.12.0' as never)
        .mockReturnValueOnce('0' as never)

      expect(getMinimumReleaseAge(directory, 'yarn')).toBe(0)
    })

    it('rejects malformed settings', () => {
      mockExecFileSync
        .mockReturnValueOnce('4.12.0' as never)
        .mockReturnValueOnce('-1' as never)

      expect(() => getMinimumReleaseAge(directory, 'yarn')).toThrow(
        'Invalid npmMinimalAgeGate value'
      )
    })

    it('uses scoped age settings for a scoped package', () => {
      mockExecFileSync
        .mockReturnValueOnce('4.12.0' as never)
        .mockReturnValueOnce('2880' as never)
        .mockReturnValueOnce('[]' as never)

      expect(getMinimumReleaseAge(directory, 'yarn', '@next/codemod')).toBe(
        2 * 24 * 60 * 60 * 1000
      )
      expect(mockExecFileSync).toHaveBeenNthCalledWith(
        2,
        'yarn',
        ['config', 'get', 'npmScopes["next"].npmMinimalAgeGate', '--json'],
        expect.objectContaining({ cwd: directory })
      )
    })

    it('respects preapproved packages', () => {
      mockExecFileSync
        .mockReturnValueOnce('4.12.0' as never)
        .mockReturnValueOnce('1440' as never)
        .mockReturnValueOnce('["@next/*"]' as never)

      expect(getMinimumReleaseAge(directory, 'yarn', '@next/codemod')).toBe(0)
    })

    it('falls back to the global age when a scope has no override', () => {
      mockExecFileSync
        .mockReturnValueOnce('4.12.0' as never)
        .mockReturnValueOnce('undefined' as never)
        .mockReturnValueOnce('1440' as never)
        .mockReturnValueOnce('[]' as never)

      expect(getMinimumReleaseAge(directory, 'yarn', '@next/codemod')).toBe(
        24 * 60 * 60 * 1000
      )
    })
  })

  describe('bun', () => {
    it('reads global config from USERPROFILE when HOME is unavailable', () => {
      const root = mkdtempSync(join(tmpdir(), 'next-bun-age-'))
      writeFileSync(
        join(root, '.bunfig.toml'),
        '[install]\nminimumReleaseAge = 86400\n'
      )
      try {
        mockExecFileSync
          .mockReturnValueOnce(
            'Options: --minimum-release-age=<seconds>' as never
          )
          .mockReturnValueOnce(
            JSON.stringify([{ install: { minimumReleaseAge: 86400 } }]) as never
          )
        expect(
          getMinimumReleaseAge(root, 'bun', null, {
            ...process.env,
            XDG_CONFIG_HOME: '',
            HOME: '',
            USERPROFILE: root,
          })
        ).toBe(24 * 60 * 60 * 1000)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })
    it('uses the registry from the environment', () => {
      expect(
        getAgeGateRegistry(directory, 'bun', 'next', {
          ...process.env,
          npm_config_registry: 'https://mirror.example/bun',
        })
      ).toBe('https://mirror.example/bun/')
    })
    it('reads global and project config, with project precedence', () => {
      const root = mkdtempSync(join(tmpdir(), 'next-bun-age-'))
      const project = join(root, 'project')
      mkdirSync(project)
      writeFileSync(
        join(root, '.bunfig.toml'),
        '[install]\nminimumReleaseAge = 86400\n'
      )
      writeFileSync(
        join(project, 'bunfig.toml'),
        '[install]\nminimumReleaseAge = 172800\n'
      )

      try {
        mockExecFileSync
          .mockReturnValueOnce(
            'Options: --minimum-release-age=<seconds>' as never
          )
          .mockReturnValueOnce(
            JSON.stringify([
              { install: { minimumReleaseAge: 86400 } },
              { install: { minimumReleaseAge: 172800 } },
            ]) as never
          )

        expect(
          getMinimumReleaseAge(project, 'bun', null, {
            ...process.env,
            XDG_CONFIG_HOME: root,
            HOME: root,
          })
        ).toBe(2 * 24 * 60 * 60 * 1000)

        const parserCall = mockExecFileSync.mock.calls[1]
        const options = parserCall[2] as { input: string }
        expect(JSON.parse(options.input)).toEqual([
          '[install]\nminimumReleaseAge = 86400\n',
          '[install]\nminimumReleaseAge = 172800\n',
        ])
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('reads the workspace ancestor Bun policy', () => {
      const root = mkdtempSync(join(tmpdir(), 'next-bun-age-'))
      const app = join(root, 'apps', 'web')
      mkdirSync(app, { recursive: true })
      writeFileSync(
        join(root, 'bunfig.toml'),
        '[install]\nminimumReleaseAge = 172800\n'
      )
      try {
        mockExecFileSync
          .mockReturnValueOnce(
            'Options: --minimum-release-age=<seconds>' as never
          )
          .mockReturnValueOnce(
            JSON.stringify([
              { install: { minimumReleaseAge: 172800 } },
            ]) as never
          )
        expect(
          getMinimumReleaseAge(app, 'bun', null, {
            ...process.env,
            XDG_CONFIG_HOME: join(root, 'global'),
          })
        ).toBe(48 * 60 * 60 * 1000)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('uses the scoped Bun registry in a workspace ancestor', () => {
      const root = mkdtempSync(join(tmpdir(), 'next-bun-scope-'))
      const app = join(root, 'apps', 'web')
      mkdirSync(app, { recursive: true })
      writeFileSync(
        join(root, 'bunfig.toml'),
        '[install.scopes]\n"@next" = "https://scope.example/"\n'
      )
      try {
        mockExecFileSync.mockReturnValueOnce(
          JSON.stringify({
            install: {
              registry: 'https://default.example/',
              scopes: { '@next': 'https://scope.example/' },
            },
          }) as never
        )
        expect(
          getAgeGateRegistry(app, 'bun', '@next/codemod', {
            ...process.env,
            npm_config_registry: '',
            XDG_CONFIG_HOME: join(root, 'global'),
          })
        ).toBe('https://scope.example/')
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('returns zero when no age is configured', () => {
      const root = mkdtempSync(join(tmpdir(), 'next-bun-age-'))
      try {
        mockExecFileSync.mockReturnValueOnce(
          'Options: --minimum-release-age=<seconds>' as never
        )

        expect(
          getMinimumReleaseAge(root, 'bun', null, {
            ...process.env,
            XDG_CONFIG_HOME: root,
            HOME: root,
          })
        ).toBe(0)
        expect(mockExecFileSync).toHaveBeenCalledTimes(1)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('respects package exclusions', () => {
      const root = mkdtempSync(join(tmpdir(), 'next-bun-age-'))
      writeFileSync(
        join(root, 'bunfig.toml'),
        '[install]\nminimumReleaseAge = 86400\nminimumReleaseAgeExcludes = ["next"]\n'
      )
      try {
        mockExecFileSync
          .mockReturnValueOnce(
            'Options: --minimum-release-age=<seconds>' as never
          )
          .mockReturnValueOnce(
            JSON.stringify([
              {
                install: {
                  minimumReleaseAge: 86400,
                  minimumReleaseAgeExcludes: ['next'],
                },
              },
            ]) as never
          )

        expect(
          getMinimumReleaseAge(root, 'bun', 'next', {
            ...process.env,
            XDG_CONFIG_HOME: root,
            HOME: root,
          })
        ).toBe(0)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('returns zero when Bun does not support the age gate', () => {
      mockExecFileSync.mockReturnValueOnce(
        'Options: --frozen-lockfile' as never
      )

      expect(getMinimumReleaseAge(directory, 'bun')).toBe(0)
      expect(mockExecFileSync).toHaveBeenCalledTimes(1)
    })

    it('rejects malformed settings', () => {
      const root = mkdtempSync(join(tmpdir(), 'next-bun-age-'))
      writeFileSync(
        join(root, 'bunfig.toml'),
        '[install]\nminimumReleaseAge = -1\n'
      )
      try {
        mockExecFileSync
          .mockReturnValueOnce(
            'Options: --minimum-release-age=<seconds>' as never
          )
          .mockReturnValueOnce(
            JSON.stringify([{ install: { minimumReleaseAge: -1 } }]) as never
          )

        expect(() =>
          getMinimumReleaseAge(root, 'bun', null, {
            ...process.env,
            XDG_CONFIG_HOME: root,
            HOME: root,
          })
        ).toThrow('Invalid minimumReleaseAge value')
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })
  })
})

describe('resolveAgeEligibleVersion', () => {
  const originalFetch = global.fetch
  const now = Date.parse('2026-09-28T00:00:00.000Z')

  function packument(
    versions: Record<string, number>,
    channel: string = 'canary'
  ) {
    const names = Object.keys(versions)
    return {
      'dist-tags': { [channel]: names[names.length - 1] },
      versions: Object.fromEntries(names.map((version) => [version, {}])),
      time: Object.fromEntries(
        names.map((version) => [
          version,
          new Date(now - versions[version] * 60 * 60 * 1000).toISOString(),
        ])
      ),
    }
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now)
  })

  afterEach(() => {
    global.fetch = originalFetch
    jest.useRealTimers()
  })

  it('reads metadata through the authenticated manager command', async () => {
    mockExecFileSync.mockReset().mockReturnValueOnce(
      JSON.stringify({
        ...packument({ '17.1.0-canary.1': 72, '17.1.0-canary.2': 1 }),
        versions: ['17.1.0-canary.1', '17.1.0-canary.2'],
      }) as never
    )
    await expect(
      resolveAgeEligibleVersion(
        {
          name: 'next',
          minimumReleaseAge: 48 * 60 * 60 * 1000,
          registry: 'https://mirror.example/',
          directory: '/app',
          manager: 'pnpm',
        },
        'canary'
      )
    ).resolves.toBe('17.1.0-canary.1')
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'pnpm',
      [
        'view',
        'next',
        'time',
        'versions',
        'dist-tags',
        '--json',
        '--registry=https://mirror.example/',
      ],
      expect.objectContaining({ cwd: '/app' })
    )
    expect(global.fetch).toBe(originalFetch)
  })

  it('uses Bun registry credentials without exposing them to a subprocess', async () => {
    const root = mkdtempSync(join(tmpdir(), 'next-bun-auth-'))
    writeFileSync(
      join(root, 'bunfig.toml'),
      '[install]\nregistry = { url = "https://mirror.example/", token = "$BUN_TEST_TOKEN" }\n'
    )
    const previousToken = process.env.BUN_TEST_TOKEN
    const previousConfigHome = process.env.XDG_CONFIG_HOME
    process.env.BUN_TEST_TOKEN = 'test-token'
    process.env.XDG_CONFIG_HOME = root
    mockExecFileSync.mockReset().mockReturnValueOnce(
      JSON.stringify({
        install: {
          registry: {
            url: 'https://mirror.example/',
            token: '$BUN_TEST_TOKEN',
          },
        },
      }) as never
    )
    global.fetch = jest.fn(async () =>
      Response.json(packument({ '17.1.0-canary.1': 72 }))
    )
    try {
      await expect(
        resolveAgeEligibleVersion(
          {
            name: 'next',
            minimumReleaseAge: 48 * 60 * 60 * 1000,
            registry: 'https://mirror.example/',
            directory: root,
            manager: 'bun',
          },
          'canary'
        )
      ).resolves.toBe('17.1.0-canary.1')
      expect(global.fetch).toHaveBeenCalledWith(
        'https://mirror.example/next',
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
        })
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
      if (previousToken === undefined) {
        delete process.env.BUN_TEST_TOKEN
      } else {
        process.env.BUN_TEST_TOKEN = previousToken
      }
      if (previousConfigHome === undefined) {
        delete process.env.XDG_CONFIG_HOME
      } else {
        process.env.XDG_CONFIG_HOME = previousConfigHome
      }
    }
  })

  it('selects the newest canary old enough for the age gate', async () => {
    global.fetch = jest.fn(async () =>
      Response.json(
        packument({
          '17.1.0-canary.1': 72,
          '17.1.0-canary.2': 49,
          '17.1.0-canary.3': 2,
        })
      )
    )

    await expect(
      resolveAgeEligibleVersion(
        { name: 'next', minimumReleaseAge: 48 * 60 * 60 * 1000 },
        'canary'
      )
    ).resolves.toBe('17.1.0-canary.2')
  })

  it('selects eligible versions independently for next and the codemod', async () => {
    global.fetch = jest.fn(async (input) =>
      Response.json(
        String(input).includes('codemod')
          ? packument({
              '17.1.0-canary.1': 72,
              '17.1.0-canary.2': 2,
              '17.1.0-canary.3': 1,
            })
          : packument({
              '17.1.0-canary.1': 72,
              '17.1.0-canary.2': 50,
              '17.1.0-canary.3': 1,
            })
      )
    )

    await expect(
      resolveAgeEligibleVersion(
        { name: 'next', minimumReleaseAge: 48 * 60 * 60 * 1000 },
        'canary'
      )
    ).resolves.toBe('17.1.0-canary.2')
    await expect(
      resolveAgeEligibleVersion(
        { name: '@next/codemod', minimumReleaseAge: 48 * 60 * 60 * 1000 },
        'canary'
      )
    ).resolves.toBe('17.1.0-canary.1')
  })

  it('rejects releases with missing publication times', async () => {
    const metadata = packument({ '17.1.0-canary.1': 72 })
    delete metadata.time['17.1.0-canary.1']
    global.fetch = jest.fn(async () => Response.json(metadata))

    await expect(
      resolveAgeEligibleVersion(
        { name: 'next', minimumReleaseAge: 1 },
        'canary'
      )
    ).rejects.toThrow('No canary version of next')
  })

  it('reports when no release is old enough', async () => {
    global.fetch = jest.fn(async () =>
      Response.json(packument({ '17.1.0-canary.1': 1 }))
    )

    await expect(
      resolveAgeEligibleVersion(
        { name: 'next', minimumReleaseAge: 48 * 60 * 60 * 1000 },
        'canary'
      )
    ).rejects.toThrow("project's minimum release age")
  })

  it('accepts only the version-qualified exemption', async () => {
    global.fetch = jest.fn(async () =>
      Response.json(
        packument({
          '17.0.0-canary.34': 72,
          '17.0.0-canary.35': 1,
          '17.0.0-canary.36': 1,
        })
      )
    )
    await expect(
      resolveAgeEligibleVersion(
        {
          name: 'next',
          minimumReleaseAge: 48 * 60 * 60 * 1000,
          exclusions: ['next@17.0.0-canary.35'],
        },
        'canary'
      )
    ).resolves.toBe('17.0.0-canary.35')
  })

  it('limits stable selections to the requested range', async () => {
    global.fetch = jest.fn(async () =>
      Response.json(
        packument(
          {
            '16.1.1': 72,
            '16.1.2': 72,
            '16.2.0': 72,
          },
          'latest'
        )
      )
    )
    await expect(
      resolveAgeEligibleVersion(
        {
          name: 'next',
          minimumReleaseAge: 1,
          range: '~16.1.0',
        },
        'latest'
      )
    ).resolves.toBe('16.1.2')
  })

  it.each(['17.0.1', '^17.0.0'])(
    'allows explicit %s beyond the latest tag when both packages are eligible',
    async (range) => {
      global.fetch = jest.fn(async () =>
        Response.json({
          ...packument({ '17.0.0': 72, '17.0.1': 72 }, 'latest'),
          'dist-tags': { latest: '17.0.0' },
        })
      )
      await expect(
        resolveAgeEligibleVersion(
          { name: 'next', minimumReleaseAge: 1, range },
          'latest',
          { name: '@next/codemod', minimumReleaseAge: 1 }
        )
      ).resolves.toBe('17.0.1')
    }
  )

  it.each(['15.5.1', '15.6.0-canary.1'])(
    'resolves a custom dist-tag to %s shared with the codemod',
    async (version) => {
      global.fetch = jest.fn(async (input) =>
        Response.json(
          String(input).includes('codemod')
            ? packument({ [version]: 72 }, 'latest')
            : packument({ [version]: 72 }, 'next-15')
        )
      )
      await expect(
        resolveAgeEligibleVersion(
          { name: 'next', minimumReleaseAge: 1, range: 'next-15' },
          'latest',
          { name: '@next/codemod', minimumReleaseAge: 1 }
        )
      ).resolves.toBe(version)
    }
  )

  it('rejects a custom tag when its codemod is too recent', async () => {
    global.fetch = jest.fn(async (input) =>
      Response.json(
        packument(
          { '15.5.1': String(input).includes('codemod') ? 1 : 72 },
          'next-15'
        )
      )
    )
    await expect(
      resolveAgeEligibleVersion(
        {
          name: 'next',
          minimumReleaseAge: 48 * 60 * 60 * 1000,
          range: 'next-15',
        },
        'latest',
        { name: '@next/codemod', minimumReleaseAge: 48 * 60 * 60 * 1000 }
      )
    ).rejects.toThrow("project's minimum release age")
  })

  it('selects a canary shared by Next.js and the codemod', async () => {
    global.fetch = jest.fn(async (input) =>
      Response.json(
        String(input).includes('codemod')
          ? packument({ '17.0.0-canary.34': 72, '17.0.0-canary.35': 1 })
          : packument({ '17.0.0-canary.34': 72, '17.0.0-canary.35': 72 })
      )
    )
    await expect(
      resolveAgeEligibleVersion(
        { name: 'next', minimumReleaseAge: 48 * 60 * 60 * 1000 },
        'canary',
        { name: '@next/codemod', minimumReleaseAge: 48 * 60 * 60 * 1000 }
      )
    ).resolves.toBe('17.0.0-canary.34')
  })
})
