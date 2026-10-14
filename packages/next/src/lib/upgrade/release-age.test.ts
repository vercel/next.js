import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import spawn from 'next/dist/compiled/cross-spawn'
import { getNpxCommand } from '../helpers/get-npx-command'
import { getPkgManager, type PackageManager } from '../helpers/get-pkg-manager'
import {
  getReleaseAgeChecks,
  isReleaseAllowed,
  isReleaseInstallable,
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

const directories: string[] = []

// Creates an app directory, plus any files relative to it such as an
// enclosing workspace's lockfile at `../../pnpm-workspace.yaml`.
function app(files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'release-age-'))
  directories.push(root)
  const directory = join(root, 'apps', 'web')
  mkdirSync(directory, { recursive: true })
  for (const [file, contents] of Object.entries(files)) {
    writeFileSync(join(directory, file), contents)
  }
  return directory
}

// The gate the app's own package manager applies when it installs. The runner
// is read separately, so leaving it unreadable keeps these probes to one side.
function installGate(
  manager: PackageManager,
  outputs: Record<string, string>,
  directory = app()
): ReleaseAgeGate | null {
  jest.mocked(getPkgManager).mockReturnValue(manager)
  jest.mocked(getNpxCommand).mockImplementation(() => {
    throw new Error('not under test')
  })
  probes(outputs)
  return getReleaseAgeChecks(directory).install.gates[0] ?? null
}

describe('upgrade release age', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.useFakeTimers().setSystemTime(new Date(now))
  })
  afterEach(() => {
    jest.useRealTimers()
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  describe('install manager', () => {
    const pnpm = {
      'pnpm --version': '12.9.1',
      'pnpm config get minimumReleaseAge --json': '2880',
      'pnpm config get minimumReleaseAgeExclude': '',
    }

    it('reads the app manager when another manager launched the CLI', () => {
      // `npx next@canary upgrade` reports npm, but the agent installs with pnpm.
      expect(installGate('npm', pnpm, app({ 'pnpm-lock.yaml': '' }))).toEqual(
        gate
      )
    })

    it('prefers the declared manager over a lockfile', () => {
      expect(
        installGate(
          'npm',
          pnpm,
          app({
            'package.json': JSON.stringify({ packageManager: 'pnpm@12.9.1' }),
            'package-lock.json': '',
          })
        )
      ).toEqual(gate)
    })

    it('probes from the workspace root', () => {
      const directory = app({ 'package.json': '{}' })
      const root = dirname(dirname(directory))
      writeFileSync(join(root, 'pnpm-workspace.yaml'), '')
      expect(installGate('npm', pnpm, directory)).toEqual(gate)
      expect(
        jest.mocked(spawn.sync).mock.calls.map(([, , options]) => options?.cwd)
      ).toEqual([root, root, root])
    })

    it('has no gate for Bun', () => {
      expect(installGate('npm', {}, app({ 'bun.lock': '' }))).toBeNull()
      expect(spawn.sync).not.toHaveBeenCalled()
    })
  })

  describe('npm', () => {
    it('uses the stricter of before and min-release-age', () => {
      expect(
        installGate('npm', {
          'npm --version': '11.10.0',
          'npm config get': [
            'before=2026-10-11T00:00:00.000Z',
            'min-release-age=2',
            'min-release-age-exclude=',
          ].join('\n'),
        })
      ).toEqual(gate)
    })

    it('ignores min-release-age on npm releases that do not support it', () => {
      expect(
        installGate('npm', {
          'npm --version': '11.9.0',
          'npm config get before --no-workspaces': 'before=null',
        })
      ).toBeNull()
      // Only `before` is queried, so a configured age cannot be read back.
      expect(jest.mocked(spawn.sync).mock.calls).not.toContainEqual(
        expect.arrayContaining([expect.arrayContaining(['min-release-age'])])
      )
    })

    it('matches exemptions by name', () => {
      // `@next/codemod@16.4.0` is a name npm never matches, and a glob is not
      // honored, so only the plain name exempts a package.
      expect(
        installGate('npm', {
          'npm --version': '11.10.0',
          'npm config get': [
            'before=null',
            'min-release-age=2',
            'min-release-age-exclude=next,@next/codemod@16.4.0,@next/*',
          ].join('\n'),
        })
      ).toEqual({ cutoff, exemptions: [{ name: 'next', versions: null }] })
    })
  })

  describe('pnpm', () => {
    it('has no gate before minimumReleaseAge support', () => {
      expect(installGate('pnpm', { 'pnpm --version': '10.15.0' })).toBeNull()
      expect(spawn.sync).toHaveBeenCalledTimes(1)
    })

    it('applies the pnpm 11 default when nothing is configured', () => {
      expect(
        installGate('pnpm', {
          'pnpm --version': '11.0.0',
          'pnpm config get': '',
        })
      ).toEqual({ cutoff: Date.parse(now) - 1440 * 60_000, exemptions: [] })
    })

    it('treats a zero age as no gate', () => {
      expect(
        installGate('pnpm', {
          'pnpm --version': '12.9.1',
          'pnpm config get minimumReleaseAge': '0',
        })
      ).toBeNull()
    })

    it('honors version exemptions and leaves patterns gated', () => {
      expect(
        installGate('pnpm', {
          'pnpm --version': '12.9.1',
          'pnpm config get minimumReleaseAge --json': '2880',
          'pnpm config get minimumReleaseAgeExclude': JSON.stringify([
            'next@16.5.0-canary.8 || 16.4.0',
            '@next/*',
            '!next',
          ]),
        })
      ).toEqual({
        cutoff,
        exemptions: [{ name: 'next', versions: ['16.5.0-canary.8', '16.4.0'] }],
      })
    })
  })

  describe('yarn', () => {
    it('has no gate on Yarn Classic', () => {
      expect(installGate('yarn', { 'yarn --version': '1.22.19' })).toBeNull()
      expect(spawn.sync).toHaveBeenCalledTimes(1)
    })

    it('uses the stricter of the default and the next scope gate', () => {
      expect(
        installGate('yarn', {
          'yarn --version': '4.18.1',
          'yarn config --json': [
            '{"key":"npmMinimalAgeGate","effective":1440}',
            '{"key":"npmScopes","effective":{"next":{"npmMinimalAgeGate":2880}}}',
            '{"key":"npmPreapprovedPackages","effective":["next@npm:^16.0.0","next@16.4.0"]}',
          ].join('\n'),
        })
      ).toEqual({
        cutoff,
        // A descriptor or a range is not widened into an exemption.
        exemptions: [{ name: 'next', versions: ['16.4.0'] }],
      })
    })
  })

  it('reports no gate when a manager cannot be read', () => {
    jest.mocked(getPkgManager).mockReturnValue('npm')
    jest.mocked(getNpxCommand).mockReturnValue('npx --yes')
    probes({})
    // An unreadable policy must not fail the upgrade.
    expect(getReleaseAgeChecks(app())).toMatchObject({
      install: { gates: [] },
      runner: { gates: [] },
    })
  })

  it('probes a manager once when it both installs and runs', () => {
    jest.mocked(getPkgManager).mockReturnValue('npm')
    jest.mocked(getNpxCommand).mockReturnValue('npx --yes')
    probes({
      'npm --version': '11.10.0',
      'npm config get': [
        'before=null',
        'min-release-age=2',
        'min-release-age-exclude=next',
      ].join('\n'),
    })
    expect(getReleaseAgeChecks(app())).toMatchObject({
      install: {
        gates: [{ cutoff, exemptions: [{ name: 'next', versions: null }] }],
      },
      // npm exec resolves its first manifest without install's exemptions.
      runner: { gates: [gate] },
    })
    expect(spawn.sync).toHaveBeenCalledTimes(2)
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
    const checks = getReleaseAgeChecks(app())
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

  it('resolves publish dates once for every gated lookup', async () => {
    const originalFetch = global.fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        'dist-tags': { latest: '16.4.0' },
        versions: {
          '16.3.0': { version: '16.3.0' },
          '16.4.0': { version: '16.4.0' },
        },
        time: { '16.3.0': old, '16.4.0': now },
      }),
    }) as never
    try {
      const check = { gates: [gate], packuments: new Map() }
      const lookup = (version: string) =>
        isReleaseInstallable({ check, packageName: 'next', version })
      await expect(lookup('16.3.0')).resolves.toBe(true)
      await expect(lookup('16.4.0')).resolves.toBe(false)
      // An unpublished version cannot be verified against the gate.
      await expect(lookup('16.5.0')).resolves.toBe(false)
      expect(fetch).toHaveBeenCalledTimes(1)
    } finally {
      global.fetch = originalFetch
    }
  })
})
