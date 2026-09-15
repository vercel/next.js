import {
  nudgeIfUpgradeNeeded,
  nudgeIfLatestUpgradeNeeded,
  nudgeIfSecurityUpgradeNeeded,
} from 'next/dist/lib/upgrade/nudge'
import { getAgentName } from 'next/dist/telemetry/agent-name'
import {
  getLatestUpgradeVersion,
  getSecurityAdvisorySummary,
} from 'next/dist/lib/upgrade/prepare-upgrade'
import { info, warn } from 'next/dist/build/output/log'

jest.mock('next/dist/telemetry/agent-name', () => ({
  getAgentName: jest.fn(),
}))
jest.mock('next/dist/lib/upgrade/prepare-upgrade', () => ({
  getLatestUpgradeVersion: jest.fn(),
  getSecurityAdvisorySummary: jest.fn(),
}))
jest.mock('next/dist/build/output/log', () => ({
  info: jest.fn(),
  warn: jest.fn(),
}))
jest.mock('next/dist/lib/picocolors', () => ({
  // Keep emphasis visible in snapshots independently of terminal color support.
  bold: (text: string) => `**${text}**`,
}))

describe('security upgrade nudge', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(getAgentName).mockResolvedValue('codex')
    jest.mocked(getSecurityAdvisorySummary).mockResolvedValue({
      counts: { critical: 0, high: 0, moderate: 0, low: 0, unknown: 0 },
      reference: 'https://api.github.com/advisories?affects=next%4013.0.0',
    })
  })

  it('shows one advisory and preserves an app directory containing spaces', async () => {
    jest.mocked(getSecurityAdvisorySummary).mockResolvedValue({
      counts: { critical: 1, high: 0, moderate: 0, low: 0, unknown: 0 },
      reference: 'https://api.github.com/advisories?affects=next%4013.0.0',
    })

    await nudgeIfSecurityUpgradeNeeded('/workspace/my app')

    expect(jest.mocked(warn).mock.calls).toMatchInlineSnapshot(`
     [
       [
         "Your version of Next.js is affected by 1 CRITICAL published
     security advisory and can be automatically upgraded.

     We **strongly recommend** you upgrade Next.js.

     Run \`next upgrade "/workspace/my app" --ai\` to upgrade when you're ready.

     Reference: https://api.github.com/advisories?affects=next%4013.0.0

     Note: This reminder is enabled by \`experimental.agenticAutoUpgrade: 'security'\`.",
       ],
     ]
    `)
  })

  it('shows multiple severity counts with the npm fallback reference', async () => {
    jest.mocked(getSecurityAdvisorySummary).mockResolvedValue({
      counts: { critical: 1, high: 1, moderate: 0, low: 0, unknown: 1 },
      reference: 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',
    })

    await nudgeIfSecurityUpgradeNeeded('/app')

    expect(jest.mocked(warn).mock.calls).toMatchInlineSnapshot(`
     [
       [
         "Your version of Next.js is affected by 1 CRITICAL, 1 HIGH, and 1 UNKNOWN SEVERITY published
     security advisories and can be automatically upgraded.

     We **strongly recommend** you upgrade Next.js.

     Run \`next upgrade "/app" --ai\` to upgrade when you're ready.

     Reference: https://registry.npmjs.org/-/npm/v1/security/advisories/bulk

     Note: This reminder is enabled by \`experimental.agenticAutoUpgrade: 'security'\`.",
       ],
     ]
    `)
  })

  it('stays silent when the version is unaffected', async () => {
    await nudgeIfSecurityUpgradeNeeded('/app')

    expect(getSecurityAdvisorySummary).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
  })

  it('stays silent when prerelease security assessment is deferred', async () => {
    jest.mocked(getSecurityAdvisorySummary).mockResolvedValue(null)

    await nudgeIfSecurityUpgradeNeeded('/app')

    expect(warn).not.toHaveBeenCalled()
  })

  it('does not look up advisories or warn outside an agent', async () => {
    jest.mocked(getAgentName).mockResolvedValue(null)

    await nudgeIfSecurityUpgradeNeeded('/app')

    expect(getSecurityAdvisorySummary).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns without rejecting when advisory lookup fails', async () => {
    jest
      .mocked(getSecurityAdvisorySummary)
      .mockRejectedValue(new Error('Advisory service unavailable'))

    await expect(nudgeIfSecurityUpgradeNeeded('/app')).resolves.toBe(true)

    expect(jest.mocked(warn).mock.calls).toMatchInlineSnapshot(`
     [
       [
         "Could not check Next.js security advisories. Continuing without an upgrade assessment.",
       ],
     ]
    `)
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
    jest.mocked(getLatestUpgradeVersion).mockResolvedValue(null)
  })

  it('shows an informational reminder with the app policy and upgrade command', async () => {
    jest.mocked(getLatestUpgradeVersion).mockResolvedValue('16.0.0')

    await nudgeIfLatestUpgradeNeeded('/workspace/my app', '15.0.0')

    expect(getLatestUpgradeVersion).toHaveBeenCalledWith('15.0.0')
    expect(warn).not.toHaveBeenCalled()
    expect(jest.mocked(info).mock.calls).toMatchInlineSnapshot(`
     [
       [
         "Next.js 16.0.0 is available. You're using 15.0.0.
     Run \`next upgrade "/workspace/my app" --ai\` to upgrade when you're ready.

     Reference: https://registry.npmjs.org/next/latest

     Note: This reminder is enabled by \`experimental.agenticAutoUpgrade: 'latest'\`.",
       ],
     ]
    `)
  })

  it('stays silent when there is no newer stable release', async () => {
    await nudgeIfLatestUpgradeNeeded('/app', '15.0.0')

    expect(getLatestUpgradeVersion).toHaveBeenCalledWith('15.0.0')
    expect(info).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('does not look up releases or log outside an agent', async () => {
    jest.mocked(getAgentName).mockResolvedValue(null)

    await nudgeIfLatestUpgradeNeeded('/app', '15.0.0')

    expect(getLatestUpgradeVersion).not.toHaveBeenCalled()
    expect(info).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('stays silent without rejecting when release lookup fails', async () => {
    jest
      .mocked(getLatestUpgradeVersion)
      .mockRejectedValue(new Error('Registry unavailable'))

    await expect(nudgeIfLatestUpgradeNeeded('/app', '15.0.0')).resolves.toBe(
      false
    )

    expect(info).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('composed latest nudge', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(getAgentName).mockResolvedValue('codex')
    jest.mocked(getSecurityAdvisorySummary).mockResolvedValue({
      counts: { critical: 0, high: 0, moderate: 0, low: 0, unknown: 0 },
      reference: 'https://api.github.com/advisories?affects=next%4015.0.0',
    })
    jest.mocked(getLatestUpgradeVersion).mockResolvedValue('16.0.0')
  })

  it('shows security instead of latest when both apply', async () => {
    jest.mocked(getSecurityAdvisorySummary).mockResolvedValue({
      counts: { critical: 1, high: 0, moderate: 0, low: 0, unknown: 0 },
      reference: 'https://api.github.com/advisories?affects=next%4015.0.0',
    })

    await nudgeIfUpgradeNeeded('/app', 'latest')

    expect(warn).toHaveBeenCalledTimes(1)
    expect(getLatestUpgradeVersion).not.toHaveBeenCalled()
    expect(info).not.toHaveBeenCalled()
  })

  it('shows latest when no security warning applies', async () => {
    await nudgeIfUpgradeNeeded('/app', 'latest')

    expect(warn).not.toHaveBeenCalled()
    expect(getLatestUpgradeVersion).toHaveBeenCalled()
    expect(info).toHaveBeenCalledTimes(1)
  })
})
