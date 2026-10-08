import { processEnv, updateInitialEnv } from '@next/env'
import { mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { warn } from '../build/output/log'
import { defaultConfig } from '../server/config-shared'
import { getAgentName } from '../telemetry/agent-name'
import { getUpgradeContext, nudgeUpgrade } from './nudge'
import { promptUpgrade } from './nudge-terminal/prompt'
import { getUpgradeAssessment } from './shared/check-upgrade'

jest.mock('../telemetry/agent-name', () => ({
  getAgentName: jest.fn(),
}))
jest.mock('./shared/check-upgrade', () => ({
  ...jest.requireActual('./shared/check-upgrade'),
  getPrereleaseChannel: jest.requireActual('./shared/check-upgrade')
    .getPrereleaseChannel,
  getLatestUpgradeVersion: jest.requireActual('./shared/check-upgrade')
    .getLatestUpgradeVersion,
  getUpgradeAssessment: jest.fn(),
}))
jest.mock('../build/output/log', () => ({
  warn: jest.fn(),
}))

jest.mock('../server/ci-info', () => ({ isCI: false }))
jest.mock('./nudge-terminal/prompt', () => ({
  promptUpgrade: jest.fn(),
}))
let mockPreferencesDirectory: string
jest.mock('next/dist/compiled/conf', () => {
  const ActualConf = jest.requireActual('next/dist/compiled/conf')
  return class extends ActualConf {
    constructor(options: object) {
      super({ ...options, cwd: mockPreferencesDirectory })
    }
  }
})

function mockUpgrade(targetVersion = process.env.__NEXT_VERSION || '16.4.0') {
  const canary = process.env.__NEXT_VERSION?.includes('-canary.')
  jest.mocked(getUpgradeAssessment).mockResolvedValue({
    affected: canary ? null : false,
    reference: canary ? null : 'https://api.github.com/advisories?affects=next',
    upgrade: {
      status: 'ready',
      installedVersion: process.env.__NEXT_VERSION || '16.4.0',
      targetVersion,
      references: [],
      futureDefaults: [],
    },
  })
}

let directory: string
const initialNextVersion = process.env.__NEXT_VERSION
const initialRequestedUpgrade = process.env.__NEXT_AGENT_UPGRADE

const config = (
  policy: 'security' | 'latest' | 'experimental-future' | false,
  values: Record<string, unknown> = {}
) =>
  ({
    ...values,
    distDir: '.next',
    experimental: { agentUpgrade: policy },
  }) as never

it('defaults agentUpgrade to the security policy', () => {
  expect(defaultConfig.experimental.agentUpgrade).toBe('security')
  const context = getUpgradeContext(config('security'))
  expect(context.experimental.agentUpgrade).toBe('security')
})

beforeEach(async () => {
  delete process.env.__NEXT_AGENT_UPGRADE
  process.env.__NEXT_VERSION = '16.4.0'
  directory = await mkdtemp(join(tmpdir(), 'security-upgrade-nudge-'))
  await mkdir(join(directory, 'app'))
})

afterEach(async () => {
  if (initialRequestedUpgrade === undefined) {
    delete process.env.__NEXT_AGENT_UPGRADE
  } else {
    process.env.__NEXT_AGENT_UPGRADE = initialRequestedUpgrade
  }
  if (initialNextVersion === undefined) {
    delete process.env.__NEXT_VERSION
  } else {
    process.env.__NEXT_VERSION = initialNextVersion
  }
  await rm(directory, { recursive: true, force: true })
})

describe('upgrade policy dispatch', () => {
  const stdinTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')
  const stdoutTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
  const terminal = process.env.TERM
  const securityAssessment = {
    affected: true,
    reference: 'https://example.com/advisory',
    upgrade: {
      status: 'ready' as const,
      installedVersion: '16.4.0',
      targetVersion: '17.0.0',
      references: [],
      futureDefaults: [],
    },
  }
  const run = (
    policy:
      | 'security'
      | 'latest'
      | 'experimental-future' = 'experimental-future',
    signal = new AbortController().signal
  ) => nudgeUpgrade(directory, config(policy), 'build', signal, null, null)

  beforeEach(() => {
    jest.resetAllMocks()
    mockPreferencesDirectory = join(directory, 'preferences')
    jest.requireMock('../server/ci-info').isCI = false
    for (const stream of [process.stdin, process.stdout]) {
      Object.defineProperty(stream, 'isTTY', {
        configurable: true,
        value: true,
      })
    }
    process.env.TERM = 'xterm'
    jest.mocked(getAgentName).mockResolvedValue(null)
    jest.mocked(getUpgradeAssessment).mockResolvedValue(securityAssessment)
    jest.mocked(promptUpgrade).mockResolvedValue('skip')
  })

  afterEach(() => {
    jest.restoreAllMocks()
    for (const [stream, descriptor] of [
      [process.stdin, stdinTTY],
      [process.stdout, stdoutTTY],
    ] as const) {
      if (descriptor) {
        Object.defineProperty(stream, 'isTTY', descriptor)
      } else {
        Reflect.deleteProperty(stream, 'isTTY')
      }
    }
    if (terminal === undefined) {
      delete process.env.TERM
    } else {
      process.env.TERM = terminal
    }
  })

  it.each(['security', 'latest', 'experimental-future'] as const)(
    'does not force a %s nudge without a valid installed version',
    async (policy) => {
      process.env.__NEXT_AGENT_UPGRADE = policy
      process.env.__NEXT_VERSION = 'not-a-version'
      processEnv([], directory)
      updateInitialEnv({ __NEXT_AGENT_UPGRADE: policy })
      for (const configured of [false, 'experimental-future'] as const) {
        const original = config(configured)
        const context = getUpgradeContext(original)
        expect(context.experimental.agentUpgrade).toBe(policy)
        await expect(
          nudgeUpgrade(
            directory,
            context,
            'dev',
            new AbortController().signal,
            null,
            null
          )
        ).resolves.toBeUndefined()
      }
      expect(promptUpgrade).not.toHaveBeenCalled()
      expect(getUpgradeAssessment).not.toHaveBeenCalled()
      jest.mocked(getAgentName).mockResolvedValue('codex')
      await expect(run(policy)).resolves.toBeUndefined()
    }
  )

  it.each(['blocked', 'unknown'] as const)(
    'does not force a nudge when the target is %s',
    async (status) => {
      process.env.__NEXT_AGENT_UPGRADE = 'security'
      jest.mocked(getUpgradeAssessment).mockResolvedValue({
        affected: true,
        reference:
          'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',
        upgrade: { status, reason: 'No verified target.' },
      })
      await expect(run('security')).resolves.toBeUndefined()
      expect(promptUpgrade).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
    }
  )

  it('uses real release data for a forced latest nudge with config disabled', async () => {
    process.env.__NEXT_AGENT_UPGRADE = 'latest'
    mockUpgrade('16.4.1')
    await nudgeUpgrade(
      directory,
      config(false),
      'dev',
      new AbortController().signal,
      null,
      null
    )
    const { message } = jest.mocked(promptUpgrade).mock.calls[0][0]
    expect(message).toContain(
      'Next.js latest version upgrade available: 16.4.0 -> 16.4.1'
    )
    expect(message).not.toContain('Forced preview:')
    expect(getUpgradeAssessment).toHaveBeenCalledWith('16.4.0', 'latest', false)
    jest.mocked(getAgentName).mockResolvedValue('codex')
    await expect(
      nudgeUpgrade(directory, config(false), 'dev', null, null, null)
    ).rejects.toMatchObject({
      message: expect.stringContaining('next upgrade --agent=latest'),
    })
  })

  it('ignores invalid requests and retains the configured policy', async () => {
    process.env.__NEXT_AGENT_UPGRADE = 'invalid'
    const context = getUpgradeContext(config(false))
    expect(context.experimental.agentUpgrade).toBe(false)
    await nudgeUpgrade(
      directory,
      context,
      'build',
      new AbortController().signal,
      null,
      null
    )
    expect(promptUpgrade).not.toHaveBeenCalled()
    await expect(run()).resolves.toBe('skip')
    expect(getUpgradeAssessment).toHaveBeenCalledWith(
      '16.4.0',
      'experimental-future',
      false
    )
  })
})
