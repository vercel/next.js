import { randomUUID } from 'crypto'
import { execFile } from 'child_process'
import { cp, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import Conf from 'next/dist/compiled/conf'
import { loadEnvConfig, updateInitialEnv } from '@next/env'
import loadConfig from 'next/dist/server/config'
import {
  UpgradeTelemetry,
  parseUpgradeReminder,
} from 'next/dist/lib/upgrade/telemetry'
import {
  UpgradeReminder,
  recordUpgradeReminder,
} from 'next/dist/lib/upgrade/reminder-telemetry'
import { getAgentName } from 'next/dist/telemetry/agent-name'
import { Telemetry } from 'next/dist/telemetry/storage'
import { postNextTelemetryPayload } from 'next/dist/telemetry/post-telemetry-payload'
import { getRawProjectId } from 'next/dist/telemetry/project-id'
import { traceGlobals } from 'next/dist/trace/shared'

jest.mock('next/dist/server/config', () => ({
  __esModule: true,
  default: jest.fn(),
}))
jest.mock('@next/env', () => ({
  loadEnvConfig: jest.fn(),
  updateInitialEnv: jest.fn(),
}))
jest.mock('next/dist/telemetry/storage', () => ({ Telemetry: jest.fn() }))
jest.mock('next/dist/telemetry/agent-name', () => ({ getAgentName: jest.fn() }))
jest.mock('next/dist/telemetry/anonymous-meta', () => ({
  getAnonymousMeta: async () => ({}),
}))
jest.mock('next/dist/telemetry/post-telemetry-payload', () => ({
  postNextTelemetryPayload: jest.fn(),
}))
jest.mock('next/dist/telemetry/project-id', () => ({
  getRawProjectId: jest.fn(),
}))
jest.mock('next/dist/server/ci-info', () => ({ isCI: true }))
jest.mock('next/dist/compiled/conf', () => ({
  __esModule: true,
  default: jest.fn(),
}))

const record = jest.fn()
const flush = jest.fn()
const initialEnv = { ...process.env }
const runNode = promisify(execFile)

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(Conf).mockImplementation(() => {
    const values = new Map<string, unknown>([['telemetry.notifiedAt', '1']])
    return {
      get: (key: string, fallback: unknown) => values.get(key) ?? fallback,
      set: (key: string, value: unknown) => {
        values.set(key, value)
      },
    } as never
  })
  jest.mocked(loadConfig).mockResolvedValue({ distDir: '.next' } as never)
  jest.mocked(Telemetry).mockImplementation(() => ({ record, flush }) as never)
  jest.mocked(getAgentName).mockResolvedValue('codex')
  jest.mocked(getRawProjectId).mockResolvedValue('target-project')
  jest.mocked(loadEnvConfig).mockImplementation(() => ({}) as never)
  jest.mocked(updateInitialEnv).mockReset()
  delete process.env.__NEXT_UPGRADE_TELEMETRY
  delete process.env.NEXT_TELEMETRY_DEBUG
  delete process.env.NEXT_TELEMETRY_DISABLED
})

afterEach(() => {
  process.env = { ...initialEnv }
  traceGlobals.delete('telemetry')
  jest.restoreAllMocks()
})

it('preserves one logical start, attribution, and cumulative durations through delegation', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(10_000)
  const reminderId = randomUUID()
  const parent = await UpgradeTelemetry.start(
    '/app',
    'future',
    `build:${reminderId}`
  )
  expect(parent).toBeTruthy()
  const started = record.mock.calls[0][0]
  expect(started).toEqual({
    eventName: 'NEXT_UPGRADE_STARTED',
    payload: {
      upgradeId: expect.any(String),
      reminderId,
      actor: 'agent',
      upgradeType: 'future',
      trigger: 'build',
    },
  })
  process.env.__NEXT_UPGRADE_TELEMETRY = parent!.serialize()
  now.mockReturnValue(12_000)
  const child = await UpgradeTelemetry.start('/app', 'future', undefined)
  expect(process.env.__NEXT_UPGRADE_TELEMETRY).toBeUndefined()
  expect(record).toHaveBeenCalledTimes(1)
  child!.recordPrepared('ready', '16.0.0', '16.1.0')
  now.mockReturnValue(15_000)
  child!.recordHandoff('codex')
  expect(record.mock.calls.slice(1).map(([event]) => event.payload)).toEqual([
    {
      upgradeId: started.payload.upgradeId,
      prepareState: 'ready',
      installedVersion: '16.0.0',
      targetVersion: '16.1.0',
      durationMs: 2000,
    },
    {
      upgradeId: started.payload.upgradeId,
      handoffState: 'codex',
      durationMs: 5000,
    },
  ])
})

it('keeps a delegated context consumed after Future preparation resets the environment', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'upgrade-telemetry-env-'))
  try {
    await jest.isolateModulesAsync(async () => {
      const env: typeof import('@next/env') = jest.requireActual('@next/env')
      jest.mocked(loadEnvConfig).mockImplementation(env.loadEnvConfig)
      jest.mocked(updateInitialEnv).mockImplementation(env.updateInitialEnv)
      const inherited = {
        upgradeId: randomUUID(),
        reminderId: randomUUID(),
        actor: 'human',
        upgradeType: 'future',
        trigger: 'dev',
        startedAt: Date.now() - 1000,
      }
      process.env.__NEXT_UPGRADE_TELEMETRY = JSON.stringify(inherited)
      // Bare --ai loads the app's config before starting upgrade telemetry.
      env.loadEnvConfig(directory, false)
      expect(env.initialEnv?.__NEXT_UPGRADE_TELEMETRY).toBe(
        JSON.stringify(inherited)
      )

      const delegated = await UpgradeTelemetry.start(
        directory,
        'future',
        undefined
      )
      expect(delegated).toBeTruthy()
      expect(JSON.parse(delegated!.serialize())).toEqual(inherited)
      expect(record).toHaveBeenCalledTimes(0)

      // Future preparation restores the saved environment before agent launch.
      env.resetEnv()
      expect(process.env.__NEXT_UPGRADE_TELEMETRY).toBeUndefined()
      expect(env.initialEnv?.__NEXT_UPGRADE_TELEMETRY).toBeUndefined()

      const subsequent = await UpgradeTelemetry.start(
        directory,
        'latest',
        undefined
      )
      expect(subsequent).toBeTruthy()
      const context = JSON.parse(subsequent!.serialize())
      expect(context.upgradeId === inherited.upgradeId).toBe(false)
      expect(context.startedAt).toBeGreaterThan(inherited.startedAt)
      expect(record.mock.calls).toEqual([
        [
          {
            eventName: 'NEXT_UPGRADE_STARTED',
            payload: {
              upgradeId: context.upgradeId,
              reminderId: null,
              actor: 'agent',
              upgradeType: 'latest',
              trigger: 'upgrade',
            },
          },
        ],
      ])
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it.each([
  undefined,
  'dev:invalid',
  `other:${randomUUID()}`,
  `dev:${randomUUID()}:extra`,
])('treats invalid attribution %s as direct', (value) => {
  expect(parseUpgradeReminder(value)).toEqual({
    reminderId: null,
    trigger: 'upgrade',
  })
})

it.each([
  '{}',
  '{',
  JSON.stringify({ upgradeId: randomUUID(), startedAt: -1 }),
])('ignores malformed delegated context %s', async (value) => {
  process.env.__NEXT_UPGRADE_TELEMETRY = value
  const attempt = await UpgradeTelemetry.start('/app', 'security', undefined)
  expect(attempt).toBeTruthy()
  expect(record).toHaveBeenCalledTimes(1)
  expect(record.mock.calls[0][0].payload).toMatchObject({
    reminderId: null,
    trigger: 'upgrade',
  })
})

it.each([
  [{ distDir: '.custom' }, '.custom'],
  [{ distDir: '.next' }, '.next'],
  [{ output: 'export', distDir: 'public-output' }, '.next'],
] as const)(
  'uses the build telemetry directory for config %j',
  async (config, distDir) => {
    jest.mocked(loadConfig).mockResolvedValue(config as never)
    const attempt = await UpgradeTelemetry.start('/app', 'latest', undefined)
    expect(attempt).toBeTruthy()
    expect(Telemetry).toHaveBeenCalledWith(
      { distDir: join('/app', distDir) },
      '/app'
    )
  }
)

it('skips telemetry if an explicit upgrade cannot read app configuration', async () => {
  jest.mocked(loadConfig).mockRejectedValue(new Error('Cannot load config'))
  await expect(
    UpgradeTelemetry.start('/app', 'latest', undefined)
  ).resolves.toBeNull()
  expect(Telemetry).toHaveBeenCalledTimes(0)
  expect(record).toHaveBeenCalledTimes(0)
})

it.each(['plain', 'adapter', 'export', 'legacy'])(
  'uses real config loading and persisted consent for %s apps',
  async (kind) => {
    const directory = await mkdtemp(join(tmpdir(), 'upgrade-config-consent-'))
    try {
      await cp(join(__dirname, 'fixtures/upgrade-telemetry'), directory, {
        recursive: true,
      })
      // A real Node process exercises adapter import() and avoids Jest mocks.
      const { stdout } = await runNode(process.execPath, [
        join(directory, 'check-consent.cjs'),
        require.resolve('next/package.json'),
        kind,
      ])
      expect(JSON.parse(stdout)).toEqual(
        kind === 'legacy'
          ? { policy: 'latest', telemetrySkipped: true, posts: 0 }
          : {
              policy: 'latest',
              buildDistDir: kind === 'export' ? '.next' : '.custom',
              disabledPosts: 0,
              enabledPosts: 1,
              sameIdentity: true,
            }
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
)

it('records preparation and failure once and clamps elapsed time after a clock change', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(10_000)
  const attempt = await UpgradeTelemetry.start('/app', 'latest', undefined)
  now.mockReturnValue(9000)
  attempt!.recordPrepared('blocked', '16.0.0', null)
  attempt!.recordPrepared('unknown', null, null)
  attempt!.recordHandoff('failed')
  attempt!.recordFailure()
  expect(record.mock.calls.map(([event]) => event.eventName)).toEqual([
    'NEXT_UPGRADE_STARTED',
    'NEXT_UPGRADE_PREPARED',
    'NEXT_UPGRADE_HANDOFF',
    'NEXT_UPGRADE_FINISHED',
  ])
  expect(record.mock.calls[3][0].payload).toMatchObject({
    outcome: 'failure',
    durationMs: 0,
  })
})

it.each([
  'current-agent',
  'copied',
  'printed',
  'cancelled',
  'codex',
  'claude',
] as const)(
  'does not claim migration success or failure for %s',
  async (state) => {
    const attempt = await UpgradeTelemetry.start('/app', 'latest', undefined)
    attempt!.recordHandoff(state)
    expect(record.mock.calls.map(([event]) => event.eventName)).toEqual([
      'NEXT_UPGRADE_STARTED',
      'NEXT_UPGRADE_HANDOFF',
    ])
  }
)

it('counts an error only at the display boundary and deduplicates propagation', async () => {
  const reminder = UpgradeReminder.create(
    'Run next upgrade --ai',
    'UpgradeNudgeError',
    '/app',
    '.custom',
    'future',
    'latest',
    'dev'
  )
  expect(record).toHaveBeenCalledTimes(0)
  expect(reminder.message).toMatch(/--upgrade-reminder dev:[0-9a-f-]+/)
  await recordUpgradeReminder(reminder)
  await recordUpgradeReminder(reminder)
  await recordUpgradeReminder(new Error('unrelated error'))
  expect(record).toHaveBeenCalledTimes(1)
  expect(record.mock.calls[0][0]).toEqual({
    eventName: 'NEXT_UPGRADE_MESSAGE_SHOWN',
    payload: {
      reminderId: expect.any(String),
      audience: 'agent',
      upgradeType: 'future',
      reminderKind: 'latest',
      trigger: 'dev',
    },
  })
  expect(flush).toHaveBeenCalledTimes(1)
  expect(Telemetry).toHaveBeenCalledWith(
    { distDir: expect.stringMatching(/[/\\]app[/\\]\.custom$/) },
    '/app'
  )
})

it('uses the existing dev/build telemetry instance when available', async () => {
  traceGlobals.set('telemetry', { record, flush })
  await UpgradeReminder.create(
    'Reminder',
    'UpgradeNudgeError',
    '/app',
    '.next',
    'future',
    'future',
    'build'
  ).recordShown()
  expect(Telemetry).toHaveBeenCalledTimes(0)
  expect(record).toHaveBeenCalledTimes(1)
})

it('remains best effort if telemetry initialization fails', async () => {
  jest.mocked(Telemetry).mockImplementation(() => {
    throw new Error('storage unavailable')
  })
  await expect(
    UpgradeTelemetry.start('/app', 'latest', undefined)
  ).resolves.toBeNull()
  await expect(
    UpgradeReminder.create(
      'Reminder',
      'UpgradeNudgeError',
      '/app',
      '.next',
      'latest',
      'latest',
      'build'
    ).recordShown()
  ).resolves.toBeUndefined()
})

describe('existing consent and transport', () => {
  const ActualTelemetry: typeof Telemetry = jest.requireActual(
    'next/dist/telemetry/storage'
  ).Telemetry

  beforeEach(() => {
    jest
      .mocked(Telemetry)
      .mockImplementation((...args) => new ActualTelemetry(...args))
  })

  it('loads app-local consent before creating the upgrade telemetry instance', async () => {
    jest.mocked(loadEnvConfig).mockImplementation(() => {
      process.env.NEXT_TELEMETRY_DISABLED = '1'
      return {} as never
    })
    const attempt = await UpgradeTelemetry.start(
      '/target-app',
      'latest',
      undefined
    )
    await attempt!.flush()
    expect(loadEnvConfig).toHaveBeenCalledWith('/target-app', false)
    expect(postNextTelemetryPayload).toHaveBeenCalledTimes(0)
  })

  it('honors persisted opt-out', async () => {
    const telemetry = new ActualTelemetry({ distDir: '/app/.next' })
    telemetry.setEnabled(false)
    await telemetry.record({ eventName: 'NEXT_UPGRADE_STARTED', payload: {} })
    await telemetry.flush()
    expect(postNextTelemetryPayload).toHaveBeenCalledTimes(0)
  })

  it('shares persisted consent and identity with build telemetry in CI', async () => {
    const ActualConf: typeof Conf = jest.requireActual(
      'next/dist/compiled/conf'
    )
    jest.mocked(Conf).mockImplementation((options) => new ActualConf(options))
    const directory = await mkdtemp(
      join(tmpdir(), 'upgrade-telemetry-consent-')
    )
    const output = jest.spyOn(console, 'log').mockImplementation(() => {})
    try {
      jest.mocked(loadConfig).mockResolvedValue({ distDir: '.custom' } as never)
      const buildTelemetry = new ActualTelemetry(
        { distDir: join(directory, '.custom') },
        directory
      )
      const anonymousId = buildTelemetry.anonymousId
      buildTelemetry.setEnabled(false)

      const disabled = await UpgradeTelemetry.start(
        directory,
        'latest',
        undefined
      )
      expect(disabled).toBeTruthy()
      await disabled!.flush()
      expect(postNextTelemetryPayload).toHaveBeenCalledTimes(0)

      buildTelemetry.setEnabled(true)
      const enabled = await UpgradeTelemetry.start(
        directory,
        'latest',
        undefined
      )
      expect(enabled).toBeTruthy()
      await enabled!.flush()
      expect(postNextTelemetryPayload).toHaveBeenCalledTimes(1)
      expect(postNextTelemetryPayload).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({ anonymousId }),
        }),
        expect.any(AbortSignal)
      )
    } finally {
      output.mockRestore()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('uses the target app identity and the normal event wire format', async () => {
    const attempt = await UpgradeTelemetry.start(
      '/target-app',
      'latest',
      undefined
    )
    await attempt!.flush()
    expect(getRawProjectId).toHaveBeenCalledWith('/target-app')
    expect(postNextTelemetryPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        events: [
          {
            eventName: 'NEXT_UPGRADE_STARTED',
            fields: expect.objectContaining({ upgradeType: 'latest' }),
          },
        ],
      }),
      expect.any(AbortSignal)
    )
  })

  it('prints debug events without submitting them', async () => {
    process.env.NEXT_TELEMETRY_DEBUG = '1'
    process.env.NEXT_TELEMETRY_DISABLED = '1'
    const output = jest.spyOn(console, 'error').mockImplementation(() => {})
    const attempt = await UpgradeTelemetry.start('/app', 'future', undefined)
    await attempt!.flush()
    expect(output).toHaveBeenCalledTimes(1)
    expect(output.mock.calls[0][0]).toContain('NEXT_UPGRADE_STARTED')
    expect(postNextTelemetryPayload).toHaveBeenCalledTimes(0)
  })
})

it('resolves the project remote and fallback from the target directory', async () => {
  const childProcess: typeof import('child_process') = require('child_process')
  const exec = jest.spyOn(childProcess, 'exec').mockImplementation(((
    _command: string,
    _options: object,
    callback: (error: null, stdout: string) => void
  ) => {
    callback(null, 'https://example.com/target.git\n')
    return {}
  }) as never)
  const {
    getRawProjectId: actual,
  }: typeof import('next/dist/telemetry/project-id') = jest.requireActual(
    'next/dist/telemetry/project-id'
  )
  await expect(actual('/target-repo')).resolves.toBe(
    'https://example.com/target.git'
  )
  expect(exec).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ cwd: '/target-repo', timeout: 1000 }),
    expect.any(Function)
  )
  exec.mockImplementation(((
    _command: string,
    _options: object,
    callback: (error: null, stdout: string) => void
  ) => {
    callback(null, '')
    return {}
  }) as never)
  delete process.env.REPOSITORY_URL
  await expect(actual('/target-repo')).resolves.toBe('/target-repo')
})
