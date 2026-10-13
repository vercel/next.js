import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import spawn from 'next/dist/compiled/cross-spawn'
import {
  parseNpmReleaseAge,
  readReleaseAgePolicy,
  getInstallerReleaseAge,
  isReleaseAllowed,
  isUpgradeReleaseAllowed,
  type ReleaseAgePolicy,
} from './release-age'

jest.mock('next/dist/compiled/cross-spawn', () => ({
  __esModule: true,
  default: { sync: jest.fn() },
}))

const before = Date.parse('2026-10-10T12:00:00Z')
const old = '2026-10-09T12:00:00Z'
const fresh = '2026-10-12T12:00:00Z'
const policy: ReleaseAgePolicy = { manager: 'pnpm', before, exclude: [] }

describe('upgrade release age', () => {
  const directories: string[] = []
  const originalUserAgent = process.env.npm_config_user_agent

  beforeEach(() => {
    jest.resetAllMocks()
    jest.useFakeTimers().setSystemTime(new Date(fresh))
  })
  afterEach(async () => {
    jest.useRealTimers()
    if (originalUserAgent === undefined) {
      delete process.env.npm_config_user_agent
    } else {
      process.env.npm_config_user_agent = originalUserAgent
    }
    await Promise.all(
      directories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true }))
    )
  })

  it('preserves npm source precedence and ignores publishConfig', () => {
    const output = `; "default" config from default values
before = null
; min-release-age = null ; overridden by project
; min-release-age-exclude = [] ; overridden by project
; "user" config from /user/.npmrc
before = "2026-10-01T00:00:00.000Z"
; "project" config from /app/.npmrc
min-release-age = 2
min-release-age-exclude = ["next", "@next/*"]
; "publishConfig" from /app/package.json
before = null
min-release-age = 0
min-release-age-exclude = ["*"]
`
    expect(
      parseNpmReleaseAge({
        output,
        operation: 'install',
      })
    ).toEqual({
      manager: 'npm',
      before,
      exclude: ['next', '@next/*'],
    })
    expect(
      parseNpmReleaseAge({
        output,
        operation: 'exec',
      })
    ).toEqual({
      manager: 'npm',
      before,
      exclude: [],
    })
  })

  it('uses npm 11 synthesized before without honoring unknown exemptions', () => {
    const output = `; "default" config from default values
; before = null ; overridden by project
; min-release-age = null ; overridden by project
; "project" config from /app/.npmrc
before = "2026-10-10T12:00:00.000Z"
min-release-age = 2
min-release-age-exclude = ["*"]
`
    expect(
      parseNpmReleaseAge({
        output,
        operation: 'install',
      })
    ).toEqual({
      manager: 'npm',
      before,
      exclude: [],
    })
  })

  it.each([
    [
      'before = "2026-10-01T00:00:00Z"\nmin-release-age = 2',
      Date.parse('2026-10-01T00:00:00Z'),
    ],
    ['min-release-age = 0', null],
    ['before = null\nmin-release-age = 2', null],
  ])('uses native same-source/reset semantics: %s', (values, cutoff) => {
    const output =
      '; "default" config from default values\nbefore = null\nmin-release-age = null\n; "project" config from /app/.npmrc\n' +
      values
    expect(
      parseNpmReleaseAge({
        output,
        operation: 'install',
      }).before
    ).toBe(cutoff)
  })

  it('rejects native config command failures without exposing its output', () => {
    jest.mocked(spawn.sync).mockReturnValue({
      status: 1,
      stdout: 'credential value',
      stderr: 'credential value',
    } as never)
    expect(() =>
      readReleaseAgePolicy({
        directory: '/app',
        manager: 'npm',
        operation: 'install',
        packageName: 'next',
      })
    ).toThrow('Could not read npm release-age configuration.')
  })

  it('handles pnpm with no configured release-age keys', () => {
    jest.mocked(spawn.sync).mockImplementation((_command, args) => {
      return {
        status: 0,
        stdout: args?.includes('--version') ? '10.33.0' : '',
      } as never
    })
    expect(
      readReleaseAgePolicy({
        directory: '/app',
        manager: 'pnpm',
        operation: 'install',
        packageName: 'next',
      })
    ).toEqual({
      manager: 'pnpm',
      before: null,
      exclude: [],
    })
  })

  it('ignores unsupported release-age keys on older pnpm', () => {
    jest.mocked(spawn.sync).mockImplementation((_command, args) => {
      return {
        status: 0,
        stdout: args?.includes('--version') ? '10.15.0' : '"2880"',
      } as never
    })
    expect(
      readReleaseAgePolicy({
        directory: '/app',
        manager: 'pnpm',
        operation: 'exec',
        packageName: 'next',
      })
    ).toEqual({
      manager: 'pnpm',
      before: null,
      exclude: [],
    })
    expect(spawn.sync).toHaveBeenCalledTimes(1)
  })

  it('reads Yarn Modern native numeric duration and descriptors', () => {
    jest
      .mocked(spawn.sync)
      .mockReturnValueOnce({ status: 0, stdout: '4.18.1' } as never)
      .mockReturnValueOnce({
        status: 0,
        stdout:
          '{"key":"npmMinimalAgeGate","effective":2880}\n{"key":"npmPreapprovedPackages","effective":["next@npm:^16.0.0"]}',
      } as never)
    expect(
      readReleaseAgePolicy({
        directory: '/app',
        manager: 'yarn',
        operation: 'install',
        packageName: 'next',
      })
    ).toEqual({
      manager: 'yarn',
      before,
      exclude: ['next@npm:^16.0.0'],
    })
  })

  it('uses a scoped Yarn age gate for the codemod', () => {
    jest
      .mocked(spawn.sync)
      .mockReturnValueOnce({ status: 0, stdout: '4.18.1' } as never)
      .mockReturnValueOnce({
        status: 0,
        stdout:
          '{"key":"npmMinimalAgeGate","effective":0}\n{"key":"npmScopes","effective":{"next":{"npmMinimalAgeGate":2880}}}',
      } as never)
    expect(
      readReleaseAgePolicy({
        directory: '/app',
        manager: 'yarn',
        operation: 'exec',
        packageName: '@next/codemod',
      }).before
    ).toBe(before)
  })

  it('does not widen native Yarn descriptor exemptions', () => {
    for (const rule of ['next@npm:16.5.0-canary.8', 'next@^16.5.0']) {
      expect(
        isReleaseAllowed({
          packageName: 'next',
          version: '16.5.0-canary.8',
          publishedAt: fresh,
          policy: {
            ...policy,
            manager: 'yarn',
            exclude: [rule],
          },
        })
      ).toBe(false)
    }
    expect(
      isReleaseAllowed({
        packageName: 'next',
        version: '16.5.0-canary.8',
        publishedAt: fresh,
        policy: {
          ...policy,
          manager: 'yarn',
          exclude: ['next@16.5.0-canary.8'],
        },
      })
    ).toBe(true)
  })

  it('keeps Yarn Classic without inventing an age setting', () => {
    jest
      .mocked(spawn.sync)
      .mockReturnValue({ status: 0, stdout: '1.22.19' } as never)
    expect(
      readReleaseAgePolicy({
        directory: '/app',
        manager: 'yarn',
        operation: 'install',
        packageName: 'next',
      }).before
    ).toBeNull()
    expect(spawn.sync).toHaveBeenCalledTimes(1)
  })

  it('uses workspace installer policy separately from npm-launched codemod', async () => {
    const root = await mkdtemp(join(tmpdir(), 'next-age-workspace-'))
    directories.push(root)
    const app = join(root, 'apps/web')
    await mkdir(app, { recursive: true })
    await writeFile(
      join(root, 'package.json'),
      '{"packageManager":"pnpm@10.33.0"}'
    )
    await writeFile(
      join(root, 'pnpm-workspace.yaml'),
      'minimumReleaseAge: 2880'
    )
    await writeFile(join(app, 'package.json'), '{}')
    process.env.npm_config_user_agent = 'npm/12.2.0 node/v24.1.0'
    jest.mocked(spawn.sync).mockImplementation(
      (manager, args) =>
        ({
          status: 0,
          stdout:
            args?.[0] === 'prefix'
              ? root
              : args?.includes('--version')
                ? '10.33.0'
                : manager === 'pnpm'
                  ? args?.includes('minimumReleaseAge')
                    ? '2880'
                    : '[]'
                  : '; "default" config from default values\nbefore = null',
        }) as never
    )
    const result = await getInstallerReleaseAge({
      directory: app,
    })
    expect(result.installer).toEqual(policy)
    expect(result.codemodInstaller).toEqual({
      manager: 'npm',
      before: null,
      exclude: [],
    })
  })

  it('preserves the codemod lockfile order in a pnpm workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'next-age-lockfiles-'))
    directories.push(root)
    await writeFile(join(root, 'package.json'), '{}')
    await writeFile(join(root, 'pnpm-workspace.yaml'), '')
    await writeFile(join(root, 'pnpm-lock.yaml'), '')
    await writeFile(join(root, 'yarn.lock'), '')
    delete process.env.npm_config_user_agent
    jest.mocked(spawn.sync).mockImplementation(
      (manager, args) =>
        ({
          status: 0,
          stdout:
            manager === 'yarn'
              ? '1.22.22'
              : args?.includes('--version')
                ? '10.33.0'
                : args?.includes('minimumReleaseAge')
                  ? '2880'
                  : '[]',
        }) as never
    )
    const result = await getInstallerReleaseAge({
      directory: root,
    })
    expect(result.installer).toEqual(policy)
    expect(result.codemodInstaller).toEqual({
      manager: 'yarn',
      before: null,
      exclude: [],
    })
  })

  it.each([
    [old, true],
    [fresh, false],
    [undefined, false],
    ['invalid', false],
    ['2026-10-10T12:00:00Z', true],
  ])('handles timestamp %s as eligible=%s', (publishedAt, eligible) => {
    expect(
      isReleaseAllowed({
        packageName: 'next',
        version: '16.4.0',
        publishedAt,
        policy,
      })
    ).toBe(eligible)
  })

  it.each([
    ['next', true],
    ['next@16.4.0', true],
    ['next@16.4.0 || 16.3.0', true],
    ['next@16.3.0', false],
    ['@next/*', false],
  ])('applies pnpm exclusion %s', (rule, allowed) => {
    expect(
      isReleaseAllowed({
        packageName: 'next',
        version: '16.4.0',
        publishedAt: fresh,
        policy: { ...policy, exclude: [rule] },
      })
    ).toBe(allowed)
  })

  it.each(['{next,other}', 'n?xt', '+(next)'])(
    'keeps pnpm special pattern %s literal',
    (rule) => {
      expect(
        isReleaseAllowed({
          packageName: 'next',
          version: '16.4.0',
          publishedAt: fresh,
          policy: {
            ...policy,
            exclude: [rule],
          },
        })
      ).toBe(false)
    }
  )

  it('preserves pnpm default delay when no explicit setting is printed', () => {
    jest.mocked(spawn.sync).mockImplementation(
      (_manager, args) =>
        ({
          status: 0,
          stdout: args?.includes('--version') ? '11.0.0' : '',
        }) as never
    )
    expect(
      readReleaseAgePolicy({
        directory: '/app',
        manager: 'pnpm',
        operation: 'install',
        packageName: 'next',
      }).before
    ).toBe(Date.parse(fresh) - 1440 * 60_000)
  })

  it.each(['10.33.0', '11.0.0'])(
    'queries the native pnpm %s runner context',
    (version) => {
      jest.mocked(spawn.sync).mockImplementation(
        (_manager, args) =>
          ({
            status: 0,
            stdout: args?.includes('--version')
              ? version
              : args?.includes('minimumReleaseAge')
                ? '2880'
                : '[]',
          }) as never
      )
      expect(
        readReleaseAgePolicy({
          directory: '/app',
          manager: 'pnpm',
          operation: 'exec',
          packageName: 'next',
        })
      ).toEqual(policy)
      const configCall = jest
        .mocked(spawn.sync)
        .mock.calls.find(([, args]) => args?.includes('minimumReleaseAge'))!
      if (version.startsWith('10')) {
        expect(configCall[1]).toEqual([
          '--dir',
          expect.any(String),
          '--ignore-workspace',
          '--config.manage-package-manager-versions=false',
          '--config.package-manager-strict=false',
          'config',
          'get',
          'minimumReleaseAge',
          '--json',
        ])
        expect(configCall[2]?.cwd).toEqual(
          expect.stringContaining('next-upgrade-policy-')
        )
      } else {
        expect(configCall[1]).toEqual([
          'config',
          'get',
          'minimumReleaseAge',
          '--json',
        ])
        expect(configCall[2]?.cwd).toBe('/app')
      }
    }
  )

  it('honors pnpm first matching rule instead of combining exceptions', () => {
    expect(
      isReleaseAllowed({
        packageName: 'next',
        version: '16.4.0',
        publishedAt: fresh,
        policy: {
          ...policy,
          exclude: ['next@16.3.0', 'next'],
        },
      })
    ).toBe(false)
  })

  it('does not exempt codemod using a Next.js exemption', () => {
    expect(
      isReleaseAllowed({
        packageName: '@next/codemod',
        version: '16.4.0',
        publishedAt: fresh,
        policy: {
          ...policy,
          exclude: ['next'],
        },
      })
    ).toBe(false)
    expect(
      isReleaseAllowed({
        packageName: '@next/codemod',
        version: '16.4.0',
        publishedAt: fresh,
        policy: {
          ...policy,
          exclude: ['@next/*'],
        },
      })
    ).toBe(true)
  })

  it('keeps npm negation and extglobs literal', () => {
    expect(
      isReleaseAllowed({
        packageName: 'next',
        version: '16.4.0',
        publishedAt: fresh,
        policy: {
          manager: 'npm',
          before,
          exclude: ['!other', '+(next)'],
        },
      })
    ).toBe(false)
  })

  it('checks a second installer only when a codemod is needed', () => {
    const policies = {
      installer: { ...policy, before: null },
      codemodInstaller: policy,
    }
    expect(
      isUpgradeReleaseAllowed({
        version: '16.4.0',
        publishedAt: fresh,
        installedVersion: '16.2.0',
        policies,
      })
    ).toBe(true)
    expect(
      isUpgradeReleaseAllowed({
        version: '17.0.0',
        publishedAt: fresh,
        installedVersion: '16.2.0',
        policies,
      })
    ).toBe(false)
  })
})
