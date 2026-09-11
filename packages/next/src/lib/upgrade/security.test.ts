import { selectSecurityTarget } from './security'
import type { SecuritySnapshot } from './security'

const now = new Date('2026-09-10T12:00:00Z')
const currentVersion = '15.5.23'

function snapshot(ranges = ['>=15.0.0, <15.5.24']): SecuritySnapshot {
  return {
    checkedAt: now.toISOString(),
    evidenceReferences: ['fixture:synthetic'],
    advisories: ranges.map((range) => ({
      ghsa_id: 'fixture-advisory',
      html_url: 'https://example.invalid/advisory',
      withdrawn_at: null,
      vulnerabilities: [
        {
          package: { ecosystem: 'npm', name: 'next' },
          vulnerable_version_range: range,
        },
      ],
    })),
    releases: [
      '14.0.0',
      '14.2.35',
      '15.0.0',
      '15.5.24',
      '15.6.0',
      '16.0.0',
      '16.3.3',
    ].map((version) => ({
      version,
      publishedAt: version.startsWith('14.')
        ? '2023-10-26T00:00:00Z'
        : '2025-10-21T00:00:00Z',
      nodeRange: '>=20.9.0',
    })),
  }
}

describe('security target', () => {
  it('selects the latest safe release without an unnecessary major upgrade', () => {
    expect(
      selectSecurityTarget(currentVersion, snapshot(), now)?.version
    ).toBe('15.6.0')
  })

  it('checks advisories affecting the target even when they do not affect the installed version', () => {
    expect(
      selectSecurityTarget(
        currentVersion,
        snapshot(['<15.5.24', '=15.6.0']),
        now
      )?.version
    ).toBe('16.3.3')
  })

  it('skips a safe release when its major is no longer supported', () => {
    expect(
      selectSecurityTarget('14.2.34', snapshot(['<14.2.35']), now)?.version
    ).toBe('15.6.0')
  })

  it('does not upgrade unaffected apps or act on withdrawn advisories', () => {
    const data = snapshot()
    data.advisories[0].withdrawn_at = now.toISOString()

    expect(selectSecurityTarget(currentVersion, data, now)).toBeUndefined()
    expect(selectSecurityTarget('16.3.3', snapshot(), now)).toBeUndefined()
  })

  it.each(['not a range', ''])('blocks invalid affected ranges: %s', (range) => {
    expect(() =>
      selectSecurityTarget(currentVersion, snapshot([range]), now)
    ).toThrow(/affected range/)
  })

  it('blocks when no supported release clears every advisory', () => {
    expect(() =>
      selectSecurityTarget(currentVersion, snapshot(['*']), now)
    ).toThrow('No supported stable Next.js target')
  })
})
