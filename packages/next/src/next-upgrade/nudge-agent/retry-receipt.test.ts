import { mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { warn } from '../../build/output/log'
import { getAgentName } from '../../telemetry/agent-name'
import { nudgeUpgrade } from '../nudge'
import { getUpgradeAssessment } from '../shared/check-upgrade'

jest.mock('../shared/check-upgrade', () => ({
  ...jest.requireActual('../shared/check-upgrade'),
  getUpgradeAssessment: jest.fn(),
}))
jest.mock('../../telemetry/agent-name', () => ({ getAgentName: jest.fn() }))
jest.mock('../../build/output/log', () => ({ warn: jest.fn() }))
jest.mock('../../server/ci-info', () => ({ isCI: false }))
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
describe('security upgrade nudge', () => {
  const originalNextVersion = process.env.__NEXT_VERSION

  const run = (command: 'dev' | 'build' = 'build') =>
    nudgeUpgrade(directory, config('security'), command, null, null, null)

  beforeEach(() => {
    jest.resetAllMocks()
    process.env.__NEXT_VERSION = '13.0.0'
    jest.mocked(getAgentName).mockResolvedValue('codex')
    mockUpgrade()
  })

  afterAll(() => {
    if (originalNextVersion === undefined) {
      delete process.env.__NEXT_VERSION
    } else {
      process.env.__NEXT_VERSION = originalNextVersion
    }
  })

  it('allows one matching retry with a warning', async () => {
    jest.mocked(getUpgradeAssessment).mockResolvedValue({
      affected: true,
      upgrade: {
        status: 'ready',
        installedVersion: '13.0.0',
        targetVersion: '17.2.1',
        references: [],
        futureDefaults: [],
      },
      reference: 'https://api.github.com/advisories?affects=next%4013.0.0',
    })

    await expect(run('build')).rejects.toMatchObject({
      name: 'SecurityFatalError',
    })
    await expect(run('build')).resolves.toBeUndefined()

    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(
        /continuing after the upgrade reminder[\s\S]*Reference:/
      )
    )
  })

  it('keeps an accepted dev retry through a worker restart but not a new session', async () => {
    const reminder = Promise.resolve({
      kind: 'security' as const,
      policy: 'security' as const,
      installedVersion: '13.0.0',
      targetVersion: '17.2.1',
      reference: 'https://api.github.com/advisories?affects=next%4013.0.0',
    })
    const originalWorker = process.env.NEXT_PRIVATE_WORKER
    const originalRetries = process.env.NEXT_PRIVATE_ALLOWED_UPGRADE_RETRIES
    const originalSend = process.send
    const send = jest.fn(
      (_message: unknown, callback: (error: Error | null) => void) => {
        callback(null)
      }
    )

    try {
      process.env.NEXT_PRIVATE_WORKER = '1'
      process.send = send as unknown as typeof process.send

      await expect(
        nudgeUpgrade(directory, config('security'), 'dev', null, reminder, null)
      ).rejects.toMatchObject({ name: 'SecurityFatalError' })
      await expect(
        nudgeUpgrade(directory, config('security'), 'dev', null, reminder, null)
      ).resolves.toBeUndefined()

      const message = send.mock.calls[0]?.[0] as {
        nextUpgradeRetryAllowed: string
      }
      expect(message.nextUpgradeRetryAllowed).toMatch(/^[a-f0-9]{64}$/)

      process.env.NEXT_PRIVATE_ALLOWED_UPGRADE_RETRIES =
        message.nextUpgradeRetryAllowed
      let restartedNudge: typeof nudgeUpgrade
      jest.isolateModules(() => {
        restartedNudge = jest.requireActual<{
          nudgeUpgrade: typeof nudgeUpgrade
        }>('../nudge').nudgeUpgrade
        jest
          .mocked(
            jest.requireMock<typeof import('../../telemetry/agent-name')>(
              '../../telemetry/agent-name'
            ).getAgentName
          )
          .mockResolvedValue('codex')
      })
      await expect(
        restartedNudge!(
          directory,
          config('security'),
          'dev',
          null,
          reminder,
          null
        )
      ).resolves.toBeUndefined()
      expect(send).toHaveBeenCalledTimes(1)

      delete process.env.NEXT_PRIVATE_ALLOWED_UPGRADE_RETRIES
      let newSessionNudge: typeof nudgeUpgrade
      jest.isolateModules(() => {
        newSessionNudge = jest.requireActual<{
          nudgeUpgrade: typeof nudgeUpgrade
        }>('../nudge').nudgeUpgrade
        jest
          .mocked(
            jest.requireMock<typeof import('../../telemetry/agent-name')>(
              '../../telemetry/agent-name'
            ).getAgentName
          )
          .mockResolvedValue('codex')
      })
      await expect(
        newSessionNudge!(
          directory,
          config('security'),
          'dev',
          null,
          reminder,
          null
        )
      ).rejects.toMatchObject({ name: 'SecurityFatalError' })
    } finally {
      process.send = originalSend
      if (originalWorker === undefined) {
        delete process.env.NEXT_PRIVATE_WORKER
      } else {
        process.env.NEXT_PRIVATE_WORKER = originalWorker
      }
      if (originalRetries === undefined) {
        delete process.env.NEXT_PRIVATE_ALLOWED_UPGRADE_RETRIES
      } else {
        process.env.NEXT_PRIVATE_ALLOWED_UPGRADE_RETRIES = originalRetries
      }
    }
  })

  it('keeps dev and build retry receipts independent', async () => {
    jest.mocked(getUpgradeAssessment).mockResolvedValue({
      affected: true,
      upgrade: {
        status: 'ready',
        installedVersion: '13.0.0',
        targetVersion: '17.2.1',
        references: [],
        futureDefaults: [],
      },
      reference: 'https://api.github.com/advisories?affects=next%4013.0.0',
    })

    await expect(run('build')).rejects.toMatchObject({
      name: 'SecurityFatalError',
    })
    await expect(run('dev')).rejects.toMatchObject({
      name: 'SecurityFatalError',
    })
    await expect(run('build')).resolves.toBeUndefined()
  })
})

describe('latest upgrade nudge', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(getAgentName).mockResolvedValue('codex')
    mockUpgrade()
  })

  it('stops once and allows a matching retry with a warning', async () => {
    mockUpgrade('17.0.0')

    await expect(
      nudgeUpgrade(directory, config('latest'), 'build', null, null, null)
    ).rejects.toMatchObject({
      name: 'UpgradeNudgeError',
      exitCode: 1,
      message: expect.stringMatching(
        /Next\.js 17\.0\.0 is available\.[\s\S]*\*\*We recommend you upgrade Next\.js\.\*\*[\s\S]*upgrade recommendation\. Retry the same command to continue the original task\.[\s\S]*include this upgrade recommendation even if the retry succeeds\.[\s\S]*ask the user once:[\s\S]*in a separate Git worktree\?[\s\S]*Use their worktree choice and continue in this agent session[\s\S]*Run this command from this app's directory:[\s\S]*next upgrade --agent=(?:security|latest|experimental-future)[\s\S]*registry\.npmjs\.org/
      ),
    })
    await expect(
      nudgeUpgrade(directory, config('latest'), 'build', null, null, null)
    ).resolves.toBeUndefined()

    expect(getUpgradeAssessment).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(
        /Next\.js 17\.0\.0 is available\.[\s\S]*continuing after the upgrade reminder[\s\S]*registry\.npmjs\.org/
      )
    )
  })
})
