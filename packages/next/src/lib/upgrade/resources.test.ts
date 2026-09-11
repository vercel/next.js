import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { prepareUpgradeResources, selectGuidePaths } from './resources'
import type { UpgradeResolution } from './types'

const appGuide = (major: number) =>
  `01-app/02-guides/upgrading/version-${major}.mdx`
const codemods = '01-app/02-guides/upgrading/codemods.mdx'
const guides = [appGuide(14), appGuide(15), appGuide(16), codemods]

describe('upgrade resources', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'upgrade-resources-test-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('selects intervening major guides and shared canonical content for Pages', () => {
    expect(selectGuidePaths(guides, '14.2.35', '16.3.3', ['app'])).toEqual([
      codemods,
      appGuide(15),
      appGuide(16),
    ])
    expect(selectGuidePaths(guides, '15.5.23', '15.5.24', ['pages'])).toEqual([
      codemods,
      appGuide(15),
    ])
    expect(() =>
      selectGuidePaths([codemods], '15.5.23', '16.3.3', ['app'])
    ).toThrow('Missing')
  })
  async function prepareFixture() {
    const docs = join(root, 'bundled')
    for (const file of guides) {
      await mkdir(join(docs, file, '..'), { recursive: true })
      await writeFile(
        join(docs, file),
        `Complete canonical contents of ${file}`
      )
    }
    const workflowPath = join(root, 'workflow.md')
    await writeFile(
      workflowPath,
      'Check repository preflight, then read security-migration.md.'
    )
    const migrationWorkflowPath = join(root, 'migration.md')
    await writeFile(
      migrationWorkflowPath,
      'Follow context.json and finish required repairs.'
    )
    const upgrade: Extract<UpgradeResolution, { status: 'ready' }> = {
      status: 'ready',
      app: {
        directory: '/app',
        nextVersion: '14.2.35',
        reactVersion: '18.3.1',
        reactDomVersion: '18.3.1',
        routers: ['app'],
        packageManager: 'pnpm',
        config: { experimental: { agenticAutoUpgrade: 'security' } },
        manifestPath: '/app/package.json',
        manifestHash: 'baseline',
      },
      target: { nextVersion: '16.3.3', reason: 'Fixture security migration' },
      tools: {
        invokingNextVersion: '16.4.0-canary.25',
        codemodVersion: '16.4.0-canary.25',
        command: 'pnpm',
        args: [
          'dlx',
          '@next/codemod@16.4.0-canary.25',
          'upgrade',
          '16.3.3',
          '--yes',
        ],
      },
      snapshot: {
        complete: true,
        checkedAt: '2026-09-10T00:00:00Z',
        advisories: [],
        releases: [],
        evidenceReferences: ['fixture:synthetic'],
      },
    }
    return {
      upgrade,
      options: {
        tempRoot: root,
        docsRoot: docs,
        workflowPath,
        migrationWorkflowPath,
        sourceRevision: 'fixture-commit',
        fetchDocs: jest.fn(),
      },
    }
  }
  it('retains complete relevant docs, original paths and context after package replacement', async () => {
    const { upgrade, options } = await prepareFixture()
    const packet = await prepareUpgradeResources(upgrade, options)
    await rm(options.docsRoot, { recursive: true })
    await rm(options.workflowPath)
    await rm(options.migrationWorkflowPath)
    expect(await readFile(packet.workflowPath, 'utf8')).toContain(
      'security-migration.md'
    )
    expect(
      await readFile(
        join(packet.context.runDirectory, 'security-migration.md'),
        'utf8'
      )
    ).toContain('required repairs')
    expect(
      await readFile(join(packet.context.docs.root, appGuide(16)), 'utf8')
    ).toBe(`Complete canonical contents of ${appGuide(16)}`)
    expect(
      packet.context.docs.sources.every(
        (source) => source.sourceRevision === 'fixture-commit'
      )
    ).toBe(true)
    expect(packet.context.dryRun).toBe(false)
    expect(packet.prompt).not.toContain('This is a --dry-run')
    expect(packet.context.baseline.manifestHash).toBe('baseline')
    expect(JSON.parse(await readFile(packet.contextPath, 'utf8'))).toEqual(
      JSON.parse(JSON.stringify(packet.context))
    )
    expect(packet.context.docs.guides).not.toContain(appGuide(14))
    expect(options.fetchDocs).not.toHaveBeenCalled()
  })
  it('retains the local-commit delivery limit in the context and agent handoff', async () => {
    const { upgrade, options } = await prepareFixture()
    const packet = await prepareUpgradeResources(upgrade, {
      ...options,
      dryRun: true,
    })
    expect(packet.context.dryRun).toBe(true)
    expect(JSON.parse(await readFile(packet.contextPath, 'utf8')).dryRun).toBe(
      true
    )
    expect(packet.prompt).toContain('create local commits, then stop')
    expect(packet.prompt).toContain('Do not push or create a PR/MR')
    expect(packet.context.tools).toEqual(upgrade.tools)
  })
  it('fails honestly and removes only its partial packet when required guides cannot be fetched', async () => {
    const { upgrade, options } = await prepareFixture()
    await rm(join(options.docsRoot, appGuide(16)))
    options.fetchDocs.mockRejectedValue(new Error('Target docs unavailable'))
    await expect(prepareUpgradeResources(upgrade, options)).rejects.toThrow(
      'Target docs unavailable'
    )
    expect(
      (await readdir(root)).filter((name) => name.startsWith('next-upgrade-'))
    ).toEqual([])
    expect(await readFile(options.workflowPath, 'utf8')).toContain('preflight')
  })
})
