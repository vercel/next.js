import { EventEmitter } from 'events'
import { Readable } from 'stream'
import spawn from 'next/dist/compiled/cross-spawn'
import { readReleaseAgePolicy } from 'next/dist/lib/upgrade/release-age'
import { resolveCanaryVersion } from 'next/dist/lib/upgrade/resolve-canary-version'

jest.mock('next/dist/compiled/cross-spawn', () => jest.fn())

const now = Date.parse('2026-10-16T00:00:00Z')
const context = { directory: '/workspace/app', packageManager: 'pnpm' } as const
const young = '16.6.0-canary.13'
const mature = '16.6.0-canary.9'
const oldest = '16.6.0-canary.8'
let replies: string[]
let metadata: {
  'dist-tags': { canary: string }
  versions: string[]
  time: Record<string, string>
}
const originalFetch = global.fetch

beforeEach(() => {
  jest.resetAllMocks()
  jest.spyOn(Date, 'now').mockReturnValue(now)
  global.fetch = jest
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ version: young })))
  replies = ['12.9.1', JSON.stringify({ minimumReleaseAge: 2880 })]
  metadata = {
    'dist-tags': { canary: young },
    // Unsorted, with non-canaries and an old release above the current tag.
    versions: [
      oldest,
      '16.6.0',
      young,
      '16.6.0-canary.14',
      mature,
      '16.5.0',
      '16.6.0-rc.1',
    ],
    time: {
      [oldest]: '2026-10-11T00:00:00Z',
      [mature]: '2026-10-13T00:00:00Z',
      [young]: '2026-10-15T23:00:00Z',
      '16.6.0-canary.14': '2026-10-12T00:00:00Z',
      '16.6.0': '2026-10-12T00:00:00Z',
      '16.5.0': '2026-10-12T00:00:00Z',
      '16.6.0-rc.1': '2026-10-12T00:00:00Z',
    },
  }
  jest.mocked(spawn).mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), {
      stdout: Readable.from([replies.shift() ?? JSON.stringify(metadata)]),
    })
    process.nextTick(() => child.emit('close', 0))
    return child as ReturnType<typeof spawn>
  })
})

afterEach(() => {
  jest.restoreAllMocks()
  global.fetch = originalFetch
})

it.each([
  ['npm', '12.2.0', JSON.stringify({ before: null, 'min-release-age': 2 })],
  ['pnpm', '10.33.0', JSON.stringify({ 'minimum-release-age': '2880' })],
  ['pnpm', '12.9.1', JSON.stringify({ minimumReleaseAge: 2880 })],
  [
    'yarn',
    '4.18.1',
    JSON.stringify({ key: 'npmMinimalAgeGate', effective: 2880 }),
  ],
] as const)(
  'reads %s %s settings and selects the highest eligible canary',
  async (packageManager, version, config) => {
    replies = [version, config]
    await expect(
      resolveCanaryVersion({ ...context, packageManager })
    ).resolves.toBe(mature)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(spawn).toHaveBeenCalledWith(
      packageManager,
      expect.any(Array),
      expect.objectContaining({ cwd: context.directory })
    )
  }
)

it('uses merged npm before in preference to relative age', async () => {
  replies = [
    '12.2.0',
    JSON.stringify({ before: '2026-10-12T00:00:00Z', 'min-release-age': 1 }),
  ]
  await expect(
    resolveCanaryVersion({ ...context, packageManager: 'npm' })
  ).resolves.toBe(oldest)
})

it.each([
  ['10.33.0', null],
  ['12.9.1', now - 1440 * 60_000],
] as const)(
  'uses the pnpm %s default when age is omitted',
  async (version, cutoff) => {
    replies = [version, '{}']
    const policy = await readReleaseAgePolicy(context)
    expect(policy?.publishedBefore ?? null).toBe(cutoff)
  }
)

it.each([
  ['pnpm', '10.15.0'],
  ['yarn', '1.22.19'],
  ['yarn', '4.9.0'],
] as const)(
  'does not query unsupported age settings on %s %s',
  async (packageManager, version) => {
    replies = [version]
    await expect(
      readReleaseAgePolicy({ ...context, packageManager })
    ).resolves.toBeNull()
    expect(spawn).toHaveBeenCalledTimes(1)
  }
)

it('uses the current tag when age is disabled', async () => {
  replies[1] = JSON.stringify({ minimumReleaseAge: 0 })
  await expect(resolveCanaryVersion(context)).resolves.toBe(young)
  expect(global.fetch).toHaveBeenCalledTimes(1)
  expect(spawn).toHaveBeenCalledTimes(2)
})

it('accepts a release exactly at the cutoff', async () => {
  metadata.time[young] = '2026-10-14T00:00:00Z'
  await expect(resolveCanaryVersion(context)).resolves.toBe(young)
})

it('respects a canary tag moved back to an older version', async () => {
  metadata['dist-tags'].canary = oldest
  await expect(resolveCanaryVersion(context)).resolves.toBe(oldest)
})

it('fails when no eligible canary remains, even if a stable release is old enough', async () => {
  delete metadata.time[mature]
  metadata.time[oldest] = 'invalid date'
  await expect(resolveCanaryVersion(context)).rejects.toThrow(
    'No Next.js canary satisfies'
  )
})

it.each([
  [[`next@${young}`], young],
  [['ne*'], young],
  [[`next@${mature}`, 'next'], mature],
  [['react@not-a-version', 'next'], young],
  [['next', 'react@not-a-version'], young],
])(
  'applies only the first matching pnpm exclusion: %j',
  async (patterns, selected) => {
    replies[1] = JSON.stringify({
      minimumReleaseAge: 2880,
      minimumReleaseAgeExclude: patterns,
    })
    await expect(resolveCanaryVersion(context)).resolves.toBe(selected)
  }
)

it.each([
  ['11.14.1', mature],
  ['12.2.0', young],
])(
  'only honors npm exclusions on supported versions: %s',
  async (version, selected) => {
    replies = [
      version,
      JSON.stringify({
        before: null,
        'min-release-age': 2,
        'min-release-age-exclude': ['ne*'],
      }),
    ]
    await expect(
      resolveCanaryVersion({ ...context, packageManager: 'npm' })
    ).resolves.toBe(selected)
  }
)

it('uses Yarn effective settings and a version preapproval', async () => {
  replies = [
    '4.18.1',
    [
      { key: 'npmRegistryServer', effective: 'https://registry.yarnpkg.com' },
      { key: 'npmMinimalAgeGate', effective: 2880 },
      { key: 'npmPreapprovedPackages', effective: [`next@${young}`] },
    ]
      .map((setting) => JSON.stringify(setting))
      .join('\n'),
  ]
  await expect(
    resolveCanaryVersion({ ...context, packageManager: 'yarn' })
  ).resolves.toBe(young)
})

it.each([
  { minimumReleaseAge: -1 },
  { minimumReleaseAge: 'invalid' },
  { minimumReleaseAge: 2880, minimumReleaseAgeExclude: ['next@not-a-version'] },
])('rejects invalid settings instead of disabling age: %j', async (config) => {
  replies[1] = JSON.stringify(config)
  await expect(resolveCanaryVersion(context)).rejects.toThrow(
    'Could not read pnpm release-age settings.'
  )
  expect(global.fetch).not.toHaveBeenCalled()
})

it.each(['settings', 'metadata'])(
  'fails when the %s subprocess exits unsuccessfully',
  async (stage) => {
    const success = jest.mocked(spawn).getMockImplementation()!
    let calls = 0
    jest.mocked(spawn).mockImplementation((...args) => {
      if (++calls !== (stage === 'settings' ? 2 : 3)) {
        return success(...args)
      }
      const child = Object.assign(new EventEmitter(), {
        stdout: Readable.from([]),
      })
      process.nextTick(() => child.emit('close', 1))
      return child as ReturnType<typeof spawn>
    })
    await expect(resolveCanaryVersion(context)).rejects.toThrow(
      stage === 'settings'
        ? 'Could not read pnpm release-age settings.'
        : 'Could not read Next.js release metadata.'
    )
    expect(global.fetch).not.toHaveBeenCalled()
  }
)
