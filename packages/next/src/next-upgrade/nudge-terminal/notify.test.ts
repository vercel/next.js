import { execFileSync } from 'child_process'
import { mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import Conf from 'next/dist/compiled/conf'
import { warn } from '../../build/output/log'
import { getAgentName } from '../../telemetry/agent-name'
import { assessUpgrade, nudgeUpgrade, shouldPromptForUpgrade } from '../nudge'
import { getUpgradeAssessment } from '../shared/check-upgrade'
import { promptUpgrade } from './prompt'

jest.mock('../../telemetry/agent-name', () => ({
  getAgentName: jest.fn(),
}))
jest.mock('../shared/check-upgrade', () => ({
  ...jest.requireActual('../shared/check-upgrade'),
  getPrereleaseChannel: jest.requireActual('../shared/check-upgrade')
    .getPrereleaseChannel,
  getLatestUpgradeVersion: jest.requireActual('../shared/check-upgrade')
    .getLatestUpgradeVersion,
  getUpgradeAssessment: jest.fn(),
}))
jest.mock('../../build/output/log', () => ({
  warn: jest.fn(),
}))

jest.mock('../../server/ci-info', () => ({ isCI: false }))
jest.mock('./prompt', () => ({
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

describe('terminal upgrade nudge', () => {
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
    jest.requireMock('../../server/ci-info').isCI = false
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
        delete stream.isTTY
      }
    }
    if (terminal === undefined) {
      delete process.env.TERM
    } else {
      process.env.TERM = terminal
    }
  })

  it('reuses the startup assessment for the human prompt', async () => {
    const assessment = assessUpgrade(directory, config('security'), '16.4.0')

    await expect(
      nudgeUpgrade(
        directory,
        config('security'),
        'dev',
        new AbortController().signal,
        assessment,
        null
      )
    ).resolves.toBe('skip')

    expect(getUpgradeAssessment).toHaveBeenCalledTimes(1)
    expect(promptUpgrade).toHaveBeenCalledTimes(1)
  })

  it.each([
    [
      'security',
      '17.0.0',
      '⚠ Installed Next.js version 16.4.0 is affected by a known security vulnerability.\n\nNext.js security version upgrade available: 16.4.0 -> 17.0.0',
    ],
    [
      'latest',
      '17.0.0',
      'Next.js latest version upgrade available: 16.4.0 -> 17.0.0',
    ],
    [
      'experimental-future',
      '17.0.0',
      'Next.js Future Default upgrade available: 16.4.0 -> 17.0.0\n\n- Cache Components',
    ],
    [
      'experimental-future',
      '16.4.1',
      'Next.js Future Default upgrade available: 16.4.0 -> 16.4.1\n\n- Cache Components',
    ],
    [
      'experimental-future',
      '16.4.0',
      'Next.js Future Default upgrade available:\n\n- Cache Components',
    ],
  ] as const)(
    'renders concise %s copy for target %s',
    async (policy, targetVersion, message) => {
      if (policy !== 'security') {
        mockUpgrade(targetVersion)
      }
      await expect(run(policy)).resolves.toBe('skip')
      expect(promptUpgrade).toHaveBeenCalledWith({
        message: message,
        signal: expect.any(AbortSignal),
        canUpdate: true,
        onShown: null,
      })
      jest.mocked(getAgentName).mockResolvedValue('codex')
      await expect(run(policy)).rejects.toMatchObject({
        message: expect.stringContaining(`next upgrade --agent=${policy}`),
      })
    }
  )

  it('omits already adopted defaults from a future version upgrade', async () => {
    mockUpgrade('17.0.0')
    await nudgeUpgrade(
      directory,
      config('experimental-future', { cacheComponents: true }),
      'build',
      new AbortController().signal,
      null,
      null
    )
    expect(promptUpgrade).toHaveBeenCalledWith({
      message: 'Next.js Future Default upgrade available: 16.4.0 -> 17.0.0',
      signal: expect.any(AbortSignal),
      canUpdate: true,
      onShown: null,
    })
  })

  it.each(['update', 'skip', 'interrupt'] as const)(
    'returns %s without saving a dismissal',
    async (action) => {
      jest.mocked(promptUpgrade).mockResolvedValue(action)
      await expect(run()).resolves.toBe(action)
      expect(promptUpgrade).toHaveBeenCalledWith({
        message:
          '⚠ Installed Next.js version 16.4.0 is affected by a known security vulnerability.\n\nNext.js security version upgrade available: 16.4.0 -> 17.0.0',
        signal: expect.any(AbortSignal),
        canUpdate: true,
        onShown: null,
      })
      await expect(run()).resolves.toBe(action)
      expect(promptUpgrade).toHaveBeenCalledTimes(2)
    }
  )

  it('lets an explicit request bypass a saved dismissal', async () => {
    jest.mocked(promptUpgrade).mockResolvedValue('dismiss')
    await run('security')
    jest.clearAllMocks()
    await run('security')
    expect(promptUpgrade).not.toHaveBeenCalled()
    process.env.__NEXT_AGENT_UPGRADE = 'security'
    jest.mocked(promptUpgrade).mockResolvedValue('skip')
    await expect(run('security')).resolves.toBe('skip')
    expect(promptUpgrade).toHaveBeenCalledTimes(1)
    expect(getUpgradeAssessment).toHaveBeenCalledWith(
      '16.4.0',
      'security',
      false
    )
  })

  it('does not open an explicitly requested prompt after cancellation', async () => {
    process.env.__NEXT_AGENT_UPGRADE = 'security'
    const controller = new AbortController()
    controller.abort()
    await run('security', controller.signal)
    expect(promptUpgrade).not.toHaveBeenCalled()
  })

  it('reloads a security dismissal before requesting metadata', async () => {
    jest.mocked(promptUpgrade).mockResolvedValue('dismiss')
    await expect(run()).resolves.toBe('dismiss')
    jest.clearAllMocks()
    await run()
    expect(getUpgradeAssessment).toHaveBeenCalledTimes(0)
    expect(promptUpgrade).toHaveBeenCalledTimes(0)

    process.env.__NEXT_VERSION = '16.4.1'
    jest.mocked(promptUpgrade).mockResolvedValue('skip')
    await expect(run()).resolves.toBe('skip')
    process.env.__NEXT_VERSION = '16.4.0'
    await expect(run('security')).resolves.toBe('skip')
    await expect(
      nudgeUpgrade(
        join(directory, 'app'),
        config('experimental-future'),
        'build',
        new AbortController().signal,
        null,
        null
      )
    ).resolves.toBe('skip')
  })

  it.each(['.', 'apps/web'])(
    'shares %s dismissals across worktrees without affecting other apps or repositories',
    async (appPath) => {
      const repository = join(directory, 'project.name')
      const worktree = join(directory, 'other-checkout')
      const git = (args: string[]) =>
        execFileSync(
          'git',
          ['-c', `core.hooksPath=${join(directory, 'no-hooks')}`, ...args],
          {
            cwd: directory,
            stdio: 'pipe',
          }
        )
      git(['init', repository])
      git([
        '-C',
        repository,
        '-c',
        'user.name=Next.js test',
        '-c',
        'user.email=nextjs@example.com',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '--allow-empty',
        '-m',
        'Initialize test repository',
      ])
      git(['-C', repository, 'worktree', 'add', '--detach', worktree])
      const app = join(repository, appPath)
      const siblingApp = join(worktree, appPath)
      await mkdir(app, { recursive: true })
      await mkdir(siblingApp, { recursive: true })
      const offer = (path: string) =>
        nudgeUpgrade(
          path,
          config('experimental-future'),
          'build',
          new AbortController().signal,
          null,
          null
        )
      jest.mocked(promptUpgrade).mockResolvedValue('dismiss')
      await expect(offer(app)).resolves.toBe('dismiss')
      jest.clearAllMocks()
      await offer(siblingApp)
      expect(getUpgradeAssessment).toHaveBeenCalledTimes(0)
      expect(promptUpgrade).toHaveBeenCalledTimes(0)

      const preferences = new Conf({ projectName: 'nextjs' })
      const name = appPath === '.' ? 'project%2Ename' : 'web'
      const saved = preferences.get(`agent-upgrade.${name}`) as Record<
        string,
        unknown
      >
      expect(Object.keys(saved)).toHaveLength(1)
      expect(Object.keys(saved)[0]).toMatch(/^[a-f0-9]{64}$/)
      expect(Object.values(saved)).toEqual([
        { security: '16.4.0:experimental-future' },
      ])

      const otherApp = join(worktree, 'other/web')
      await mkdir(otherApp, { recursive: true })
      jest.mocked(promptUpgrade).mockResolvedValue('skip')
      await expect(offer(otherApp)).resolves.toBe('skip')
      const otherRepository = join(directory, 'unrelated/project.name')
      git(['init', otherRepository])
      const unrelatedApp = join(otherRepository, appPath)
      await mkdir(unrelatedApp, { recursive: true })
      await expect(offer(unrelatedApp)).resolves.toBe('skip')
    }
  )

  it.each([false, true])(
    'still checks security after a latest dismissal (affected: %s)',
    async (affected) => {
      mockUpgrade('17.0.0')
      jest.mocked(promptUpgrade).mockResolvedValue('dismiss')
      await run()
      jest.clearAllMocks()
      jest.mocked(getUpgradeAssessment).mockResolvedValue({
        ...securityAssessment,
        affected,
      })
      jest.mocked(promptUpgrade).mockResolvedValue('skip')
      await run()
      expect(getUpgradeAssessment).toHaveBeenCalledWith(
        '16.4.0',
        'experimental-future',
        true
      )
      expect(promptUpgrade).toHaveBeenCalledTimes(affected ? 1 : 0)
    }
  )

  it('suppresses dismissed Future Defaults but still offers a newer release', async () => {
    mockUpgrade()
    jest.mocked(promptUpgrade).mockResolvedValue('dismiss')
    await expect(run()).resolves.toBe('dismiss')
    jest.clearAllMocks()
    await run()
    expect(promptUpgrade).toHaveBeenCalledTimes(0)
    mockUpgrade('17.0.0')
    jest.mocked(promptUpgrade).mockResolvedValue('skip')
    await expect(run()).resolves.toBe('skip')
    expect(promptUpgrade).toHaveBeenCalledWith({
      message: expect.stringContaining(
        'Next.js Future Default upgrade available: 16.4.0 -> 17.0.0'
      ),
      signal: expect.any(AbortSignal),
      canUpdate: true,
      onShown: null,
    })
  })

  it.each(['blocked', 'unknown'] as const)(
    'does not prompt when security target availability is %s',
    async (status) => {
      jest.mocked(getUpgradeAssessment).mockResolvedValue({
        ...securityAssessment,
        upgrade: { status, reason: 'No eligible target.' },
      })
      await run()
      expect(promptUpgrade).not.toHaveBeenCalled()
    }
  )

  it('continues assessing when preferences cannot be read', async () => {
    jest.spyOn(Conf.prototype, 'get').mockImplementationOnce(() => {
      throw new Error('Unavailable')
    })
    await expect(run()).resolves.toBe('skip')
  })

  it('warns and continues when a dismissal cannot be saved', async () => {
    jest.spyOn(Conf.prototype, 'set').mockImplementationOnce(() => {
      throw new Error('Read-only')
    })
    jest.mocked(promptUpgrade).mockResolvedValue('dismiss')
    await expect(run()).resolves.toBe('dismiss')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Could not save'))
  })

  it.each(['CI', 'stdin', 'stdout', 'TERM'])(
    'does not request metadata or prompt with ineligible %s',
    async (reason) => {
      if (reason === 'CI') {
        jest.requireMock('../../server/ci-info').isCI = true
      } else if (reason === 'TERM') {
        process.env.TERM = 'dumb'
      } else {
        Object.defineProperty(
          reason === 'stdin' ? process.stdin : process.stdout,
          'isTTY',
          {
            configurable: true,
            value: false,
          }
        )
      }
      expect(await shouldPromptForUpgrade()).toBe(false)
      await run()
      expect(getUpgradeAssessment).toHaveBeenCalledTimes(0)
      expect(promptUpgrade).toHaveBeenCalledTimes(0)
      process.env.__NEXT_AGENT_UPGRADE = 'security'
      await run()
      expect(getUpgradeAssessment).toHaveBeenCalledTimes(0)
      expect(promptUpgrade).toHaveBeenCalledTimes(0)
    }
  )

  it('excludes agents from the human startup gate', async () => {
    expect(await shouldPromptForUpgrade()).toBe(true)
    jest.mocked(getAgentName).mockResolvedValue('codex')
    expect(await shouldPromptForUpgrade()).toBe(false)
  })

  it('ignores an assessment that completes after cancellation', async () => {
    const controller = new AbortController()
    jest.mocked(getUpgradeAssessment).mockImplementation(async () => {
      controller.abort()
      return securityAssessment
    })
    await run('experimental-future', controller.signal)
    expect(promptUpgrade).toHaveBeenCalledTimes(0)
  })
})
