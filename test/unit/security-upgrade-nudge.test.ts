import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { getFutureUpgrade, nudgeForUpgrade } from 'next/dist/lib/upgrade/nudge'
import { getAgentName } from 'next/dist/telemetry/agent-name'
import { getUpgradeAssessment } from 'next/dist/lib/upgrade/prepare-upgrade'
import { warn } from 'next/dist/build/output/log'

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

const config = (
  policy: 'security' | 'latest' | 'future',
  values: Record<string, unknown> = {}
) =>
  ({
    ...values,
    distDir: '.next',
    experimental: { agenticAutoUpgrade: policy },
  }) as never

beforeEach(async () => {
  process.env.__NEXT_VERSION = '16.4.0'
  directory = await mkdtemp(join(tmpdir(), 'security-upgrade-nudge-'))
})

afterEach(async () => {
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
    nudgeForUpgrade(directory, config('security'), command)

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
        /affected by a published security advisory[\s\S]*\*\*We strongly recommend you upgrade Next\.js\.\*\*[\s\S]*reminder you configured is not missed\. Retry the same command to continue the original task\.[\s\S]*At the end of the task, ask the user whether they want you to run the upgrade using the configured 'security' policy in the background from this app's directory:[\s\S]*```\nnext upgrade --ai\n```/
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
        nudgeForUpgrade(directory, config(policy), 'build')
      ).rejects.toMatchObject({
        name: 'UpgradeNudgeError',
        message: expect.stringContaining(
          'Reference: https://registry.npmjs.org/next/canary'
        ),
      })
      await expect(
        nudgeForUpgrade(directory, config(policy), 'build')
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
      nudgeForUpgrade(directory, config('latest'), 'build')
    ).rejects.toMatchObject({
      name: 'UpgradeNudgeError',
      exitCode: 1,
      message: expect.stringMatching(
        /Next\.js 17\.0\.0 is available\.[\s\S]*\*\*We recommend you upgrade Next\.js\.\*\*[\s\S]*reminder you configured is not missed\. Retry the same command to continue the original task\.[\s\S]*At the end of the task, ask the user whether they want you to run the latest upgrade in the background from this app's directory:[\s\S]*```\nnext upgrade --ai\n```[\s\S]*registry\.npmjs\.org[\s\S]*agenticAutoUpgrade: 'latest'/
      ),
    })
    await expect(
      nudgeForUpgrade(directory, config('latest'), 'build')
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
        nudgeForUpgrade(
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
    await nudgeForUpgrade(directory, config('latest'), 'build')

    expect(getUpgradeAssessment).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
  })

  it('does not look up releases or log outside an agent', async () => {
    jest.mocked(getAgentName).mockResolvedValue(null)

    await nudgeForUpgrade(directory, config('latest'), 'build')

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
      nudgeForUpgrade(directory, config('latest'), 'build')
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

      const nudge = nudgeForUpgrade(directory, config(policy), 'build')
      await expect(nudge).rejects.toMatchObject({
        name: 'SecurityFatalError',
        exitCode: 1,
        message: expect.stringContaining('```\nnext upgrade --ai\n```'),
      })
      await expect(nudge).rejects.toMatchObject({
        message: expect.stringContaining(
          `experimental.agenticAutoUpgrade: '${policy}'`
        ),
      })

      expect(getUpgradeAssessment).toHaveBeenCalledWith(
        expect.any(String),
        policy
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
        getFutureUpgrade(config('future', { cacheComponents: false }), version)
      ).resolves.toBeNull()
    }
  )

  it('offers available defaults on canary without a version reminder', async () => {
    await expect(
      getFutureUpgrade(
        config('future', { cacheComponents: false }),
        '16.4.0-canary.1'
      )
    ).resolves.toEqual({
      installedVersion: '16.4.0-canary.1',
      names: ['Cache Components'],
    })
  })

  it('does not remind about defaults already adopted on canary', async () => {
    await expect(
      getFutureUpgrade(
        config('future', { cacheComponents: true }),
        '16.4.0-canary.1'
      )
    ).resolves.toBeNull()
  })

  it('offers canary Future adoption when advisory assessment is skipped', async () => {
    process.env.__NEXT_VERSION = '17.2.0-canary.4'
    mockUpgrade()
    await expect(
      nudgeForUpgrade(
        directory,
        config('future', { cacheComponents: false }),
        'build'
      )
    ).rejects.toMatchObject({
      name: 'UpgradeNudgeError',
      message: expect.stringContaining(
        'We recommend you adopt these Future Defaults.'
      ),
    })
    expect(getUpgradeAssessment).toHaveBeenCalledTimes(1)
  })

  it('names available Future Defaults using the adapter', async () => {
    await expect(
      getFutureUpgrade(config('future', { cacheComponents: false }), '16.4.0')
    ).resolves.toEqual({
      installedVersion: '16.4.0',
      names: ['Cache Components'],
    })
  })

  it('stays silent when all available Future Defaults are adopted', async () => {
    await expect(
      getFutureUpgrade(config('future', { cacheComponents: true }), '16.4.0')
    ).resolves.toBeNull()
  })

  it('stops for a required latest upgrade before Future Defaults', async () => {
    mockUpgrade('17.0.0')

    await expect(
      nudgeForUpgrade(
        directory,
        config('future', { cacheComponents: false }),
        'build'
      )
    ).rejects.toMatchObject({
      name: 'UpgradeNudgeError',
      message: expect.stringMatching(
        /Next\.js 17\.0\.0 is available[\s\S]*next upgrade --ai\n```[\s\S]*agenticAutoUpgrade: 'future'/
      ),
    })
  })
})
