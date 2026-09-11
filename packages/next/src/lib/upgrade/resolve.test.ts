import {
  resolveUpgrade,
  checkCodemod,
  hasUpgradeConfig,
} from './resolve'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  affectedRanges,
  fetchJSON,
  readSecuritySnapshot,
  selectSecurityTarget,
} from './security'
import { CONFIG_FILES } from '../../shared/lib/constants'
import type { UpgradeApp, UpgradeDependencies } from './resolve'
import type { Advisory, SecuritySnapshot } from './security'

const now = new Date('2026-09-10T12:00:00Z')
const config = { experimental: { agenticAutoUpgrade: 'security' as const } }
const app: UpgradeApp = {
  directory: '/app',
  nextVersion: '15.5.23',
  reactVersion: '18.3.1',
  reactDomVersion: '18.3.1',
  routers: ['pages'],
  packageManager: 'pnpm',
  config,
  manifestPath: '/app/package.json',
  manifestHash: 'original-manifest',
}
function advisory(range: string): Advisory {
  return {
    ghsa_id: 'fixture-advisory',
    html_url: 'https://example.invalid/advisory',
    withdrawn_at: null,
    vulnerabilities: [
      {
        package: { ecosystem: 'npm', name: 'next' },
        vulnerable_version_range: range,
      },
    ],
  }
}
function snapshot(ranges = ['>=15.0.0, <15.5.24']): SecuritySnapshot {
  return {
    complete: true,
    checkedAt: now.toISOString(),
    evidenceReferences: ['fixture:synthetic'],
    advisories: ranges.map(advisory),
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
      engines: { node: '>=20.9.0' },
      peerDependencies: {
        react: '^18.3.1 || ^19.0.0',
        'react-dom': '^18.3.1 || ^19.0.0',
      },
    })),
  }
}
function dependencies(): UpgradeDependencies {
  return {
    now: () => now,
    hasConfig: jest.fn(async () => true),
    nodeVersion: '22.0.0',
    invokingNextVersion: '16.4.0-canary.25',
    loadConfig: jest.fn(async () => config),
    readApp: jest.fn(async () => app),
    readSecurity: jest.fn(async () => snapshot()),
    resolveRevision: jest.fn(async () => '16.3.3'),
    resolveCodemod: jest.fn(async () => '16.4.0-canary.25'),
    getRunner: jest.fn(() => ['pnpm', 'dlx']),
    checkCodemod: jest.fn(async () => {}),
  }
}

describe('codemod compatibility diagnostics', () => {
  it('retains stdout and stderr from a failed probe in the blocked result', async () => {
    const result = await resolveUpgrade(
      { directory: '/app' },
      {
        ...dependencies(),
        getRunner: () => [
          process.execPath,
          '--silent',
          '-e',
          "process.stdout.write('Package download failed'); process.stderr.write('Registry unavailable'); process.exit(42)",
          '--',
        ],
        checkCodemod,
      }
    )
    expect(result).toMatchObject({
      status: 'blocked',
      reason: expect.stringContaining('exit code 42'),
    })
    if (result.status !== 'blocked') throw new Error('Expected a blocker')
    expect(result.reason).toContain('Package download failed')
    expect(result.reason).toContain('Registry unavailable')
    expect(result.reason).toContain('retry next upgrade --agent')
  })

  it('reports a missing runner rather than a missing codemod option', async () => {
    await expect(
      checkCodemod('/nonexistent/next-upgrade-package-runner', [])
    ).rejects.toThrow('ENOENT')
  })

  it('distinguishes a successful probe with unsupported options', async () => {
    await expect(
      checkCodemod(process.execPath, [
        '-e',
        "process.stdout.write('Usage: upgrade --yes')",
        '--',
      ])
    ).rejects.toThrow('does not support --skip-adoption')
  })
})

describe('security target', () => {
  it('selects the latest release of the first supported safe major, not the first patch', () => {
    expect(
      selectSecurityTarget(app.nextVersion, snapshot(), now)?.version
    ).toBe('15.6.0')
  })
  it('does not fall back to an older release of a major whose latest is affected', () => {
    expect(
      selectSecurityTarget(
        app.nextVersion,
        snapshot(['<15.5.24', '=15.6.0']),
        now
      )?.version
    ).toBe('16.3.3')
  })
  it('crosses majors only when needed and excludes expired support', () => {
    expect(
      selectSecurityTarget('14.2.34', snapshot(['<14.2.35']), now)?.version
    ).toBe('15.6.0')
    expect(
      selectSecurityTarget('14.2.35', snapshot(['<16']), now)?.version
    ).toBe('16.3.3')
  })
  it('treats withdrawn advisories as withdrawn and unaffected apps as no-ops', () => {
    const data = snapshot()
    data.advisories[0].withdrawn_at = now.toISOString()
    expect(selectSecurityTarget(app.nextVersion, data, now)).toBeUndefined()
    expect(selectSecurityTarget('16.3.3', snapshot(), now)).toBeUndefined()
  })
  it.each(['not a range', ''])(
    'rejects incomplete range evidence: %s',
    (range) => {
      expect(() => affectedRanges([advisory(range)])).toThrow()
    }
  )
  it('excludes other packages without excluding relevant Next findings', () => {
    const unrelated = advisory('*')
    unrelated.vulnerabilities[0].package.name = 'react'
    expect(affectedRanges([unrelated, advisory('>=15, <16')])).toEqual([
      '>=15 <16',
    ])
  })
  it('blocks when no stable supported release clears every finding', () => {
    expect(() =>
      selectSecurityTarget(app.nextVersion, snapshot(['*']), now)
    ).toThrow('No supported')
  })
  it('does not choose a canary', () => {
    const data = snapshot()
    data.releases.push({
      version: '15.7.0-canary.1',
      publishedAt: '2026-09-01T00:00:00Z',
    })
    expect(selectSecurityTarget(app.nextVersion, data, now)?.version).toBe(
      '15.6.0'
    )
  })
})

describe('upgrade resolution', () => {
  it('returns before configuration, packages or network when the selected directory has no config', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'upgrade-monorepo-'))
    try {
      const selected = join(directory, 'apps', 'web')
      mkdirSync(selected, { recursive: true })
      writeFileSync(join(selected, 'next.config.js'), 'module.exports = {}')
      const deps = {
        ...dependencies(),
        hasConfig: jest.fn(hasUpgradeConfig),
      }
      expect(await resolveUpgrade({ directory }, deps)).toMatchObject({
        status: 'disabled',
        reason: expect.stringContaining('next upgrade <app-directory> --agent'),
      })
      expect(deps.loadConfig).not.toHaveBeenCalled()
      expect(deps.readApp).not.toHaveBeenCalled()
      expect(deps.readSecurity).not.toHaveBeenCalled()
      expect(deps.resolveCodemod).not.toHaveBeenCalled()
      expect(deps.checkCodemod).not.toHaveBeenCalled()

      expect(await resolveUpgrade({ directory: selected }, deps)).toMatchObject(
        { status: 'ready' }
      )
      expect(deps.loadConfig).toHaveBeenCalledWith(selected)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it.each(CONFIG_FILES)(
    'recognizes %s only when it is a file',
    async (name) => {
      const directory = mkdtempSync(join(tmpdir(), 'upgrade-config-'))
      try {
        const location = join(directory, name)
        mkdirSync(location)
        expect(await hasUpgradeConfig(directory)).toBe(false)
        rmSync(location, { recursive: true })
        writeFileSync(location, 'export default {}')
        expect(await hasUpgradeConfig(directory)).toBe(true)
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    }
  )

  it('does not use a parent config or unsupported config extension', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'upgrade-config-'))
    try {
      writeFileSync(join(directory, 'next.config.js'), 'module.exports = {}')
      const selected = join(directory, 'apps', 'web')
      mkdirSync(selected, { recursive: true })
      writeFileSync(join(selected, 'next.config.json'), '{}')
      expect(await hasUpgradeConfig(selected)).toBe(false)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('returns disabled before installed packages, network or tool resolution', async () => {
    const deps = dependencies()
    expect(
      await resolveUpgrade(
        { directory: '/app', config: { directory: '/app', value: {} } },
        deps
      )
    ).toMatchObject({ status: 'disabled' })
    expect(deps.hasConfig).not.toHaveBeenCalled()
    expect(deps.readApp).not.toHaveBeenCalled()
    expect(deps.readSecurity).not.toHaveBeenCalled()
    expect(deps.checkCodemod).not.toHaveBeenCalled()
  })
  it('reuses supplied values and pins one exact noninteractive command', async () => {
    const deps = dependencies()
    const result = await resolveUpgrade(
      { directory: '/app', app, snapshot: snapshot() },
      deps
    )
    expect(result).toMatchObject({
      status: 'ready',
      target: { nextVersion: '15.6.0' },
      tools: {
        command: 'pnpm',
        args: [
          'dlx',
          '@next/codemod@16.4.0-canary.25',
          'upgrade',
          '15.6.0',
          '--yes',
          '--skip-adoption',
        ],
      },
    })
    expect(deps.loadConfig).not.toHaveBeenCalled()
    expect(deps.readApp).not.toHaveBeenCalled()
    expect(deps.readSecurity).not.toHaveBeenCalled()
  })
  it('blocks a conflicting target and stale or foreign context before tool execution', async () => {
    const deps = dependencies()
    for (const input of [
      { directory: '/app', target: '16.3.3' },
      { directory: '/other', app },
      {
        directory: '/app',
        snapshot: { ...snapshot(), checkedAt: '2026-09-09T00:00:00Z' },
      },
    ])
      expect(await resolveUpgrade(input, deps)).toMatchObject({
        status: 'blocked',
      })
    expect(deps.checkCodemod).not.toHaveBeenCalled()
  })
  it('reports unsupported Node and missing codemod controls as blockers', async () => {
    expect(
      await resolveUpgrade(
        { directory: '/app' },
        { ...dependencies(), nodeVersion: '18.0.0' }
      )
    ).toMatchObject({ status: 'blocked' })
    expect(
      await resolveUpgrade(
        { directory: '/app' },
        {
          ...dependencies(),
          checkCodemod: async () => {
            throw new Error('Missing --skip-adoption')
          },
        }
      )
    ).toMatchObject({ status: 'blocked', reason: 'Missing --skip-adoption' })
  })
})

describe('advisory pagination', () => {
  const originalFetch = global.fetch
  afterEach(() => {
    global.fetch = originalFetch
  })

  it('identifies the endpoint and timeout after the bounded retry', async () => {
    const cause = new Error('The operation was aborted due to timeout')
    cause.name = 'TimeoutError'
    global.fetch = jest.fn().mockRejectedValue(cause)
    const url = 'https://registry.npmjs.org/next'
    await expect(fetchJSON(url)).rejects.toMatchObject({
      cause,
      message: expect.stringContaining(
        `after 2 attempts.\nURL: ${url}\nCause: Request timed out (10-second limit per attempt).`
      ),
    })
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('recovers when the second metadata request succeeds', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
    await expect(
      fetchJSON('https://registry.npmjs.org/next')
    ).resolves.toMatchObject({
      value: { ok: true },
    })
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
  it('reads all pages before resolving registry evidence', async () => {
    const next =
      'https://api.github.com/advisories?ecosystem=npm&affects=next&type=reviewed&per_page=100&page=2'
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([advisory('<15')]), {
          headers: { link: `<${next}>; rel="next"` },
        })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([advisory('<16')])))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            versions: { '16.0.0': { version: '16.0.0' } },
            time: { '16.0.0': '2025-10-21T00:00:00Z' },
          })
        )
      )
    global.fetch = fetchMock
    expect((await readSecuritySnapshot()).advisories).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
  it('blocks an incomplete or redirected page instead of using partial evidence', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response('[]', {
        headers: { link: '<https://example.invalid/page>; rel="next"' },
      })
    )
    await expect(readSecuritySnapshot()).rejects.toThrow(
      'Invalid advisory pagination'
    )
  })
})

describe('npm advisory fallback', () => {
  const originalFetch = global.fetch
  const registry = {
    versions: {
      '15.0.0': { version: '15.0.0' },
      '15.1.0': { version: '15.1.0' },
      '16.0.0-canary.1': { version: '16.0.0-canary.1' },
    },
    time: { '15.0.0': '2025-01-01', '15.1.0': '2025-02-01' },
  }
  const npmFinding = {
    id: 123,
    url: 'https://github.com/advisories/GHSA-abcd-efgh-ijkl',
    vulnerable_versions: '<15.1.0',
  }
  const response = (value: unknown) => new Response(JSON.stringify(value))
  afterEach(() => {
    global.fetch = originalFetch
  })

  it('falls back after rate limiting and queries candidate versions too', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(response(registry))
      .mockResolvedValueOnce(
        response({
          next: [
            npmFinding,
            {
              ...npmFinding,
              id: 124,
              vulnerable_versions: '>=15.1.0 <16',
            },
          ],
        })
      )
    global.fetch = fetchMock
    const evidence = await readSecuritySnapshot()
    expect(affectedRanges(evidence.advisories)).toEqual([
      '<15.1.0',
      '>=15.1.0 <16',
    ])
    expect(() => selectSecurityTarget('15.0.0', evidence, new Date())).toThrow(
      'No supported stable'
    )
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ next: Object.keys(registry.versions) }),
      })
    )
    expect(evidence.evidenceReferences).toEqual([
      'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',
      'https://registry.npmjs.org/next',
    ])
  })

  it('discards partial GitHub results when a later page fails', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([advisory('*')]), {
          headers: {
            link: '<https://api.github.com/advisories?ecosystem=npm&affects=next&type=reviewed&page=2>; rel="next"',
          },
        })
      )
      .mockResolvedValueOnce(new Response('', { status: 403 }))
      .mockResolvedValueOnce(response(registry))
      .mockResolvedValueOnce(response({ next: [npmFinding] }))
    expect(affectedRanges((await readSecuritySnapshot()).advisories)).toEqual([
      '<15.1.0',
    ])
  })

  it('accepts an empty npm response as no known advisories', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 403 }))
      .mockResolvedValueOnce(response(registry))
      .mockResolvedValueOnce(response({}))
    const evidence = await readSecuritySnapshot()
    expect(selectSecurityTarget('15.0.0', evidence, new Date())).toBeUndefined()
  })

  it.each([
    null,
    [],
    { next: null },
    { next: [{}] },
    { next: [{ ...npmFinding, vulnerable_versions: 'unknown' }] },
    { other: [] },
  ])('blocks malformed fallback evidence: %j', async (value) => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 403 }))
      .mockResolvedValueOnce(response(registry))
      .mockResolvedValueOnce(response(value))
    await expect(readSecuritySnapshot()).rejects.toThrow(
      'npm advisory fallback failed'
    )
  })

  it('reports both failures when neither advisory service is available', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 403 }))
      .mockResolvedValueOnce(response(registry))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
    await expect(readSecuritySnapshot()).rejects.toThrow(
      /GitHub advisory lookup failed:[\s\S]*HTTP 403[\s\S]*npm advisory fallback failed:[\s\S]*HTTP 503/
    )
  })
})
