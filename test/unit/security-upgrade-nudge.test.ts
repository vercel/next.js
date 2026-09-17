import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { nudgeForUpgrade } from 'next/dist/lib/upgrade/nudge'
import { getAgentName } from 'next/dist/telemetry/agent-name'
import { getSecurityAdvisory } from 'next/dist/lib/upgrade/prepare-upgrade'
import { warn } from 'next/dist/build/output/log'

jest.mock('next/dist/telemetry/agent-name', () => ({
  getAgentName: jest.fn(),
}))
jest.mock('next/dist/lib/upgrade/prepare-upgrade', () => ({
  getSecurityAdvisory: jest.fn(),
}))
jest.mock('next/dist/build/output/log', () => ({
  warn: jest.fn(),
}))

describe('security upgrade nudge', () => {
  const originalNextVersion = process.env.__NEXT_VERSION
  let directory: string

  const run = (command: 'dev' | 'build' = 'build') =>
    nudgeForUpgrade(
      directory,
      {
        distDir: '.next',
        experimental: { agenticAutoUpgrade: 'security' },
      } as never,
      command
    )

  beforeEach(async () => {
    jest.resetAllMocks()
    directory = await mkdtemp(join(tmpdir(), 'security-upgrade-nudge-'))
    process.env.__NEXT_VERSION = '13.0.0'
    jest.mocked(getAgentName).mockResolvedValue('codex')
    jest.mocked(getSecurityAdvisory).mockResolvedValue(null)
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
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
