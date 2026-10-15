import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'fs/promises'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import {
  readSourceDependencyAsset,
  selectSourceRelatedProjects,
  findChangedTestSources,
  type SourceSelectionPlan,
} from 'next/dist/experimental/testing/incremental/source-selection'
import type { DiscoveredTestProject } from 'next/dist/experimental/testing/discovery'
import {
  selectAffectedTests,
  type DependencyChange,
  type SelectionInput,
} from 'next/dist/experimental/testing/incremental/select-affected'

const baseline: SelectionInput = {
  entryIds: ['unit', 'rsc', 'browser'],
  previousEntryIds: ['unit', 'rsc', 'browser'],
  discoveryRevision: 'config-and-entries-1',
}

function change(overrides: Partial<DependencyChange> = {}): DependencyChange {
  return {
    revision: 'compiler-2',
    discoveryRevision: baseline.discoveryRevision,
    affectedEntryIds: ['rsc'],
    complete: true,
    ...overrides,
  }
}

describe('compiler-backed affected selection', () => {
  it('selects only compiler-reported consumers when coverage is complete', () => {
    expect(selectAffectedTests({ ...baseline, changes: [change()] })).toEqual({
      entryIds: ['rsc'],
      reason: 'compiler-dependencies',
    })
  })

  it('unions all pending compiler changes in discovery order', () => {
    expect(
      selectAffectedTests({
        ...baseline,
        changes: [
          change({ affectedEntryIds: ['browser', 'browser'] }),
          change({ revision: 'compiler-3', affectedEntryIds: ['unit'] }),
        ],
      }).entryIds
    ).toEqual(['unit', 'browser'])
  })

  it('adds newly discovered tests and drops deleted tests', () => {
    expect(
      selectAffectedTests({
        ...baseline,
        entryIds: ['unit', 'new', 'browser'],
        changes: [change()],
      }).entryIds
    ).toEqual(['new'])
  })

  it('runs the initial discovery even without pending changes', () => {
    expect(
      selectAffectedTests({ ...baseline, previousEntryIds: [], changes: [] })
        .entryIds
    ).toEqual(baseline.entryIds)
  })

  it('can omit unaffected tests only with available dependency evidence', () => {
    expect(selectAffectedTests({ ...baseline, changes: [] }).entryIds).toEqual(
      []
    )
    expect(selectAffectedTests(baseline)).toEqual({
      entryIds: baseline.entryIds,
      reason: 'missing-dependencies',
    })
  })

  it.each([
    ['global-invalidation', { invalidateAll: true, changes: [] }],
    ['incomplete-dependencies', { changes: [change({ complete: false })] }],
    [
      'stale-discovery',
      { changes: [change({ discoveryRevision: 'old-config-or-profile' })] },
    ],
    [
      'unknown-entry',
      { changes: [change({ affectedEntryIds: ['unregistered'] })] },
    ],
  ] as const)('widens to full selection for %s', (reason, input) => {
    expect(selectAffectedTests({ ...baseline, ...input })).toEqual({
      entryIds: baseline.entryIds,
      reason,
    })
  })

  it('does not let complete changes hide incomplete browser/data knowledge', () => {
    expect(
      selectAffectedTests({
        ...baseline,
        changes: [change(), change({ complete: false, affectedEntryIds: [] })],
      }).entryIds
    ).toEqual(baseline.entryIds)
  })

  it('returns each live entry once without mutating discovery', () => {
    const input = Object.freeze({
      ...baseline,
      entryIds: Object.freeze(['unit', 'unit', 'browser']),
    })
    expect(selectAffectedTests(input).entryIds).toEqual(['unit', 'browser'])
    expect(input.entryIds).toEqual(['unit', 'unit', 'browser'])
  })
})

describe('one-shot compiler source selection', () => {
  let directory: string
  let projects: DiscoveredTestProject[]
  let plan: SourceSelectionPlan
  beforeEach(async () => {
    directory = await realpath(
      await mkdtemp(join(tmpdir(), 'next-source-selection-'))
    )
    const profile = {
      id: 'unit',
      environment: 'node' as const,
      mode: 'development' as const,
      runtime: 'nodejs' as const,
      bundler: 'turbopack' as const,
    }
    const files = await Promise.all(
      ['a.case.mjs', 'b.case.mjs', 'helper.mjs'].map(async (name) => {
        const file = join(directory, name)
        await writeFile(file, 'export const value=42\n')
        return {
          file,
          sha256: createHash('sha256')
            .update(await readFile(file))
            .digest('hex'),
        }
      })
    )
    projects = [
      {
        profile,
        entries: files.slice(0, 2).map((source, index) => ({
          id: `unit:${index}`,
          file: source.file,
          profile,
        })),
        include: ['*.case.mjs'],
        exclude: [],
        setupFiles: [],
        snapshotSerializers: [],
        testTimeout: 5000,
        hookTimeout: 10000,
        fileTimeout: 30000,
      },
    ]
    plan = {
      version: 1,
      configuration: { complete: true, files: [] },
      entries: projects[0].entries.map((entry, index) => ({
        id: entry.id,
        ...files[index],
        dependencies: {
          version: 1,
          kind: 'native-module-sources',
          complete: true,
          entry: files[index],
          files: index === 0 ? [files[0], files[2]] : [files[1]],
        },
      })),
    }
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('selects native consumers but widens shared config helpers and stale bytes', async () => {
    const helper = join(directory, 'helper.mjs')
    expect(
      (
        await selectSourceRelatedProjects(projects, [helper], plan)
      )[0].entries.map((entry) => entry.id)
    ).toEqual(['unit:0'])
    const shared = {
      ...plan,
      configuration: {
        complete: true,
        files: [plan.entries[0].dependencies!.files[1]],
      },
    }
    expect(
      await selectSourceRelatedProjects(projects, [helper], shared)
    ).toEqual(projects)
    await writeFile(helper, 'export const value=43\n')
    expect(
      await selectSourceRelatedProjects(
        projects,
        [join(directory, 'unknown.mjs')],
        plan
      )
    ).toEqual(projects)
  })

  it('retains uncertified graphs and rejects foreign planner identities', async () => {
    expect(
      await selectSourceRelatedProjects(projects, [], {
        ...plan,
        configuration: { complete: false, files: [] },
      })
    ).toEqual(projects)
    await expect(
      selectSourceRelatedProjects(projects, [], {
        ...plan,
        entries: [...plan.entries].reverse(),
      })
    ).rejects.toThrow('requested entries')
    const partial = {
      ...plan,
      entries: [
        plan.entries[0],
        {
          ...plan.entries[1],
          dependencies: undefined,
          compilationFailed: true as const,
        },
      ],
    }
    expect(
      (
        await selectSourceRelatedProjects(
          projects,
          [join(directory, 'unknown.mjs')],
          partial
        )
      )[0].entries.map((entry) => entry.id)
    ).toEqual(['unit:1'])
  })

  it('retains a retargeted source symlink as incomplete dependency evidence', async () => {
    const link = join(directory, 'link.mjs'),
      target = join(directory, 'new-target.mjs'),
      output = join(directory, 'artifact')
    await mkdir(output)
    await writeFile(target, 'export const value=99\n')
    await symlink(join(directory, 'helper.mjs'), link)
    const fact = plan.entries[0]
    await writeFile(
      join(output, 'entry.dependencies.json'),
      JSON.stringify({
        ...fact.dependencies,
        entry: { file: 'a.case.mjs', sha256: fact.sha256 },
        files: [
          { file: 'a.case.mjs', sha256: fact.sha256 },
          { file: 'link.mjs', sha256: fact.dependencies!.files[1].sha256 },
        ],
      })
    )
    const dependencies = await readSourceDependencyAsset(
      output,
      'entry.js',
      directory,
      projects[0].entries[0],
      fact.sha256
    )
    expect(dependencies.complete).toBe(false)
    await unlink(link)
    await symlink(target, link)
    const selected = await selectSourceRelatedProjects(projects, [link], {
      ...plan,
      entries: [{ ...fact, dependencies }, plan.entries[1]],
    })
    expect(selected[0].entries.map((entry) => entry.id)).toEqual(['unit:0'])
  })

  it('uses actual Git staged, working and untracked changes without losing filenames', async () => {
    const git = (...args: string[]) =>
      execFileSync(
        'git',
        [
          '-c',
          'core.hooksPath=/dev/null',
          '-c',
          'commit.gpgsign=false',
          '-c',
          'user.name=Test',
          '-c',
          'user.email=test@example.invalid',
          ...args,
        ],
        { cwd: directory, stdio: 'pipe' }
      )
    git('init', '-q')
    git('add', '.')
    git('commit', '-qm', 'baseline')
    await writeFile(join(directory, 'a.case.mjs'), 'changed\n')
    await writeFile(join(directory, 'b.case.mjs'), 'staged\n')
    git('add', 'b.case.mjs')
    await writeFile(join(directory, 'untracked space\nline.mjs'), 'new\n')
    expect(
      (await findChangedTestSources(directory, 'HEAD'))
        .map((file) => basename(file))
        .sort()
    ).toEqual(['a.case.mjs', 'b.case.mjs', 'untracked space\nline.mjs'].sort())
    await expect(
      findChangedTestSources(directory, 'missing-ref')
    ).rejects.toThrow('missing-ref')
  })
})
