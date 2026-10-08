import { mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { warn } from '../../build/output/log'
import { getAgentName } from '../../telemetry/agent-name'
import { assessUpgrade, nudgeUpgrade } from '../nudge'
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

  it('shows a security advisory and the upgrade command', async () => {
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

    await expect(run()).rejects.toMatchObject({
      name: 'SecurityFatalError',
      exitCode: 1,
      message: expect.stringMatching(
        /affected by a known security vulnerability[\s\S]*\*\*We strongly recommend you upgrade Next\.js\.\*\*[\s\S]*upgrade recommendation\. Retry the same command to continue the original task\.[\s\S]*include this upgrade recommendation even if the retry succeeds\.[\s\S]*ask the user once:[\s\S]*in a separate Git worktree\?[\s\S]*Use their worktree choice and continue in this agent session[\s\S]*Run this command from this app's directory:[\s\S]*next upgrade --agent=(?:security|latest|experimental-future)/
      ),
    })
    expect(warn).not.toHaveBeenCalled()
  })

  it('shows the npm fallback reference', async () => {
    jest.mocked(getUpgradeAssessment).mockResolvedValue({
      affected: true,
      upgrade: {
        status: 'ready',
        installedVersion: '13.0.0',
        targetVersion: '17.2.1',
        references: [],
        futureDefaults: [],
      },
      reference: 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',
    })

    await expect(run()).rejects.toMatchObject({
      name: 'SecurityFatalError',
      exitCode: 1,
      message: expect.stringMatching(
        /affected by a known security vulnerability[\s\S]*registry\.npmjs\.org/
      ),
    })
    expect(warn).not.toHaveBeenCalled()
  })

  it.each(['blocked', 'unknown'] as const)(
    'skips the security nudge when target eligibility is %s',
    async (status) => {
      jest.mocked(getUpgradeAssessment).mockResolvedValue({
        reference: 'https://api.github.com/advisories?affects=next',
        affected: true,
        upgrade: { status, reason: 'Target assessment detail.' },
      })
      await expect(run()).resolves.toBeUndefined()
      expect(warn).not.toHaveBeenCalled()
    }
  )

  it('reuses the startup assessment for the agent nudge', async () => {
    const assessment = assessUpgrade(directory, config('security'), '13.0.0')

    await expect(
      nudgeUpgrade(directory, config('security'), 'dev', null, assessment, null)
    ).resolves.toBeUndefined()

    expect(getUpgradeAssessment).toHaveBeenCalledTimes(1)
  })

  it('stays silent when the version is unaffected', async () => {
    await run()

    expect(getUpgradeAssessment).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
  })

  it('stays silent when canary security assessment is unsupported', async () => {
    jest.mocked(getUpgradeAssessment).mockResolvedValue({
      affected: null,
      reference: null,
      upgrade: {
        status: 'blocked',
        reason:
          'Security upgrades are not supported for canary versions of Next.js.',
      },
    })
    await expect(run()).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(0)
    expect(getUpgradeAssessment).toHaveBeenCalledTimes(1)
  })

  it('stays silent when no security advisory matches', async () => {
    mockUpgrade()

    await run()

    expect(warn).not.toHaveBeenCalled()
  })

  it('does not look up advisories or warn outside an agent', async () => {
    jest.mocked(getAgentName).mockResolvedValue(null)

    await run()

    expect(getUpgradeAssessment).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns without rejecting when advisory lookup fails', async () => {
    jest
      .mocked(getUpgradeAssessment)
      .mockRejectedValue(new Error('Advisory service unavailable'))

    await expect(run()).resolves.toBeUndefined()

    expect(jest.mocked(warn).mock.calls).toMatchInlineSnapshot(`
     [
       [
         "Could not check Next.js security advisories. Continuing without an upgrade assessment.",
       ],
     ]
    `)
  })
})

describe('latest upgrade nudge', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(getAgentName).mockResolvedValue('codex')
    mockUpgrade()
  })

  it.each(['latest', 'experimental-future'] as const)(
    'links a canary %s reminder to the selected channel',
    async (policy) => {
      process.env.__NEXT_VERSION = '17.2.0-canary.4'
      mockUpgrade('17.3.0-canary.1')
      await expect(
        nudgeUpgrade(directory, config(policy), 'build', null, null, null)
      ).rejects.toMatchObject({
        name: 'UpgradeNudgeError',
        message: expect.stringContaining(
          'Reference: https://registry.npmjs.org/next/canary'
        ),
      })
      await expect(
        nudgeUpgrade(directory, config(policy), 'build', null, null, null)
      ).resolves.toBeUndefined()
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Reference: https://registry.npmjs.org/next/canary'
        )
      )
    }
  )

  it.each(['rc', 'beta', 'preview'] as const)(
    'links a verified %s latest reminder to stable latest',
    async (channel) => {
      process.env.__NEXT_VERSION = `17.2.0-${channel}.1`
      mockUpgrade('17.2.0')
      await expect(
        nudgeUpgrade(directory, config('latest'), 'build', null, null, null)
      ).rejects.toMatchObject({
        name: 'UpgradeNudgeError',
        message: expect.stringContaining(
          'Reference: https://registry.npmjs.org/next/latest'
        ),
      })
      expect(getUpgradeAssessment).toHaveBeenCalledWith(
        `17.2.0-${channel}.1`,
        'latest',
        false
      )
    }
  )

  it.each(['latest', 'experimental-future'] as const)(
    'does not offer an unsafe %s target or fall through to Future adoption',
    async (policy) => {
      jest.mocked(getUpgradeAssessment).mockResolvedValue({
        affected: false,
        reference: 'https://api.github.com/advisories',
        upgrade: { status: 'blocked', reason: 'The target is affected.' },
      })
      await expect(
        nudgeUpgrade(
          directory,
          config(policy, { cacheComponents: false }),
          'build',
          null,
          null,
          null
        )
      ).resolves.toBeUndefined()
      expect(warn).toHaveBeenCalledTimes(0)
      expect(getUpgradeAssessment).toHaveBeenCalledTimes(1)
    }
  )

  it('stays silent when there is no newer stable release', async () => {
    await nudgeUpgrade(directory, config('latest'), 'build', null, null, null)

    expect(getUpgradeAssessment).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
  })

  it('does not look up releases or log outside an agent', async () => {
    jest.mocked(getAgentName).mockResolvedValue(null)

    await nudgeUpgrade(directory, config('latest'), 'build', null, null, null)

    expect(getUpgradeAssessment).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('stays silent without rejecting when release lookup fails', async () => {
    jest.mocked(getUpgradeAssessment).mockResolvedValue({
      affected: false,
      reference: 'https://api.github.com/advisories',
      upgrade: { status: 'unknown', reason: 'Registry unavailable' },
    })

    await expect(
      nudgeUpgrade(directory, config('latest'), 'build', null, null, null)
    ).resolves.toBeUndefined()

    expect(warn).not.toHaveBeenCalled()
  })
})

describe('composed latest nudge', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(getAgentName).mockResolvedValue('codex')
    mockUpgrade('17.0.0')
  })

  it.each(['latest', 'experimental-future'] as const)(
    'preserves the %s policy when security takes priority',
    async (policy) => {
      jest.mocked(getUpgradeAssessment).mockResolvedValue({
        affected: true,
        upgrade: {
          status: 'ready',
          installedVersion: '13.0.0',
          targetVersion: '17.2.1',
          references: [],
          futureDefaults: [],
        },
        reference: 'https://api.github.com/advisories?affects=next%4015.0.0',
      })

      const nudge = nudgeUpgrade(
        directory,
        config(policy),
        'build',
        null,
        null,
        null
      )
      await expect(nudge).rejects.toMatchObject({
        name: 'SecurityFatalError',
        exitCode: 1,
        message: expect.stringContaining(`next upgrade --agent=${policy}`),
      })
      await expect(nudge).rejects.toMatchObject({
        message: expect.stringContaining(
          'This command stopped to show the upgrade recommendation.'
        ),
      })

      expect(getUpgradeAssessment).toHaveBeenCalledWith(
        expect.any(String),
        policy,
        false
      )
      expect(warn).not.toHaveBeenCalled()
      expect(getUpgradeAssessment).toHaveBeenCalledTimes(1)
    }
  )
})

describe('composed future nudge', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(getAgentName).mockResolvedValue('codex')
    mockUpgrade()
  })

  it('offers available defaults on canary without a version reminder', async () => {
    await expect(
      assessUpgrade(
        directory,
        config('experimental-future', { cacheComponents: false }),
        '16.4.0-canary.1'
      )
    ).resolves.toEqual({
      kind: 'experimental-future',
      policy: 'experimental-future',
      installedVersion: '16.4.0-canary.1',
      targetVersion: '16.4.0',
      names: ['Cache Components'],
    })
  })

  it('offers canary Future adoption when advisory assessment is skipped', async () => {
    process.env.__NEXT_VERSION = '17.2.0-canary.4'
    mockUpgrade()
    await expect(
      nudgeUpgrade(
        directory,
        config('experimental-future', { cacheComponents: false }),
        'build',
        null,
        null,
        null
      )
    ).rejects.toMatchObject({
      name: 'UpgradeNudgeError',
      message: expect.stringMatching(
        /We recommend you adopt these Future Defaults\.[\s\S]*include this upgrade recommendation even if the retry succeeds\./
      ),
    })
    expect(getUpgradeAssessment).toHaveBeenCalledTimes(1)
  })

  it('names available Future Defaults using the adapter', async () => {
    await expect(
      assessUpgrade(
        directory,
        config('experimental-future', { cacheComponents: false }),
        '16.4.0'
      )
    ).resolves.toEqual({
      kind: 'experimental-future',
      policy: 'experimental-future',
      installedVersion: '16.4.0',
      targetVersion: '16.4.0',
      names: ['Cache Components'],
    })
  })

  it('stops for a required latest upgrade before Future Defaults', async () => {
    mockUpgrade('17.0.0')

    await expect(
      nudgeUpgrade(
        directory,
        config('experimental-future', { cacheComponents: false }),
        'build',
        null,
        null,
        null
      )
    ).rejects.toMatchObject({
      name: 'UpgradeNudgeError',
      message: expect.stringMatching(
        /Next\.js 17\.0\.0 is available[\s\S]*include this upgrade recommendation even if the retry succeeds\.[\s\S]*next upgrade --agent=(?:security|latest|experimental-future)/
      ),
    })
  })
})
