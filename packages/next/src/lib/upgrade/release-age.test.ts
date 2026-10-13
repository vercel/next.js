import spawn from 'next/dist/compiled/cross-spawn'
import { getNpxCommand } from '../helpers/get-npx-command'
import { getPkgManager } from '../helpers/get-pkg-manager'
import {
  getReleaseAgeChecks,
  isReleaseAllowed,
  isReleaseInstallable,
  readGate,
  type ReleaseAgeGate,
} from './release-age'

jest.mock('next/dist/compiled/cross-spawn', () => ({
  __esModule: true,
  default: { sync: jest.fn() },
}))
jest.mock('../helpers/get-pkg-manager', () => ({ getPkgManager: jest.fn() }))
jest.mock('../helpers/get-npx-command', () => ({ getNpxCommand: jest.fn() }))

const now = '2026-10-12T12:00:00Z'
const cutoff = Date.parse('2026-10-10T12:00:00Z')
const old = '2026-10-09T12:00:00Z'
const gate: ReleaseAgeGate = { cutoff, exemptions: [] }

// Answers each `<manager> <args>` probe with native output.
function probes(outputs: Record<string, string>) {
  jest.mocked(spawn.sync).mockImplementation((command, args) => {
    const probe = [command, ...(args ?? [])].join(' ')
    const match = Object.keys(outputs).find((prefix) =>
      probe.startsWith(prefix)
    )
    return match === undefined
      ? ({ status: 1, stdout: '', stderr: '' } as never)
      : ({ status: 0, stdout: outputs[match] } as never)
  })
}

describe('upgrade release age', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.useFakeTimers().setSystemTime(new Date(now))
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  describe('npm', () => {
    it('uses the stricter of before and min-release-age', () => {
      probes({
        'npm --version': '11.10.0',
        'npm config get': [
          'before=2026-10-11T00:00:00.000Z',
          'min-release-age=2',
          'min-release-age-exclude=',
        ].join('\n'),
      })
      expect(
        readGate({ directory: '/app', manager: 'npm', operation: 'install' })
      ).toEqual(gate)
    })

    it('ignores min-release-age on npm releases that do not support it', () => {
      probes({
        'npm --version': '11.9.0',
        'npm config get before --no-workspaces': 'before=null',
      })
      expect(
        readGate({ directory: '/app', manager: 'npm', operation: 'install' })
      ).toBeNull()
      // Only `before` is queried, so a configured age cannot be read back.
      expect(jest.mocked(spawn.sync).mock.calls[1][1]).toEqual([
        'config',
        'get',
        'before',
        '--no-workspaces',
      ])
    })

    it('matches exemptions by name and drops them for exec', () => {
      probes({
        'npm --version': '11.10.0',
        'npm config get': [
          'before=null',
          'min-release-age=2',
          'min-release-age-exclude=next,@next/codemod@16.4.0,@next/*',
        ].join('\n'),
      })
      // `@next/codemod@16.4.0` is a name npm never matches, and a glob is not
      // honored, so only the plain name exempts a package.
      expect(
        readGate({ directory: '/app', manager: 'npm', operation: 'install' })
      ).toEqual({ cutoff, exemptions: [{ name: 'next', versions: null }] })
      expect(
        readGate({ directory: '/app', manager: 'npm', operation: 'exec' })
      ).toEqual(gate)
    })
  })

  describe('pnpm', () => {
    it('has no gate before minimumReleaseAge support', () => {
      probes({ 'pnpm --version': '10.15.0' })
      expect(
        readGate({ directory: '/app', manager: 'pnpm', operation: 'install' })
      ).toBeNull()
      expect(spawn.sync).toHaveBeenCalledTimes(1)
    })

    it('applies the pnpm 11 default when nothing is configured', () => {
      probes({ 'pnpm --version': '11.0.0', 'pnpm config get': '' })
      expect(
        readGate({ directory: '/app', manager: 'pnpm', operation: 'install' })
      ).toEqual({ cutoff: Date.parse(now) - 1440 * 60_000, exemptions: [] })
    })

    it('treats a zero age as no gate', () => {
      probes({
        'pnpm --version': '12.9.1',
        'pnpm config get minimumReleaseAge': '0',
      })
      expect(
        readGate({ directory: '/app', manager: 'pnpm', operation: 'install' })
      ).toBeNull()
    })

    it('honors version exemptions and leaves patterns gated', () => {
      probes({
        'pnpm --version': '12.9.1',
        'pnpm config get minimumReleaseAge --json': '2880',
        'pnpm config get minimumReleaseAgeExclude': JSON.stringify([
          'next@16.5.0-canary.8 || 16.4.0',
          '@next/*',
          '!next',
        ]),
      })
      expect(
        readGate({ directory: '/app', manager: 'pnpm', operation: 'install' })
      ).toEqual({
        cutoff,
        exemptions: [{ name: 'next', versions: ['16.5.0-canary.8', '16.4.0'] }],
      })
    })
  })

  describe('yarn', () => {
    it('has no gate on Yarn Classic', () => {
      probes({ 'yarn --version': '1.22.19' })
      expect(
        readGate({ directory: '/app', manager: 'yarn', operation: 'install' })
      ).toBeNull()
      expect(spawn.sync).toHaveBeenCalledTimes(1)
    })

    it('uses the stricter of the default and the next scope gate', () => {
      probes({
        'yarn --version': '4.18.1',
        'yarn config --json': [
          '{"key":"npmMinimalAgeGate","effective":1440}',
          '{"key":"npmScopes","effective":{"next":{"npmMinimalAgeGate":2880}}}',
          '{"key":"npmPreapprovedPackages","effective":["next@npm:^16.0.0","next@16.4.0"]}',
        ].join('\n'),
      })
      expect(
        readGate({ directory: '/app', manager: 'yarn', operation: 'install' })
      ).toEqual({
        cutoff,
        // A descriptor or a range is not widened into an exemption.
        exemptions: [{ name: 'next', versions: ['16.4.0'] }],
      })
    })
  })

  it('reports no gate when a manager cannot be read, without its output', () => {
    jest.mocked(spawn.sync).mockReturnValue({
      status: 1,
      stdout: 'credential value',
      stderr: 'credential value',
    } as never)
    expect(() =>
      readGate({ directory: '/app', manager: 'npm', operation: 'install' })
    ).toThrow('Could not read npm release-age configuration.')
    jest.mocked(getPkgManager).mockReturnValue('npm')
    jest.mocked(getNpxCommand).mockReturnValue('npx --yes')
    // An unreadable policy must not fail the upgrade.
    expect(getReleaseAgeChecks('/app')).toMatchObject({
      install: { gates: [] },
      runner: { gates: [] },
    })
  })

  it('reads the install and runner gates from their own managers', () => {
    jest.mocked(getPkgManager).mockReturnValue('pnpm')
    jest.mocked(getNpxCommand).mockReturnValue('npx --yes')
    probes({
      'pnpm --version': '12.9.1',
      'pnpm config get minimumReleaseAge --json': '2880',
      'pnpm config get minimumReleaseAgeExclude': '["next"]',
      'npm --version': '11.10.0',
      'npm config get': [
        'before=null',
        'min-release-age=2',
        'min-release-age-exclude=next',
      ].join('\n'),
    })
    const checks = getReleaseAgeChecks('/app')
    expect(checks).toMatchObject({
      install: {
        gates: [{ cutoff, exemptions: [{ name: 'next', versions: null }] }],
      },
      // npm exec resolves its first manifest without install's exemptions.
      runner: { gates: [gate] },
    })
    // Registry metadata is shared by both steps of the upgrade.
    expect(checks.install.packuments).toBe(checks.runner.packuments)
  })

  describe('isReleaseAllowed', () => {
    it.each([
      ['an unknown publish date', [gate], undefined, false],
      ['a release published before the cutoff', [gate], old, true],
      ['a release published after the cutoff', [gate], now, false],
      ['no gate at all', [], now, true],
      [
        'a fresh release every gate exempts',
        [
          { cutoff, exemptions: [{ name: 'next', versions: null }] },
          { cutoff, exemptions: [{ name: 'next', versions: ['16.4.0'] }] },
        ],
        now,
        true,
      ],
      [
        'a fresh release only one gate exempts',
        [{ cutoff, exemptions: [{ name: 'next', versions: null }] }, gate],
        now,
        false,
      ],
      [
        'a fresh release exempted at another version',
        [{ cutoff, exemptions: [{ name: 'next', versions: ['16.3.0'] }] }],
        now,
        false,
      ],
      [
        'a fresh release exempted under another name',
        [{ cutoff, exemptions: [{ name: '@next/codemod', versions: null }] }],
        now,
        false,
      ],
    ])('allows %s', (_label, gates, publishedAt, expected) => {
      expect(
        isReleaseAllowed({
          check: { gates: gates as ReleaseAgeGate[] },
          packageName: 'next',
          version: '16.4.0',
          publishedAt: publishedAt as string | undefined,
        })
      ).toBe(expected)
    })
  })

  describe('isReleaseInstallable', () => {
    const originalFetch = global.fetch
    const packument = {
      'dist-tags': { latest: '16.4.0' },
      versions: {
        '16.3.0': { version: '16.3.0' },
        '16.4.0': { version: '16.4.0' },
      },
      time: { '16.3.0': old, '16.4.0': now },
    }

    beforeEach(() => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: true, json: async () => packument }) as never
    })
    afterEach(() => {
      global.fetch = originalFetch
    })

    it('resolves publish dates once for every gated lookup', async () => {
      const check = { gates: [gate], packuments: new Map() }
      const lookup = (version: string) =>
        isReleaseInstallable({ check, packageName: 'next', version })
      await expect(lookup('16.3.0')).resolves.toBe(true)
      await expect(lookup('16.4.0')).resolves.toBe(false)
      // An unpublished version cannot be verified against the gate.
      await expect(lookup('16.5.0')).resolves.toBe(false)
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('skips the registry when no gate applies', async () => {
      await expect(
        isReleaseInstallable({
          check: { gates: [] },
          packageName: 'next',
          version: '16.4.0',
        })
      ).resolves.toBe(true)
      expect(fetch).not.toHaveBeenCalled()
    })
  })
})
