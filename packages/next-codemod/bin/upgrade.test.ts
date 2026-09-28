import fs from 'fs'
import path from 'path'
import execa from 'execa'
import crossSpawn from 'next/dist/compiled/cross-spawn'
import { getPkgManager } from '../lib/handle-package'
import { ageEligibleVersions, packageInfo } from './upgrade'

jest.mock('execa', () => ({
  __esModule: true,
  default: { sync: jest.fn() },
}))
jest.mock('../lib/handle-package', () => ({
  getPkgManager: jest.fn(),
}))

const mockSync = jest.mocked(execa.sync)
const mockGetPkgManager = jest.mocked(getPkgManager)
const originalFetch = global.fetch
const now = Date.parse('2026-09-28T00:00:00.000Z')

function packument(ages: Record<string, number>, tag = 'latest') {
  const versions = Object.keys(ages)
  return {
    'dist-tags': { [tag]: versions[versions.length - 1] },
    versions: Object.fromEntries(versions.map((version) => [version, {}])),
    time: Object.fromEntries(
      versions.map((version) => [
        version,
        new Date(now - ages[version] * 60 * 60 * 1000).toISOString(),
      ])
    ),
  }
}

function viewOutput(ages: Record<string, number>, tag = 'latest') {
  const metadata = packument(ages, tag)
  return JSON.stringify({
    ...metadata,
    versions: Object.keys(metadata.versions),
  })
}

describe('codemod minimum release age', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now)
    mockSync.mockReset()
  })

  afterEach(() => {
    global.fetch = originalFetch
    jest.useRealTimers()
  })

  describe('pnpm', () => {
    it.each(['15.5.1', '15.6.0-canary.1'])(
      'resolves a custom dist-tag to its tagged %s release',
      async (taggedVersion) => {
        mockGetPkgManager.mockReturnValue('pnpm')
        mockSync.mockImplementation((_command, args) => {
          if (args[0] === '--version') return { stdout: '10.33.0' } as never
          if (args[0] === 'view') {
            return {
              stdout: viewOutput({ [taggedVersion]: 72 }, 'next-15'),
            } as never
          }
          if (args.includes('minimumReleaseAge')) {
            return { stdout: '2880' } as never
          }
          if (args.includes('minimumReleaseAgeExclude')) {
            return { stdout: '[]' } as never
          }
          return { stdout: 'https://registry.npmjs.org/' } as never
        })

        await expect(ageEligibleVersions('next', 'next-15')).resolves.toEqual([
          taggedVersion,
        ])
      }
    )

    it('selects a React version eligible for React DOM too', async () => {
      mockGetPkgManager.mockReturnValue('pnpm')
      mockSync.mockImplementation((_command, args) => {
        if (args[0] === '--version') return { stdout: '10.33.0' } as never
        if (args[0] === 'view') {
          return {
            stdout: viewOutput(
              args[1] === 'react-dom'
                ? { '19.2.1': 72, '19.2.2': 1 }
                : { '19.2.1': 72, '19.2.2': 72 }
            ),
          } as never
        }
        if (args.includes('minimumReleaseAge'))
          return { stdout: '2880' } as never
        if (args.includes('minimumReleaseAgeExclude'))
          return { stdout: '[]' } as never
        return { stdout: 'https://mirror.example/' } as never
      })

      await expect(
        ageEligibleVersions('react', '^19.0.0', ['react-dom'])
      ).resolves.toEqual(['19.2.1'])
      expect(mockSync).toHaveBeenCalledWith(
        'pnpm',
        expect.arrayContaining([
          'view',
          'react-dom',
          '--registry=https://mirror.example/',
        ]),
        expect.objectContaining({ cwd: expect.any(String) })
      )
    })

    it('honors a version-qualified exemption', async () => {
      mockGetPkgManager.mockReturnValue('pnpm')
      mockSync.mockImplementation((_command, args) => {
        if (args[0] === '--version') return { stdout: '10.33.0' } as never
        if (args[0] === 'view') {
          return {
            stdout: viewOutput(
              { '17.0.0-canary.34': 72, '17.0.0-canary.35': 1 },
              'canary'
            ),
          } as never
        }
        if (args.includes('minimumReleaseAge'))
          return { stdout: '2880' } as never
        if (args.includes('minimumReleaseAgeExclude')) {
          return { stdout: '["next@17.0.0-canary.35"]' } as never
        }
        return { stdout: '"https://registry.npmjs.org/"' } as never
      })

      await expect(
        ageEligibleVersions('next', '17.0.0-canary.35')
      ).resolves.toEqual(['17.0.0-canary.35'])
    })

    it('finds an older eligible Next.js target for a standalone upgrade', async () => {
      mockGetPkgManager.mockReturnValue('pnpm')
      mockSync.mockImplementation((_command, args) => {
        if (args[0] === '--version') {
          return { stdout: '10.33.0' } as never
        }
        if (args[0] === 'view') {
          return {
            stdout: viewOutput({ '16.0.1': 72, '16.0.2': 1 }),
          } as never
        }
        if (args.includes('minimumReleaseAge')) {
          return { stdout: '2880' } as never
        }
        if (args.includes('minimumReleaseAgeExclude')) {
          return { stdout: '[]' } as never
        }
        return { stdout: 'https://mirror.example/' } as never
      })

      await expect(ageEligibleVersions('next', '^16.0.0')).resolves.toEqual([
        '16.0.1',
      ])
      await expect(ageEligibleVersions('next', 'v16.0.1')).resolves.toEqual([
        '16.0.1',
      ])
      await expect(ageEligibleVersions('codemod', 'latest')).resolves.toEqual([
        '16.0.1',
      ])
    })
  })

  describe('npm', () => {
    it('reads days and excludes recent releases', async () => {
      mockGetPkgManager.mockReturnValue('npm')
      mockSync.mockImplementation((_command, args) => {
        if (args[0] === '--version') return { stdout: '11.10.0' } as never
        if (args[0] === 'view') {
          return {
            stdout: viewOutput({ '19.2.1': 72, '19.2.2': 1 }),
          } as never
        }
        if (args.includes('min-release-age')) return { stdout: '2' } as never
        if (args.includes('min-release-age-exclude'))
          return { stdout: '[]' } as never
        return { stdout: '"https://mirror.example/"' } as never
      })

      await expect(ageEligibleVersions('react', '^19.0.0')).resolves.toEqual([
        '19.2.1',
      ])
    })

    it('uses embedded registry credentials without command-line arguments', async () => {
      mockGetPkgManager.mockReturnValue('npm')
      mockSync.mockImplementation((_command, args) => {
        if (args[0] === '--version') {
          return { stdout: '11.10.0' } as never
        }
        if (args.includes('min-release-age')) {
          return { stdout: '2' } as never
        }
        if (args.includes('min-release-age-exclude')) {
          return { stdout: '[]' } as never
        }
        return { stdout: '"https://user:secret@mirror.example/"' } as never
      })
      global.fetch = jest.fn(async () =>
        Response.json(packument({ '19.2.1': 72 }))
      )

      await expect(ageEligibleVersions('react', 'latest')).resolves.toEqual([
        '19.2.1',
      ])
      expect(global.fetch).toHaveBeenCalledWith(
        'https://mirror.example/react',
        expect.objectContaining({
          headers: { Authorization: 'Basic dXNlcjpzZWNyZXQ=' },
        })
      )
      expect(mockSync.mock.calls.some(([, args]) => args[0] === 'view')).toBe(
        false
      )
    })
  })

  describe('yarn', () => {
    it('keeps Yarn Classic on its existing resolution path', async () => {
      mockGetPkgManager.mockReturnValue('yarn')
      mockSync.mockReturnValue({ stdout: '1.22.22' } as never)

      await expect(ageEligibleVersions('react', '^19.0.0')).resolves.toBeNull()
      expect(mockSync).toHaveBeenCalledTimes(1)
      expect(global.fetch).toBe(originalFetch)
    })
    it('reads scoped settings on Yarn 4.10', async () => {
      mockGetPkgManager.mockReturnValue('yarn')
      mockSync.mockImplementation((_command, args) => {
        if (args[0] === '--version') return { stdout: '4.10.0' } as never
        if (args[0] === 'npm') {
          return {
            stdout: viewOutput({ '19.2.1': 72, '19.2.2': 1 }),
          } as never
        }
        if (String(args[2]).includes('npmMinimalAgeGate'))
          return { stdout: '2880' } as never
        if (args.includes('npmPreapprovedPackages'))
          return { stdout: '[]' } as never
        return { stdout: '"https://mirror.example/"' } as never
      })

      await expect(
        ageEligibleVersions('@types/react', '^19.0.0')
      ).resolves.toEqual(['19.2.1'])
    })

    it('honors a version-range preapproval', async () => {
      mockGetPkgManager.mockReturnValue('yarn')
      mockSync.mockImplementation((_command, args) => {
        if (args[0] === '--version') {
          return { stdout: '4.14.1' } as never
        }
        if (args[0] === 'npm') {
          return { stdout: viewOutput({ '16.0.1': 1 }) } as never
        }
        if (String(args[2]).includes('npmMinimalAgeGate')) {
          return { stdout: '2880' } as never
        }
        if (args.includes('npmPreapprovedPackages')) {
          return { stdout: '["next@npm:^16.0.0"]' } as never
        }
        return { stdout: '"https://mirror.example/"' } as never
      })

      await expect(ageEligibleVersions('next', 'latest')).resolves.toEqual([
        '16.0.1',
      ])
    })
  })

  describe('bun', () => {
    it('uses npm metadata lookup when Bun has no info or age support', async () => {
      mockGetPkgManager.mockReturnValue('bun')
      const exists = jest.spyOn(fs, 'existsSync').mockReturnValue(false)
      mockSync.mockImplementation((command, args) => {
        if (command === 'bun' && args[0] === 'install') {
          return { stdout: 'Options: --frozen-lockfile' } as never
        }
        if (command === 'npm' && args[0] === 'view') {
          return { stdout: JSON.stringify({ version: '16.0.1' }) } as never
        }
        throw new Error(`Unexpected command: ${command} ${args.join(' ')}`)
      })
      try {
        await expect(packageInfo('next', '16.0.1')).resolves.toEqual({
          version: '16.0.1',
        })
        expect(mockSync).toHaveBeenCalledWith(
          'npm',
          expect.arrayContaining([
            'view',
            'next@16.0.1',
            '--json',
            '--no-workspaces',
          ]),
          expect.objectContaining({ cwd: process.cwd() })
        )
      } finally {
        exists.mockRestore()
      }
    })

    it('reads the Bun age gate from bunfig.toml', async () => {
      mockGetPkgManager.mockReturnValue('bun')
      const originalXdg = process.env.XDG_CONFIG_HOME
      process.env.XDG_CONFIG_HOME = '/virtual-bun-config'
      const exists = jest
        .spyOn(fs, 'existsSync')
        .mockImplementation(
          (file) =>
            path.normalize(String(file)) ===
            path.normalize('/virtual-bun-config/.bunfig.toml')
        )
      const read = jest
        .spyOn(fs, 'readFileSync')
        .mockReturnValue('[install]\nminimumReleaseAge = 172800\n' as never)
      mockSync.mockImplementation((_command, args) => {
        if (args[0] === '-e') {
          return {
            stdout: JSON.stringify([
              { install: { minimumReleaseAge: 172800 } },
            ]),
          } as never
        }
        if (args[0] === 'view') {
          return {
            stdout: viewOutput({ '19.2.1': 72, '19.2.2': 1 }),
          } as never
        }
        return { stdout: 'Options: --minimum-release-age=<seconds>' } as never
      })
      const spawnSync = jest.spyOn(crossSpawn, 'sync').mockImplementation(
        (command, args) =>
          ({
            status: 0,
            stdout: mockSync(command, args).stdout,
            stderr: '',
          }) as never
      )
      try {
        await expect(ageEligibleVersions('react', '^19.0.0')).resolves.toEqual([
          '19.2.1',
        ])
      } finally {
        spawnSync.mockRestore()
        exists.mockRestore()
        read.mockRestore()
        if (originalXdg === undefined) {
          delete process.env.XDG_CONFIG_HOME
        } else {
          process.env.XDG_CONFIG_HOME = originalXdg
        }
      }
    })

    it('uses workspace Bun scope credentials for release times', async () => {
      mockGetPkgManager.mockReturnValue('bun')
      const originalXdg = process.env.XDG_CONFIG_HOME
      const originalToken = process.env.BUN_TEST_TOKEN
      const originalRegistry = process.env.npm_config_registry
      process.env.XDG_CONFIG_HOME = '/virtual-bun-config'
      process.env.BUN_TEST_TOKEN = 'test-token'
      process.env.npm_config_registry = 'https://environment.example/'
      const exists = jest
        .spyOn(fs, 'existsSync')
        .mockImplementation(
          (file) =>
            String(file) ===
            path.join(path.dirname(process.cwd()), 'bunfig.toml')
        )
      const read = jest.spyOn(fs, 'readFileSync').mockReturnValue('' as never)
      mockSync.mockImplementation((_command, args) => {
        if (args[0] === '-e') {
          return {
            stdout: JSON.stringify([
              {
                install: {
                  minimumReleaseAge: 172800,
                  scopes: {
                    '@next': {
                      url: 'https://mirror.example/',
                      token: '$BUN_TEST_TOKEN',
                    },
                  },
                },
              },
            ]),
          } as never
        }
        return { stdout: 'Options: --minimum-release-age=<seconds>' } as never
      })
      global.fetch = jest.fn(async () =>
        Response.json(packument({ '16.0.1': 72, '16.0.2': 1 }))
      )
      try {
        await expect(
          ageEligibleVersions('@next/codemod', '^16.0.0')
        ).resolves.toEqual(['16.0.1'])
        expect(global.fetch).toHaveBeenCalledWith(
          'https://mirror.example/@next%2Fcodemod',
          expect.objectContaining({
            headers: { Authorization: 'Bearer test-token' },
          })
        )
        jest
          .mocked(global.fetch)
          .mockResolvedValueOnce(Response.json({ version: '16.0.1' }))
        await expect(packageInfo('@next/codemod', '16.0.1')).resolves.toEqual({
          version: '16.0.1',
        })
        expect(global.fetch).toHaveBeenCalledWith(
          'https://mirror.example/@next%2Fcodemod/16.0.1',
          expect.objectContaining({
            headers: { Authorization: 'Bearer test-token' },
          })
        )
      } finally {
        exists.mockRestore()
        read.mockRestore()
        if (originalXdg === undefined) {
          delete process.env.XDG_CONFIG_HOME
        } else {
          process.env.XDG_CONFIG_HOME = originalXdg
        }
        if (originalToken === undefined) {
          delete process.env.BUN_TEST_TOKEN
        } else {
          process.env.BUN_TEST_TOKEN = originalToken
        }
        if (originalRegistry === undefined) {
          delete process.env.npm_config_registry
        } else {
          process.env.npm_config_registry = originalRegistry
        }
      }
    })
  })
})
