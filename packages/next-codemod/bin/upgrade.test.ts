import fs from 'fs'
import execa from 'execa'
import { getPkgManager } from '../lib/handle-package'
import { ageEligibleVersions } from './upgrade'

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
    it('selects a React version eligible for React DOM too', async () => {
      mockGetPkgManager.mockReturnValue('pnpm')
      mockSync.mockImplementation((command, args) => {
        if (args[0] === '--version') return { stdout: '10.33.0' } as never
        if (args.includes('minimumReleaseAge'))
          return { stdout: '2880' } as never
        if (args.includes('minimumReleaseAgeExclude'))
          return { stdout: '[]' } as never
        return { stdout: '"https://mirror.example/"' } as never
      })
      global.fetch = jest.fn(async (input) =>
        Response.json(
          String(input).includes('react-dom')
            ? packument({ '19.2.1': 72, '19.2.2': 1 })
            : packument({ '19.2.1': 72, '19.2.2': 72 })
        )
      )

      await expect(
        ageEligibleVersions('react', '^19.0.0', ['react-dom'])
      ).resolves.toEqual(['19.2.1'])
      expect(global.fetch).toHaveBeenCalledWith(
        'https://mirror.example/react-dom',
        expect.any(Object)
      )
    })

    it('honors a version-qualified exemption', async () => {
      mockGetPkgManager.mockReturnValue('pnpm')
      mockSync.mockImplementation((command, args) => {
        if (args[0] === '--version') return { stdout: '10.33.0' } as never
        if (args.includes('minimumReleaseAge'))
          return { stdout: '2880' } as never
        if (args.includes('minimumReleaseAgeExclude')) {
          return { stdout: '["next@17.0.0-canary.35"]' } as never
        }
        return { stdout: '"https://registry.npmjs.org/"' } as never
      })
      global.fetch = jest.fn(async () =>
        Response.json(
          packument({ '17.0.0-canary.34': 72, '17.0.0-canary.35': 1 }, 'canary')
        )
      )

      await expect(
        ageEligibleVersions('next', '17.0.0-canary.35')
      ).resolves.toEqual(['17.0.0-canary.35'])
    })
  })

  describe('npm', () => {
    it('reads days and excludes recent releases', async () => {
      mockGetPkgManager.mockReturnValue('npm')
      mockSync.mockImplementation((command, args) => {
        if (args[0] === '--version') return { stdout: '11.10.0' } as never
        if (args.includes('min-release-age')) return { stdout: '2' } as never
        if (args.includes('min-release-age-exclude'))
          return { stdout: '[]' } as never
        return { stdout: '"https://mirror.example/"' } as never
      })
      global.fetch = jest.fn(async () =>
        Response.json(packument({ '19.2.1': 72, '19.2.2': 1 }))
      )

      await expect(ageEligibleVersions('react', '^19.0.0')).resolves.toEqual([
        '19.2.1',
      ])
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
      mockSync.mockImplementation((command, args) => {
        if (args[0] === '--version') return { stdout: '4.10.0' } as never
        if (String(args[2]).includes('npmMinimalAgeGate'))
          return { stdout: '2880' } as never
        if (args.includes('npmPreapprovedPackages'))
          return { stdout: '[]' } as never
        return { stdout: '"https://mirror.example/"' } as never
      })
      global.fetch = jest.fn(async () =>
        Response.json(packument({ '19.2.1': 72, '19.2.2': 1 }))
      )

      await expect(
        ageEligibleVersions('@types/react', '^19.0.0')
      ).resolves.toEqual(['19.2.1'])
    })
  })

  describe('bun', () => {
    it('reads the Bun age gate from bunfig.toml', async () => {
      mockGetPkgManager.mockReturnValue('bun')
      const originalXdg = process.env.XDG_CONFIG_HOME
      process.env.XDG_CONFIG_HOME = '/virtual-bun-config'
      const exists = jest
        .spyOn(fs, 'existsSync')
        .mockImplementation(
          (file) => String(file) === '/virtual-bun-config/.bunfig.toml'
        )
      const read = jest
        .spyOn(fs, 'readFileSync')
        .mockReturnValue('[install]\nminimumReleaseAge = 172800\n' as never)
      mockSync.mockImplementation((command, args) => {
        if (args[0] === '-e') {
          return {
            stdout: JSON.stringify([
              { install: { minimumReleaseAge: 172800 } },
            ]),
          } as never
        }
        return { stdout: 'Options: --minimum-release-age=<seconds>' } as never
      })
      global.fetch = jest.fn(async () =>
        Response.json(packument({ '19.2.1': 72, '19.2.2': 1 }))
      )
      try {
        await expect(ageEligibleVersions('react', '^19.0.0')).resolves.toEqual([
          '19.2.1',
        ])
      } finally {
        exists.mockRestore()
        read.mockRestore()
        if (originalXdg === undefined) {
          delete process.env.XDG_CONFIG_HOME
        } else {
          process.env.XDG_CONFIG_HOME = originalXdg
        }
      }
    })
  })
})
