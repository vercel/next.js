import { createHash } from 'crypto'
import { execFileSync, spawn } from 'child_process'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'fs/promises'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import { retry } from 'next-test-utils'
import type { ResultEvent } from 'next/dist/experimental/testing/reporting/events'
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
  it('selects production Node source consumers through the actual compiler graph', () => {
    const stdout = execFileSync(
      process.execPath,
      [join(__dirname, 'production-related.cjs')],
      { encoding: 'utf8', timeout: 150000 }
    )
    expect(stdout).toContain('"key":"alpha"')
    expect(stdout).toContain('"key":"beta"')
    expect(stdout).toContain('"key":"unrelated"')
    expect(stdout).toContain('"key":"changed"')
  }, 160000)

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

interface RelatedWatchRow {
  stage: string
  cases?: { fullName: string; status: string; failureMessages: string[] }[]
  outputs?: { case: string; value: number; shared: number; mode: string }[]
  total?: number
  passed?: number
  success?: boolean
  noNewReport?: boolean
}

interface RelatedWatchReport {
  testResults: { assertionResults: NonNullable<RelatedWatchRow['cases']> }[]
  next: { events: ResultEvent[] }
  numTotalTests: number
  numPassedTests: number
  numFailedTests: number
  success: boolean
}

it.each(['development', 'production'] as const)(
  'retains related-watch discovery and selects actual %s source consumers',
  async (mode) => {
    const repo = join(__dirname, '../../../..')
    const fixture = await mkdtemp(join(repo, '.next-related-watch-'))
    const inputs = join(__dirname, 'related-watch')
    const expected = (
      JSON.parse(
        await readFile(join(inputs, 'expected.json'), 'utf8')
      ) as Record<typeof mode, RelatedWatchRow[]>
    )[mode]
    const originals = new Map<string, Buffer>()
    for (const name of await readdir(inputs)) {
      if (!name.endsWith('.txt')) continue
      const bytes = await readFile(join(inputs, name))
      originals.set(name.slice(0, -4), bytes)
      await writeFile(join(fixture, name.slice(0, -4)), bytes)
    }
    await symlink(join(repo, 'node_modules'), join(fixture, 'node_modules'))
    await writeFile(
      join(fixture, 'next.config.mjs'),
      'export default ' + JSON.stringify({ turbopack: { root: repo } }) + '\n'
    )
    await writeFile(
      join(fixture, 'next.test.config.json'),
      JSON.stringify({
        maxWorkers: 1,
        projects: [
          {
            name: 'related-watch',
            environment: 'node',
            mode,
            include: ['*.test.mjs'],
          },
        ],
      })
    )
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: mode,
      NEXT_TELEMETRY_DISABLED: '1',
      FORCE_COLOR: '0',
    }
    delete env.CI
    const outputFile = join(fixture, 'watch-result.json')
    const child = spawn(
      process.execPath,
      [
        join(repo, 'packages/next/dist/bin/next'),
        'test',
        fixture,
        '--watch',
        '--related',
        'source-alpha.mjs',
        '--reporter=default',
        '--reporter=json',
        '--outputFile',
        outputFile,
      ],
      { cwd: fixture, env, stdio: ['ignore', 'pipe', 'pipe'] }
    )
    let stdout = ''
    let stderr = ''
    let failure: Error | undefined
    let close:
      | { code: number | null; signal: NodeJS.Signals | null }
      | undefined
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.once('error', (error) => {
      failure = error
    })
    child.once('close', (code, signal) => {
      close = { code, signal }
    })
    const readiness = () =>
      (stdout.match(/Waiting for file changes\.\.\./g) ?? []).length
    let digest: string | undefined
    let settled = 0
    const history = []
    async function readRun(row: (typeof expected)[number]) {
      return retry(
        async () => {
          if (failure) throw failure
          if (close)
            throw new Error(
              'Related watch exited before readiness: ' +
                JSON.stringify({ close, stdout, stderr })
            )
          const raw = await readFile(outputFile)
          const nextDigest = createHash('sha256').update(raw).digest('hex')
          expect(nextDigest).not.toBe(digest)
          expect(readiness()).toBeGreaterThan(settled)
          const report: RelatedWatchReport = JSON.parse(raw.toString())
          const cases = report.testResults
            .flatMap((file) =>
              file.assertionResults.map((test) => ({
                fullName: test.fullName,
                status: test.status,
                failureMessages: test.failureMessages,
              }))
            )
            .sort((a, b) => a.fullName.localeCompare(b.fullName))
          const outputs = report.next.events
            .filter((event) => event.type === 'output')
            .flatMap((event) => event.text.split('\n'))
            .filter((line) => line.startsWith('RELATED153:'))
            .map((line) => JSON.parse(line.slice('RELATED153:'.length)))
            .sort((a, b) => a.case.localeCompare(b.case))
          expect({
            cases,
            outputs,
            total: report.numTotalTests,
            passed: report.numPassedTests,
            success: report.success,
          }).toEqual({
            cases: row.cases,
            outputs: row.outputs,
            total: row.total,
            passed: row.passed,
            success: row.success,
          })
          expect(report.numFailedTests).toBe(0)
          return { digest: nextDigest, settled: readiness() }
        },
        60000,
        100,
        'related source generation'
      )
    }
    async function readUnrelatedSelection() {
      await retry(
        async () => {
          if (failure) throw failure
          expect(close).toBeUndefined()
          expect(readiness()).toBeGreaterThan(settled)
          expect(
            createHash('sha256')
              .update(await readFile(outputFile))
              .digest('hex')
          ).toBe(digest)
        },
        60000,
        100,
        'closed unrelated source selection'
      )
    }
    try {
      for (const row of expected) {
        const edits: Record<string, readonly [string, string]> = {
          'beta-edit': ['source-beta.mjs', 'export const value = 45\n'],
          'shared-edit': ['shared.mjs', 'export const shared = 1\n'],
          'unrelated-edit': ['unrelated.mjs', 'export const unused = 1\n'],
          'alpha-edit': ['source-alpha.mjs', 'export const value = 44\n'],
        }
        const edit = edits[row.stage]
        if (edit) await writeFile(join(fixture, edit[0]), edit[1])
        if (row.noNewReport) {
          await readUnrelatedSelection()
          settled = readiness()
        } else {
          const observed = await readRun(row)
          digest = observed.digest
          settled = observed.settled
        }
        history.push(row.stage)
      }
      expect(history).toEqual([
        'initial',
        'beta-edit',
        'shared-edit',
        'unrelated-edit',
        'alpha-edit',
      ])
      for (const name of ['alpha.test.mjs', 'beta.test.mjs', 'package.json'])
        expect(await readFile(join(fixture, name))).toEqual(originals.get(name))
      child.kill('SIGINT')
      await retry(
        () => expect(close).toEqual({ code: 130, signal: null }),
        15000,
        100,
        'related watch cleanup'
      )
    } finally {
      if (!close) {
        child.kill('SIGTERM')
        try {
          await retry(
            () => expect(close).toBeDefined(),
            15000,
            100,
            'failed related watch cleanup'
          )
        } finally {
          if (!close) {
            child.kill('SIGKILL')
            await retry(
              () => expect(close).toBeDefined(),
              5000,
              100,
              'forced related watch cleanup'
            )
          }
        }
      }
      if (failure || close?.code !== 130)
        console.error({ failure, close, stdout, stderr })
      await rm(fixture, { recursive: true, force: true })
    }
  },
  330000
)

it.each(['development', 'production'] as const)(
  'retains changed-watch discovery and selects actual %s source consumers',
  async (mode) => {
    const repo = join(__dirname, '../../../..')
    const fixture = await mkdtemp(join(repo, '.next-changed-watch-'))
    const inputs = join(__dirname, 'related-watch')
    const expected = (
      JSON.parse(
        await readFile(join(inputs, 'changed-watch.expected.json'), 'utf8')
      ) as Record<typeof mode, RelatedWatchRow[]>
    )[mode]
    const originals = new Map<string, Buffer>()
    for (const name of await readdir(inputs)) {
      if (!name.endsWith('.txt')) continue
      const bytes = await readFile(join(inputs, name))
      originals.set(name.slice(0, -4), bytes)
      await writeFile(join(fixture, name.slice(0, -4)), bytes)
    }
    await symlink(join(repo, 'node_modules'), join(fixture, 'node_modules'))
    await writeFile(
      join(fixture, 'next.config.mjs'),
      'export default ' + JSON.stringify({ turbopack: { root: repo } }) + '\n'
    )
    await writeFile(
      join(fixture, 'next.test.config.json'),
      JSON.stringify({
        maxWorkers: 1,
        projects: [
          {
            name: 'changed-watch',
            environment: 'node',
            mode,
            include: ['*.test.mjs'],
          },
        ],
      })
    )
    await writeFile(
      join(fixture, '.gitignore'),
      'node_modules/\n.next-test*/\nwatch-result.json\n'
    )
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
        { cwd: fixture, stdio: 'pipe' }
      )
    git('init', '-q')
    git('add', '.')
    git('commit', '-qm', 'changed watch baseline')
    await writeFile(
      join(fixture, 'source-alpha.mjs'),
      'export const value = 42\n'
    )
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: mode,
      NEXT_TELEMETRY_DISABLED: '1',
      FORCE_COLOR: '0',
    }
    delete env.CI
    const outputFile = join(fixture, 'watch-result.json')
    const child = spawn(
      process.execPath,
      [
        join(repo, 'packages/next/dist/bin/next'),
        'test',
        fixture,
        '--watch',
        '--changed',
        'HEAD',
        '--reporter=default',
        '--reporter=json',
        '--outputFile',
        outputFile,
      ],
      { cwd: fixture, env, stdio: ['ignore', 'pipe', 'pipe'] }
    )
    let stdout = ''
    let stderr = ''
    let failure: Error | undefined
    let close:
      | { code: number | null; signal: NodeJS.Signals | null }
      | undefined
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.once('error', (error) => {
      failure = error
    })
    child.once('close', (code, signal) => {
      close = { code, signal }
    })
    const readiness = () =>
      (stdout.match(/Waiting for file changes\.\.\./g) ?? []).length
    let digest: string | undefined
    let settled = 0
    const history = []
    async function readRun(row: (typeof expected)[number]) {
      return retry(
        async () => {
          if (failure) throw failure
          if (close)
            throw new Error(
              'Changed watch exited before readiness: ' +
                JSON.stringify({ close, stdout, stderr })
            )
          const raw = await readFile(outputFile)
          const nextDigest = createHash('sha256').update(raw).digest('hex')
          expect(nextDigest).not.toBe(digest)
          expect(readiness()).toBeGreaterThan(settled)
          const report: RelatedWatchReport = JSON.parse(raw.toString())
          const cases = report.testResults
            .flatMap((file) =>
              file.assertionResults.map((test) => ({
                fullName: test.fullName,
                status: test.status,
                failureMessages: test.failureMessages,
              }))
            )
            .sort((a, b) => a.fullName.localeCompare(b.fullName))
          const outputs = report.next.events
            .filter((event) => event.type === 'output')
            .flatMap((event) => event.text.split('\n'))
            .filter((line) => line.startsWith('RELATED153:'))
            .map((line) => JSON.parse(line.slice('RELATED153:'.length)))
            .sort((a, b) => a.case.localeCompare(b.case))
          expect({
            cases,
            outputs,
            total: report.numTotalTests,
            passed: report.numPassedTests,
            success: report.success,
          }).toEqual({
            cases: row.cases,
            outputs: row.outputs,
            total: row.total,
            passed: row.passed,
            success: row.success,
          })
          expect(report.numFailedTests).toBe(0)
          return { digest: nextDigest, settled: readiness() }
        },
        60000,
        100,
        'changed source generation'
      )
    }
    async function readUnrelatedSelection() {
      await retry(
        async () => {
          if (failure) throw failure
          expect(close).toBeUndefined()
          expect(readiness()).toBeGreaterThan(settled)
          expect(
            createHash('sha256')
              .update(await readFile(outputFile))
              .digest('hex')
          ).toBe(digest)
        },
        60000,
        100,
        'closed unrelated source selection'
      )
    }
    try {
      for (const row of expected) {
        const edits: Record<string, readonly [string, string]> = {
          'beta-edit': ['source-beta.mjs', 'export const value = 45\n'],
          'shared-edit': ['shared.mjs', 'export const shared = 1\n'],
          'unrelated-edit': ['unrelated.mjs', 'export const unused = 1\n'],
          'alpha-edit': ['source-alpha.mjs', 'export const value = 44\n'],
        }
        const edit = edits[row.stage]
        if (edit) await writeFile(join(fixture, edit[0]), edit[1])
        if (row.noNewReport) {
          await readUnrelatedSelection()
          settled = readiness()
        } else {
          const observed = await readRun(row)
          digest = observed.digest
          settled = observed.settled
        }
        history.push(row.stage)
      }
      expect(history).toEqual([
        'initial-alpha-modified',
        'beta-edit',
        'shared-edit',
        'unrelated-edit',
        'alpha-edit',
      ])
      for (const name of ['alpha.test.mjs', 'beta.test.mjs', 'package.json'])
        expect(await readFile(join(fixture, name))).toEqual(originals.get(name))
      child.kill('SIGINT')
      await retry(
        () => expect(close).toEqual({ code: 130, signal: null }),
        15000,
        100,
        'changed watch cleanup'
      )
    } finally {
      if (!close) {
        child.kill('SIGTERM')
        try {
          await retry(
            () => expect(close).toBeDefined(),
            15000,
            100,
            'failed changed watch cleanup'
          )
        } finally {
          if (!close) {
            child.kill('SIGKILL')
            await retry(
              () => expect(close).toBeDefined(),
              5000,
              100,
              'forced changed watch cleanup'
            )
          }
        }
      }
      if (failure || close?.code !== 130)
        console.error({ failure, close, stdout, stderr })
      await rm(fixture, { recursive: true, force: true })
    }
  },
  330000
)
