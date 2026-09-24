import { execFileSync } from 'child_process'
import { mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { processEnv, resetEnv, updateInitialEnv } from '@next/env'

import {
  assessUpgrade,
  getUpgradeContext,
  nudgeUpgrade,
  runUpgrade,
  shouldPromptForUpgrade,
} from 'next/dist/lib/upgrade/nudge'
import { promptUpgrade } from 'next/dist/lib/upgrade/prompt'
import Conf from 'next/dist/compiled/conf'
import { getAgentName } from 'next/dist/telemetry/agent-name'
import { getUpgradeAssessment } from 'next/dist/lib/upgrade/prepare-upgrade'
import { warn } from 'next/dist/build/output/log'
import { spawnNextUpgrade } from 'next/dist/cli/next-upgrade'

jest.mock('next/dist/cli/next-upgrade', () => ({
  spawnNextUpgrade: jest.fn(),
}))
jest.mock(
  '../../packages/next/src/cli/next-upgrade.js',
  () => jest.requireMock('next/dist/cli/next-upgrade'),
  { virtual: true }
)

// Read source so version cases run before the package build inlines __NEXT_VERSION.
jest.mock('next/dist/lib/upgrade/nudge', () =>
  jest.requireActual('../../packages/next/src/lib/upgrade/nudge')
)
jest.mock('../../packages/next/src/telemetry/agent-name', () =>
  jest.requireMock('next/dist/telemetry/agent-name')
)
jest.mock('../../packages/next/src/lib/upgrade/prepare-upgrade', () =>
  jest.requireMock('next/dist/lib/upgrade/prepare-upgrade')
)
jest.mock('../../packages/next/src/build/output/log', () =>
  jest.requireMock('next/dist/build/output/log')
)

jest.mock('next/dist/telemetry/agent-name', () => ({
  getAgentName: jest.fn(),
}))
jest.mock('next/dist/lib/upgrade/prepare-upgrade', () => ({
  getLatestUpgradeVersion: jest.requireActual(
    'next/dist/lib/upgrade/prepare-upgrade'
  ).getLatestUpgradeVersion,
  getUpgradeAssessment: jest.fn(),
}))
jest.mock('next/dist/build/output/log', () => ({
  warn: jest.fn(),
}))

jest.mock('../../packages/next/src/server/ci-info', () => ({ isCI: false }))
jest.mock('../../packages/next/src/lib/upgrade/prompt', () =>
  jest.requireMock('next/dist/lib/upgrade/prompt')
)
jest.mock('next/dist/lib/upgrade/prompt', () => ({
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
const initialRequestedUpgrade = process.env.__NEXT_AGENTIC_AUTO_UPGRADE

const config = (
  policy: 'security' | 'latest' | 'future' | false,
  values: Record<string, unknown> = {}
) =>
  ({
    ...values,
    distDir: '.next',
    experimental: { agenticAutoUpgrade: policy },
  }) as never

beforeEach(async () => {
  delete process.env.__NEXT_AGENTIC_AUTO_UPGRADE
  process.env.__NEXT_VERSION = '16.4.0'
  directory = await mkdtemp(join(tmpdir(), 'security-upgrade-nudge-'))
  await mkdir(join(directory, 'app'))
})

afterEach(async () => {
  if (initialRequestedUpgrade === undefined) {
    delete process.env.__NEXT_AGENTIC_AUTO_UPGRADE
  } else {
    process.env.__NEXT_AGENTIC_AUTO_UPGRADE = initialRequestedUpgrade
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
    nudgeUpgrade(directory, config('security'), command)

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
        /affected by a published security advisory[\s\S]*\*\*We strongly recommend you upgrade Next\.js\.\*\*[\s\S]*reminder you configured is not missed\. Retry the same command to continue the original task\.[\s\S]*include this upgrade recommendation even if the retry succeeds\.[\s\S]*At the end of the task, ask the user whether they want you to run the upgrade using the configured 'security' policy in the background in a separate Git worktree unless they request otherwise\. Run this command from this app's directory:[\s\S]*```\nnext upgrade --ai=(?:security|latest|future)\n```/
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
        /affected by a published security advisory[\s\S]*registry\.npmjs\.org/
      ),
    })
    expect(warn).not.toHaveBeenCalled()
  })

  it.each(['blocked', 'unknown'] as const)(
    'preserves the advisory and retry behavior when target eligibility is %s',
    async (status) => {
      jest.mocked(getUpgradeAssessment).mockResolvedValue({
        reference: 'https://api.github.com/advisories?affects=next',
        affected: true,
        upgrade: { status, reason: 'Target assessment detail.' },
      })
      let message = ''
      try {
        await run()
      } catch (error) {
        expect(error).toMatchObject({ name: 'SecurityFatalError', exitCode: 1 })
        message = (error as Error).message
      }
      expect(message).toContain('affected by a published security advisory')
      expect(message).toContain('Target assessment detail.')
      expect(message.includes('next upgrade --ai')).toBe(false)
      expect(message.includes('can be automatically upgraded')).toBe(false)
      expect(message).toContain(
        status === 'unknown'
          ? 'Upgrade availability could not be checked.'
          : 'No safe newer target is available'
      )
      await expect(run()).resolves.toBeUndefined()
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Target assessment detail.')
      )
    }
  )

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
        /continuing after the reminder you configured[\s\S]*Reference:/
      )
    )
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
describe('latest nudge release selection', () => {
  const { getLatestUpgradeVersion: readLatestUpgradeVersion } =
    jest.requireActual<typeof import('next/dist/lib/upgrade/prepare-upgrade')>(
      'next/dist/lib/upgrade/prepare-upgrade'
    )

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it.each<[string, string, string | null]>([
    ['15.5.9', '16.0.0', '16.0.0'],
    ['16.0.9', '16.1.0', '16.1.0'],
    ['16.1.0', '16.1.1', null],
    ['16.1.1', '16.1.1', null],
    ['16.2.0', '16.1.1', null],
    ['16.1.0', '17.0.0-canary.1', null],
    ['16.1.0-canary.1', '16.1.0', null],
    ['16.0.0-canary.1', '16.1.0', null],
    ['17.2.0-canary.4', '17.2.0-canary.9', null],
    ['17.2.0-canary.9', '17.2.0-canary.10', null],
    ['17.2.0-canary.4', '17.2.1-canary.0', null],
    ['17.2.0-canary.4', '17.3.0-canary.0', '17.3.0-canary.0'],
    ['17.2.0-canary.4', '18.0.0-canary.0', '18.0.0-canary.0'],
    ['17.2.0-canary.4', '17.2.0-canary.4', null],
    ['17.2.0-canary.4', '17.1.0-canary.99', null],
    ['17.2.0-canary.4', '17.3.0-rc.1', null],
    ['17.2.0-rc.1', '17.3.0', null],
  ])(
    'selects %s → %s for a nudge only across major/minor versions',
    async (installed, latest, expected) => {
      expect(readLatestUpgradeVersion(installed, latest)).toBe(expected)
    }
  )
})

describe('latest upgrade nudge', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(getAgentName).mockResolvedValue('codex')
    mockUpgrade()
  })

  it.each(['latest', 'future'] as const)(
    'links a canary %s reminder to the selected channel',
    async (policy) => {
      process.env.__NEXT_VERSION = '17.2.0-canary.4'
      mockUpgrade('17.3.0-canary.1')
      await expect(
        nudgeUpgrade(directory, config(policy), 'build')
      ).rejects.toMatchObject({
        name: 'UpgradeNudgeError',
        message: expect.stringContaining(
          'Reference: https://registry.npmjs.org/next/canary'
        ),
      })
      await expect(
        nudgeUpgrade(directory, config(policy), 'build')
      ).resolves.toBeUndefined()
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Reference: https://registry.npmjs.org/next/canary'
        )
      )
    }
  )

  it('stops once and allows a matching retry with a warning', async () => {
    mockUpgrade('17.0.0')

    await expect(
      nudgeUpgrade(directory, config('latest'), 'build')
    ).rejects.toMatchObject({
      name: 'UpgradeNudgeError',
      exitCode: 1,
      message: expect.stringMatching(
        /Next\.js 17\.0\.0 is available\.[\s\S]*\*\*We recommend you upgrade Next\.js\.\*\*[\s\S]*reminder you configured is not missed\. Retry the same command to continue the original task\.[\s\S]*include this upgrade recommendation even if the retry succeeds\.[\s\S]*At the end of the task, ask the user whether they want you to run the upgrade using the configured 'latest' policy in the background in a separate Git worktree unless they request otherwise\. Run this command from this app's directory:[\s\S]*```\nnext upgrade --ai=(?:security|latest|future)\n```[\s\S]*registry\.npmjs\.org[\s\S]*agenticAutoUpgrade: 'latest'/
      ),
    })
    await expect(
      nudgeUpgrade(directory, config('latest'), 'build')
    ).resolves.toBeUndefined()

    expect(getUpgradeAssessment).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(
        /Next\.js 17\.0\.0 is available\.[\s\S]*continuing after the reminder you configured[\s\S]*registry\.npmjs\.org/
      )
    )
  })

  it.each(['latest', 'future'] as const)(
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
          'build'
        )
      ).resolves.toBeUndefined()
      expect(warn).toHaveBeenCalledTimes(0)
      expect(getUpgradeAssessment).toHaveBeenCalledTimes(1)
    }
  )

  it('stays silent when there is no newer stable release', async () => {
    await nudgeUpgrade(directory, config('latest'), 'build')

    expect(getUpgradeAssessment).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
  })

  it('does not look up releases or log outside an agent', async () => {
    jest.mocked(getAgentName).mockResolvedValue(null)

    await nudgeUpgrade(directory, config('latest'), 'build')

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
      nudgeUpgrade(directory, config('latest'), 'build')
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

  it.each(['latest', 'future'] as const)(
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

      const nudge = nudgeUpgrade(directory, config(policy), 'build')
      await expect(nudge).rejects.toMatchObject({
        name: 'SecurityFatalError',
        exitCode: 1,
        message: expect.stringContaining(
          `\`\`\`\nnext upgrade --ai=${policy}\n\`\`\``
        ),
      })
      await expect(nudge).rejects.toMatchObject({
        message: expect.stringContaining(
          `experimental.agenticAutoUpgrade: '${policy}'`
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

  it.each(['16.3.0-canary.1', '16.4.0-rc.1', '16.4.0-beta.1'])(
    'does not offer defaults before stable availability or for another prerelease: %s',
    async (version) => {
      await expect(
        assessUpgrade(
          directory,
          config('future', { cacheComponents: false }),
          version
        )
      ).resolves.toBeNull()
    }
  )

  it('offers available defaults on canary without a version reminder', async () => {
    await expect(
      assessUpgrade(
        directory,
        config('future', { cacheComponents: false }),
        '16.4.0-canary.1'
      )
    ).resolves.toEqual({
      kind: 'future',
      policy: 'future',
      installedVersion: '16.4.0-canary.1',
      targetVersion: '16.4.0',
      names: ['Cache Components'],
    })
  })

  it('does not remind about defaults already adopted on canary', async () => {
    await expect(
      assessUpgrade(
        directory,
        config('future', { cacheComponents: true }),
        '16.4.0-canary.1'
      )
    ).resolves.toBeNull()
  })

  it('offers canary Future adoption when advisory assessment is skipped', async () => {
    process.env.__NEXT_VERSION = '17.2.0-canary.4'
    mockUpgrade()
    await expect(
      nudgeUpgrade(
        directory,
        config('future', { cacheComponents: false }),
        'build'
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
        config('future', { cacheComponents: false }),
        '16.4.0'
      )
    ).resolves.toEqual({
      kind: 'future',
      policy: 'future',
      installedVersion: '16.4.0',
      targetVersion: '16.4.0',
      names: ['Cache Components'],
    })
  })

  it('does not offer Cache Components to a Pages-only app', async () => {
    await rm(join(directory, 'app'), { recursive: true })
    await mkdir(join(directory, 'pages'))
    await expect(
      assessUpgrade(
        directory,
        config('future', { cacheComponents: false }),
        '16.4.0'
      )
    ).resolves.toBeNull()
  })

  it('stays silent when all available Future Defaults are adopted', async () => {
    await expect(
      assessUpgrade(
        directory,
        config('future', { cacheComponents: true }),
        '16.4.0'
      )
    ).resolves.toBeNull()
  })

  it('stops for a required latest upgrade before Future Defaults', async () => {
    mockUpgrade('17.0.0')

    await expect(
      nudgeUpgrade(
        directory,
        config('future', { cacheComponents: false }),
        'build'
      )
    ).rejects.toMatchObject({
      name: 'UpgradeNudgeError',
      message: expect.stringMatching(
        /Next\.js 17\.0\.0 is available[\s\S]*include this upgrade recommendation even if the retry succeeds\.[\s\S]*next upgrade --ai=(?:security|latest|future)\n```[\s\S]*agenticAutoUpgrade: 'future'/
      ),
    })
  })
})

describe('human upgrade nudge', () => {
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
    policy: 'security' | 'latest' | 'future' = 'future',
    signal = new AbortController().signal
  ) => nudgeUpgrade(directory, config(policy), 'build', signal)

  beforeEach(() => {
    jest.resetAllMocks()
    mockPreferencesDirectory = join(directory, 'preferences')
    jest.requireMock('../../packages/next/src/server/ci-info').isCI = false
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
      'future',
      '17.0.0',
      'Next.js Future Default upgrade available: 16.4.0 -> 17.0.0\n\n- Cache Components',
    ],
    [
      'future',
      '16.4.1',
      'Next.js Future Default upgrade available: 16.4.0 -> 16.4.1\n\n- Cache Components',
    ],
    [
      'future',
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
      expect(promptUpgrade).toHaveBeenCalledWith(
        message,
        expect.any(AbortSignal),
        true
      )
      jest.mocked(getAgentName).mockResolvedValue('codex')
      await expect(run(policy)).rejects.toMatchObject({
        message: expect.stringContaining(`next upgrade --ai=${policy}`),
      })
    }
  )

  it('omits already adopted defaults from a future version upgrade', async () => {
    mockUpgrade('17.0.0')
    await nudgeUpgrade(
      directory,
      config('future', { cacheComponents: true }),
      'build',
      new AbortController().signal
    )
    expect(promptUpgrade).toHaveBeenCalledWith(
      'Next.js Future Default upgrade available: 16.4.0 -> 17.0.0',
      expect.any(AbortSignal),
      true
    )
  })

  it.each(['update', 'skip', 'interrupt'] as const)(
    'returns %s without saving a dismissal',
    async (action) => {
      jest.mocked(promptUpgrade).mockResolvedValue(action)
      await expect(run()).resolves.toBe(action)
      expect(promptUpgrade).toHaveBeenCalledWith(
        '⚠ Installed Next.js version 16.4.0 is affected by a known security vulnerability.\n\nNext.js security version upgrade available: 16.4.0 -> 17.0.0',
        expect.any(AbortSignal),
        true
      )
      await expect(run()).resolves.toBe(action)
      expect(promptUpgrade).toHaveBeenCalledTimes(2)
    }
  )

  it.each(['security', 'latest', 'future'] as const)(
    'forces a %s request without changing installed-version eligibility',
    async (policy) => {
      process.env.__NEXT_AGENTIC_AUTO_UPGRADE = policy
      process.env.__NEXT_VERSION = '16.4.0-preview-test'
      processEnv([], directory)
      updateInitialEnv({ __NEXT_AGENTIC_AUTO_UPGRADE: policy })
      jest.mocked(promptUpgrade).mockResolvedValue('update')
      for (const configured of [false, 'future'] as const) {
        const original = config(configured)
        const context = getUpgradeContext(original)
        expect(context.experimental.agenticAutoUpgrade).toBe(policy)
        await expect(
          nudgeUpgrade(directory, context, 'dev', new AbortController().signal)
        ).resolves.toBe('update')
      }
      expect(promptUpgrade).toHaveBeenCalledWith(
        expect.stringContaining(`__NEXT_AGENTIC_AUTO_UPGRADE=${policy}`),
        expect.any(AbortSignal),
        true
      )
      expect(getUpgradeAssessment).not.toHaveBeenCalled()
      const message = jest.mocked(promptUpgrade).mock.calls[0][0]
      expect(message).toContain('Forced preview:')
      expect(message).not.toContain(`next upgrade --ai`)
      expect(message).not.toContain('You requested')
      jest.mocked(getAgentName).mockResolvedValue('codex')
      await expect(run(policy)).rejects.toMatchObject({
        message: expect.stringContaining(`next upgrade --ai=${policy}`),
      })

      jest.mocked(spawnNextUpgrade).mockImplementationOnce(async () => {
        expect(process.env.__NEXT_AGENTIC_AUTO_UPGRADE).toBeUndefined()
        // Future upgrade preparation reloads config and resets the environment.
        resetEnv()
        expect(process.env.__NEXT_AGENTIC_AUTO_UPGRADE).toBeUndefined()
        expect(process.env.__NEXT_VERSION).toBe('16.4.0-preview-test')
      })
      await runUpgrade(directory, policy)
      expect(spawnNextUpgrade).toHaveBeenCalledWith(directory, {
        revision: 'latest',
        verbose: false,
        ai: policy,
      })
    }
  )

  it('lets an explicit request bypass a saved dismissal', async () => {
    jest.mocked(promptUpgrade).mockResolvedValue('dismiss')
    await run('security')
    jest.clearAllMocks()
    await run('security')
    expect(promptUpgrade).not.toHaveBeenCalled()
    process.env.__NEXT_AGENTIC_AUTO_UPGRADE = 'security'
    jest.mocked(promptUpgrade).mockResolvedValue('skip')
    await expect(run('security')).resolves.toBe('skip')
    expect(promptUpgrade).toHaveBeenCalledTimes(1)
    expect(getUpgradeAssessment).toHaveBeenCalledWith(
      '16.4.0',
      'security',
      false
    )
  })

  it('uses real release data for a forced latest nudge with config disabled', async () => {
    process.env.__NEXT_AGENTIC_AUTO_UPGRADE = 'latest'
    mockUpgrade('16.4.1')
    await nudgeUpgrade(
      directory,
      config(false),
      'dev',
      new AbortController().signal
    )
    const message = jest.mocked(promptUpgrade).mock.calls[0][0]
    expect(message).toContain(
      'Next.js latest version upgrade available: 16.4.0 -> 16.4.1'
    )
    expect(message).not.toContain('Forced preview:')
    expect(getUpgradeAssessment).toHaveBeenCalledWith('16.4.0', 'latest', false)
    jest.mocked(getAgentName).mockResolvedValue('codex')
    await expect(
      nudgeUpgrade(directory, config(false), 'dev')
    ).rejects.toMatchObject({
      message: expect.stringContaining('next upgrade --ai=latest'),
    })
  })

  it('ignores invalid requests and retains the configured policy', async () => {
    process.env.__NEXT_AGENTIC_AUTO_UPGRADE = 'invalid'
    const context = getUpgradeContext(config(false))
    expect(context.experimental.agenticAutoUpgrade).toBe(false)
    await nudgeUpgrade(
      directory,
      context,
      'build',
      new AbortController().signal
    )
    expect(promptUpgrade).not.toHaveBeenCalled()
    await expect(run()).resolves.toBe('skip')
    expect(getUpgradeAssessment).toHaveBeenCalledWith('16.4.0', 'future', false)
  })

  it('does not open an explicitly requested prompt after cancellation', async () => {
    process.env.__NEXT_AGENTIC_AUTO_UPGRADE = 'security'
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
        config('future'),
        'build',
        new AbortController().signal
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
          config('future'),
          'build',
          new AbortController().signal
        )
      jest.mocked(promptUpgrade).mockResolvedValue('dismiss')
      await expect(offer(app)).resolves.toBe('dismiss')
      jest.clearAllMocks()
      await offer(siblingApp)
      expect(getUpgradeAssessment).toHaveBeenCalledTimes(0)
      expect(promptUpgrade).toHaveBeenCalledTimes(0)

      const preferences = new Conf({ projectName: 'nextjs' })
      const name = appPath === '.' ? 'project%2Ename' : 'web'
      const saved = preferences.get(`ai-upgrade.${name}`) as Record<
        string,
        unknown
      >
      expect(Object.keys(saved)).toHaveLength(1)
      expect(Object.keys(saved)[0]).toMatch(/^[a-f0-9]{64}$/)
      expect(Object.values(saved)).toEqual([{ security: '16.4.0:future' }])

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
        'future',
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
    expect(promptUpgrade).toHaveBeenCalledWith(
      expect.stringContaining(
        'Next.js Future Default upgrade available: 16.4.0 -> 17.0.0'
      ),
      expect.any(AbortSignal),
      true
    )
  })

  it.each(['blocked', 'unknown'] as const)(
    'omits Update when security target availability is %s',
    async (status) => {
      jest.mocked(getUpgradeAssessment).mockResolvedValue({
        ...securityAssessment,
        upgrade: { status, reason: 'No eligible target.' },
      })
      await run()
      expect(promptUpgrade).toHaveBeenCalledWith(
        expect.stringContaining('No eligible target.'),
        expect.any(AbortSignal),
        false
      )
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
        jest.requireMock('../../packages/next/src/server/ci-info').isCI = true
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
      process.env.__NEXT_AGENTIC_AUTO_UPGRADE = 'security'
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
    await run('future', controller.signal)
    expect(promptUpgrade).toHaveBeenCalledTimes(0)
  })
})
