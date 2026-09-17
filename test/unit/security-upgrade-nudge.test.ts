import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { nudgeForUpgrade } from 'next/dist/lib/upgrade/nudge'
import { getAgentName } from 'next/dist/telemetry/agent-name'
import {
  getLatestUpgradeVersion,
  getSecurityAdvisory,
} from 'next/dist/lib/upgrade/prepare-upgrade'
import { warn } from 'next/dist/build/output/log'

jest.mock('next/dist/telemetry/agent-name', () => ({
  getAgentName: jest.fn(),
}))
jest.mock('next/dist/lib/upgrade/prepare-upgrade', () => ({
  getLatestUpgradeVersion: jest.fn(),
  getSecurityAdvisory: jest.fn(),
}))
jest.mock('next/dist/build/output/log', () => ({
  warn: jest.fn(),
}))

let directory: string

const config = (policy: 'security' | 'latest') =>
  ({
    distDir: '.next',
    experimental: { agenticAutoUpgrade: policy },
  }) as never

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'security-upgrade-nudge-'))
})

afterEach(async () => {
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
    jest.mocked(getSecurityAdvisory).mockResolvedValue(null)
  })

  afterAll(() => {
    if (originalNextVersion === undefined) {
      delete process.env.__NEXT_VERSION
    } else {
      process.env.__NEXT_VERSION = originalNextVersion
    }
  })

  it('shows a security advisory and the upgrade command', async () => {
    jest.mocked(getSecurityAdvisory).mockResolvedValue({
      reference: 'https://api.github.com/advisories?affects=next%4013.0.0',
    })

    await expect(run()).rejects.toMatchObject({
      name: 'SecurityFatalError',
      exitCode: 1,
      message: expect.stringMatching(
        /affected by a published security advisory[\s\S]*\*\*We strongly recommend you upgrade Next\.js\.\*\*[\s\S]*reminder you configured is not missed\. Retry the same command to continue the original task\.[\s\S]*At the end of the task, ask the user whether they want you to run the security upgrade in the background from this app's directory:[\s\S]*```\nnext upgrade --ai\n```/
      ),
    })
    expect(warn).not.toHaveBeenCalled()
  })

  it('shows the npm fallback reference', async () => {
    jest.mocked(getSecurityAdvisory).mockResolvedValue({
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

  it('stays silent when the version is unaffected', async () => {
    await run()

    expect(getSecurityAdvisory).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
  })

  it('stays silent when prerelease security assessment is deferred', async () => {
    jest.mocked(getSecurityAdvisory).mockResolvedValue(null)

    await run()

    expect(warn).not.toHaveBeenCalled()
  })

  it('does not look up advisories or warn outside an agent', async () => {
    jest.mocked(getAgentName).mockResolvedValue(null)

    await run()

    expect(getSecurityAdvisory).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns without rejecting when advisory lookup fails', async () => {
    jest
      .mocked(getSecurityAdvisory)
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
    jest.mocked(getSecurityAdvisory).mockResolvedValue({
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
    jest.mocked(getSecurityAdvisory).mockResolvedValue({
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
    jest.requireActual<
      typeof import('../../packages/next/src/lib/upgrade/prepare-upgrade')
    >('../../packages/next/src/lib/upgrade/prepare-upgrade')

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
  ])(
    'selects %s → %s for a nudge only across major/minor versions',
    async (installed, latest, expected) => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify({ version: latest })))

      await expect(readLatestUpgradeVersion(installed)).resolves.toBe(expected)
    }
  )
})

describe('latest upgrade nudge', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(getAgentName).mockResolvedValue('codex')
    jest.mocked(getSecurityAdvisory).mockResolvedValue(null)
    jest.mocked(getLatestUpgradeVersion).mockResolvedValue(null)
  })

  it('stops once and allows a matching retry with a warning', async () => {
    jest.mocked(getLatestUpgradeVersion).mockResolvedValue('17.0.0')

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

    expect(getLatestUpgradeVersion).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(
        /Next\.js 17\.0\.0 is available\.[\s\S]*continuing after the reminder you configured[\s\S]*registry\.npmjs\.org/
      )
    )
  })

  it('stays silent when there is no newer stable release', async () => {
    await nudgeForUpgrade(directory, config('latest'), 'build')

    expect(getLatestUpgradeVersion).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
  })

  it('does not look up releases or log outside an agent', async () => {
    jest.mocked(getAgentName).mockResolvedValue(null)

    await nudgeForUpgrade(directory, config('latest'), 'build')

    expect(getLatestUpgradeVersion).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('stays silent without rejecting when release lookup fails', async () => {
    jest
      .mocked(getLatestUpgradeVersion)
      .mockRejectedValue(new Error('Registry unavailable'))

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
    jest.mocked(getSecurityAdvisory).mockResolvedValue(null)
    jest.mocked(getLatestUpgradeVersion).mockResolvedValue('16.0.0')
  })

  it('stops on security before latest when both apply', async () => {
    jest.mocked(getSecurityAdvisory).mockResolvedValue({
      reference: 'https://api.github.com/advisories?affects=next%4015.0.0',
    })

    await expect(
      nudgeForUpgrade(directory, config('latest'), 'build')
    ).rejects.toMatchObject({
      name: 'SecurityFatalError',
      exitCode: 1,
      message: expect.stringContaining(
        "experimental.agenticAutoUpgrade: 'latest'"
      ),
    })

    expect(warn).not.toHaveBeenCalled()
    expect(getLatestUpgradeVersion).not.toHaveBeenCalled()
  })
})
