import { nudgeIfSecurityUpgradeNeeded } from 'next/dist/lib/upgrade/nudge'
import { getAgentName } from 'next/dist/telemetry/agent-name'
import { getSecurityAdvisorySummary } from 'next/dist/lib/upgrade/prepare-upgrade'
import { warn } from 'next/dist/build/output/log'

jest.mock('next/dist/telemetry/agent-name', () => ({
  getAgentName: jest.fn(),
}))
jest.mock('next/dist/lib/upgrade/prepare-upgrade', () => ({
  getSecurityAdvisorySummary: jest.fn(),
}))
jest.mock('next/dist/build/output/log', () => ({
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

     Run \`next upgrade "/workspace/my app" --agentic\` to automatically upgrade the application.

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

     Run \`next upgrade "/app" --agentic\` to automatically upgrade the application.

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

    await expect(nudgeIfSecurityUpgradeNeeded('/app')).resolves.toBeUndefined()

    expect(jest.mocked(warn).mock.calls).toMatchInlineSnapshot(`
     [
       [
         "Could not check Next.js security advisories. Continuing without an upgrade assessment.",
       ],
     ]
    `)
  })
})
