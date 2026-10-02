import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import spawn from 'next/dist/compiled/cross-spawn'
import { findRootDirAndLockFiles } from 'next/dist/lib/find-root'
import { getPkgManager } from 'next/dist/lib/helpers/get-pkg-manager'
import { getReleaseAgePolicy } from 'next/dist/lib/helpers/get-release-age-policy'

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}))
jest.mock('os', () => ({
  ...jest.requireActual('os'),
  homedir: () => '/home/user',
}))
jest.mock('next/dist/compiled/cross-spawn', () => ({ sync: jest.fn() }))
jest.mock('next/dist/lib/find-root', () => ({
  findRootDirAndLockFiles: jest.fn(),
}))
jest.mock('next/dist/lib/helpers/get-pkg-manager', () => ({
  getPkgManager: jest.fn(),
}))

const directory = '/workspace/app'
const originalUserAgent = process.env.npm_config_user_agent
const originalXdgConfigHome = process.env.XDG_CONFIG_HOME

function mockConfig(
  manager: 'npm' | 'pnpm' | 'yarn',
  version: string,
  settings: Record<string, unknown>
) {
  jest.mocked(getPkgManager).mockReturnValue(manager)
  jest.mocked(spawn.sync).mockImplementation((_command, args) => {
    return {
      status: 0,
      stdout:
        args?.[0] === '--version'
          ? version
          : manager === 'npm'
            ? String(settings[args![2]] ?? null)
            : JSON.stringify(settings[args![2]] ?? null),
    } as never
  })
}

beforeEach(() => {
  jest.resetAllMocks()
  delete process.env.npm_config_user_agent
  delete process.env.XDG_CONFIG_HOME
  jest.mocked(existsSync).mockReturnValue(false)
  jest.mocked(findRootDirAndLockFiles).mockReturnValue({
    rootDir: directory,
    lockFiles: [],
  })
})

afterAll(() => {
  for (const [key, value] of [
    ['npm_config_user_agent', originalUserAgent],
    ['XDG_CONFIG_HOME', originalXdgConfigHome],
  ]) {
    if (value === undefined) {
      delete process.env[key!]
    } else {
      process.env[key!] = value
    }
  }
})

describe('pnpm', () => {
  it('reads the effective age and exemptions from the app directory', () => {
    mockConfig('pnpm', '10.33.0', {
      minimumReleaseAge: 1440,
      minimumReleaseAgeExclude: ['next@16.4.0-canary.2 || 16.4.0-canary.3'],
    })
    const policy = getReleaseAgePolicy(directory)
    expect(policy.minimumReleaseAge).toBe(86_400_000)
    expect(policy.isExcluded('16.4.0-canary.2')).toBe(true)
    expect(policy.isExcluded('16.4.0-canary.3')).toBe(true)
    expect(policy.isExcluded('16.4.0-canary.4')).toBe(false)
    expect(spawn.sync).toHaveBeenCalledWith(
      'pnpm',
      ['config', 'get', 'minimumReleaseAge', '--json'],
      expect.objectContaining({ cwd: directory, timeout: 10_000 })
    )
  })

  it.each(['next', 'n*'])('recognizes package exemption %s', (pattern) => {
    mockConfig('pnpm', '10.33.0', {
      minimumReleaseAge: 10,
      minimumReleaseAgeExclude: [pattern],
    })
    expect(getReleaseAgePolicy(directory).isExcluded('16.4.0-canary.2')).toBe(
      true
    )
  })

  it.each(['9.15.0', '10.15.1'])(
    'ignores unenforced settings on %s',
    (version) => {
      mockConfig('pnpm', version, { minimumReleaseAge: 1440 })
      expect(getReleaseAgePolicy(directory).minimumReleaseAge).toBe(0)
      expect(spawn.sync).toHaveBeenCalledTimes(1)
    }
  )

  it.each([
    ['10.16.0', 'n*'],
    ['10.18.0', 'next@16.4.0-canary.2'],
  ])('does not apply unsupported exemptions on %s', (version, pattern) => {
    mockConfig('pnpm', version, {
      minimumReleaseAge: 10,
      minimumReleaseAgeExclude: [pattern],
    })
    expect(getReleaseAgePolicy(directory).isExcluded('16.4.0-canary.2')).toBe(
      false
    )
  })

  it.each([null, 0])(
    'handles disabled age %s without reading exemptions',
    (age) => {
      mockConfig('pnpm', '10.33.0', { minimumReleaseAge: age })
      expect(getReleaseAgePolicy(directory).minimumReleaseAge).toBe(0)
      expect(spawn.sync).toHaveBeenCalledTimes(2)
    }
  )

  it.each([-1, '1440', {}, 1e308])('rejects malformed age %s', (age) => {
    mockConfig('pnpm', '10.33.0', { minimumReleaseAge: age })
    expect(() => getReleaseAgePolicy(directory)).toThrow(
      'Invalid pnpm minimum release age'
    )
  })

  it.each(['next', [1]])('rejects malformed exemptions %s', (exclusions) => {
    mockConfig('pnpm', '10.33.0', {
      minimumReleaseAge: 10,
      minimumReleaseAgeExclude: exclusions,
    })
    expect(() => getReleaseAgePolicy(directory)).toThrow(
      'Invalid pnpm release-age exclusions'
    )
  })

  it('preserves subprocess errors', () => {
    jest.mocked(getPkgManager).mockReturnValue('pnpm')
    const error = new Error('timeout')
    jest.mocked(spawn.sync).mockReturnValue({ error } as never)
    expect(() => getReleaseAgePolicy(directory)).toThrow(error)
  })

  it('rejects a failed config command', () => {
    mockConfig('pnpm', '10.33.0', {})
    jest.mocked(spawn.sync).mockReturnValueOnce({ status: 2 } as never)
    expect(() => getReleaseAgePolicy(directory)).toThrow('exit 2')
  })
})

describe('npm', () => {
  it.each(['9.8.1', '11.10.0'])(
    'reads the effective before date without version gating on %s',
    (version) => {
      const cutoff = Date.UTC(2026, 8, 30)
      const clock = jest
        .spyOn(Date, 'now')
        .mockReturnValue(cutoff + 172_800_000)
      mockConfig('npm', version, {
        before: new Date(cutoff).toString(),
        'min-release-age': null,
        'min-release-age-exclude': ['next'],
      })

      try {
        const policy = getReleaseAgePolicy(directory)
        expect(policy.minimumReleaseAge).toBe(172_800_000)
        expect(policy.publishedBefore).toBe(cutoff)
        expect(policy.isExcluded('16.4.0-canary.2')).toBe(false)
        expect(spawn.sync).toHaveBeenCalledTimes(1)
        expect(spawn.sync).toHaveBeenCalledWith(
          'npm',
          ['config', 'get', 'before', '--no-workspaces'],
          expect.objectContaining({ cwd: directory })
        )
      } finally {
        clock.mockRestore()
      }
    }
  )

  it.each([null, 'undefined'])('handles an unset before date %s', (before) => {
    mockConfig('npm', '11.10.0', { before })
    const policy = getReleaseAgePolicy(directory)
    expect(policy.minimumReleaseAge).toBe(0)
    expect(policy.publishedBefore).toBe(null)
  })

  it.each(['invalid', ''])('rejects an invalid before date %s', (before) => {
    mockConfig('npm', '11.10.0', { before })
    expect(() => getReleaseAgePolicy(directory)).toThrow(
      'Invalid npm minimum release age'
    )
  })

  it('allows current releases when before is in the future', () => {
    mockConfig('npm', '11.10.0', {
      before: new Date(Date.now() + 86_400_000).toString(),
    })
    expect(getReleaseAgePolicy(directory).minimumReleaseAge).toBe(0)
  })
})

describe('Yarn', () => {
  it('converts the effective age from minutes', () => {
    mockConfig('yarn', '4.10.3', { npmMinimalAgeGate: 60 })
    expect(getReleaseAgePolicy(directory).minimumReleaseAge).toBe(3_600_000)
  })

  it.each(['1.22.19', '4.9.4'])(
    'ignores unsupported age gates on %s',
    (version) => {
      mockConfig('yarn', version, { npmMinimalAgeGate: 60 })
      expect(getReleaseAgePolicy(directory).minimumReleaseAge).toBe(0)
      expect(spawn.sync).toHaveBeenCalledTimes(1)
    }
  )

  it.each(['next@^16.4.0-canary.1', 'n*@^16.4.0-canary.1'])(
    'matches semver descriptor %s',
    (pattern) => {
      mockConfig('yarn', '4.10.3', {
        npmMinimalAgeGate: 60,
        npmPreapprovedPackages: [pattern],
      })
      const policy = getReleaseAgePolicy(directory)
      expect(policy.isExcluded('16.4.0-canary.2')).toBe(true)
      expect(policy.isExcluded('17.0.0-canary.2')).toBe(false)
    }
  )

  it('does not approve protocol-prefixed ranges that Yarn rejects', () => {
    mockConfig('yarn', '4.10.3', {
      npmMinimalAgeGate: 60,
      npmPreapprovedPackages: ['next@npm:^16.4.0-canary.1'],
    })
    expect(getReleaseAgePolicy(directory).isExcluded('16.4.0-canary.2')).toBe(
      false
    )
  })
})

describe('Bun', () => {
  function mockBunConfig(age: unknown, excludes: unknown) {
    process.env.npm_config_user_agent = 'bun/1.4.0'
    jest.mocked(existsSync).mockReturnValue(true)
    jest
      .mocked(readFileSync)
      .mockReturnValue('[install]\nminimumReleaseAge = 60')
    jest.mocked(spawn.sync).mockImplementation(
      (_command, args) =>
        ({
          status: 0,
          stdout:
            args?.[0] === 'install'
              ? '--minimum-release-age=<val>'
              : JSON.stringify({ age, excludes }),
        }) as never
    )
  }

  it('converts seconds and sends global then project config to Bun', () => {
    mockBunConfig(60, [])
    const policy = getReleaseAgePolicy(directory)
    expect(policy.minimumReleaseAge).toBe(60_000)
    expect(readFileSync).toHaveBeenNthCalledWith(
      1,
      join('/home/user', '.bunfig.toml'),
      'utf8'
    )
    expect(readFileSync).toHaveBeenNthCalledWith(
      2,
      join(directory, 'bunfig.toml'),
      'utf8'
    )
    expect(spawn.sync).toHaveBeenCalledWith(
      'bun',
      ['-e', expect.any(String)],
      expect.objectContaining({
        cwd: directory,
        input: JSON.stringify(
          Array(2).fill('[install]\nminimumReleaseAge = 60')
        ),
      })
    )
  })

  it('recognizes Bun lockfiles without a user agent', () => {
    mockBunConfig(60, [])
    delete process.env.npm_config_user_agent
    expect(getReleaseAgePolicy(directory).minimumReleaseAge).toBe(60_000)
    expect(getPkgManager).toHaveBeenCalledTimes(0)
  })

  it.each(['bun/1.4.0', undefined])(
    'reads workspace-root config from a child app with user agent %s',
    (userAgent) => {
      mockBunConfig(259200, [])
      if (userAgent === undefined) {
        delete process.env.npm_config_user_agent
      }
      jest.mocked(findRootDirAndLockFiles).mockReturnValue({
        rootDir: '/workspace',
        lockFiles: [],
      })
      jest.mocked(existsSync).mockImplementation((file) => {
        return [
          join('/workspace', 'bun.lock'),
          join('/workspace', 'bunfig.toml'),
        ].includes(String(file))
      })

      expect(getReleaseAgePolicy(directory).minimumReleaseAge).toBe(259_200_000)
      expect(findRootDirAndLockFiles).toHaveBeenCalledWith(directory)
      expect(readFileSync).toHaveBeenCalledTimes(1)
      expect(readFileSync).toHaveBeenCalledWith(
        join('/workspace', 'bunfig.toml'),
        'utf8'
      )
      expect(getPkgManager).toHaveBeenCalledTimes(0)
    }
  )

  it('uses the configured global directory', () => {
    mockBunConfig(60, [])
    process.env.XDG_CONFIG_HOME = '/config'
    getReleaseAgePolicy(directory)
    expect(readFileSync).toHaveBeenNthCalledWith(
      1,
      join('/config', '.bunfig.toml'),
      'utf8'
    )
  })

  it('only exempts named packages', () => {
    mockBunConfig(60, ['n*'])
    expect(getReleaseAgePolicy(directory).isExcluded('16.4.0-canary.2')).toBe(
      false
    )
    mockBunConfig(60, ['next'])
    expect(getReleaseAgePolicy(directory).isExcluded('16.4.0-canary.2')).toBe(
      true
    )
  })

  it('returns zero when no config exists', () => {
    mockBunConfig(60, [])
    jest.mocked(existsSync).mockReturnValue(false)
    expect(getReleaseAgePolicy(directory).minimumReleaseAge).toBe(0)
    expect(spawn.sync).toHaveBeenCalledTimes(1)
  })

  it('ignores the setting when Bun does not support it', () => {
    mockBunConfig(60, [])
    jest
      .mocked(spawn.sync)
      .mockReturnValue({ status: 0, stdout: '--help' } as never)
    expect(getReleaseAgePolicy(directory).minimumReleaseAge).toBe(0)
    expect(readFileSync).toHaveBeenCalledTimes(0)
  })
})
