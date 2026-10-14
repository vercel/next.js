import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { execFile, type ChildProcess } from 'child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import config from './next.test.config.json'

jest.setTimeout(300000)

interface RecordEntry {
  event: string
  file: string
  pid: number
  parent: number
  mode: string
  descendant?: number
  url?: string
}

describe('next-testing-scheduling', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    dependencies: {
      playwright: require('playwright/package.json').version,
      '@next/playwright': require('@next/playwright/package.json').version,
    },
  })
  let audit: string
  let counter = 0
  const children = new Set<ChildProcess>()
  beforeEach(async () => {
    audit = await mkdtemp(join(tmpdir(), 'next-scheduling-'))
    await next.patchFile('next.test.config.json', JSON.stringify(config))
  })
  afterEach(async () => {
    for (const child of children) child.kill('SIGTERM')
    await Promise.all(
      [...children].map(
        (child) =>
          new Promise<void>((resolve) => child.once('close', () => resolve()))
      )
    )
    children.clear()
    if (audit) await rm(audit, { recursive: true, force: true })
  })

  async function records(file: string): Promise<RecordEntry[]> {
    try {
      return (await readFile(file, 'utf8'))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw error
    }
  }
  function launch(args: string[], extra: Record<string, string> = {}) {
    const journal = join(audit, `journal-${++counter}.jsonl`)
    const eventsFile = join(audit, `events-${counter}.jsonl`)
    const resourcesFile = join(audit, `resources-${counter}.jsonl`)
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...extra,
      NEXT_SCHEDULING_JOURNAL: journal,
      NEXT_TEST_EVENT_AUDIT: eventsFile,
      NEXT_SCHEDULING_RESOURCES: resourcesFile,
      NEXT_TELEMETRY_DISABLED: '1',
    }
    delete (env as any).NODE_ENV
    env.NODE_OPTIONS = [
      process.env.NODE_OPTIONS,
      `--require=${JSON.stringify(join(next.testDir, 'resources.cjs'))}`,
    ]
      .filter(Boolean)
      .join(' ')
    let child: ChildProcess
    const done = new Promise<{
      code: number | string
      stdout: string
      stderr: string
    }>((resolve) => {
      child = execFile(
        process.execPath,
        [
          require.resolve('next/dist/bin/next', { paths: [next.testDir] }),
          'test',
          next.testDir,
          ...args,
        ],
        {
          cwd: next.testDir,
          env,
          timeout: 180000,
          maxBuffer: 10 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          children.delete(child)
          resolve({ code: error?.code ?? 0, stdout, stderr })
        }
      )
      children.add(child)
    })
    return { done, journal, eventsFile, resourcesFile, child: child! }
  }
  async function success(args: string[]) {
    const run = launch(args)
    const result = await run.done
    expect({
      code: result.code,
      failure: result.code ? result.stdout + result.stderr : '',
    }).toEqual({ code: 0, failure: '' })
    await assertClosed(await records(run.resourcesFile))
    return { ...run, ...result, records: await records(run.journal) }
  }
  async function configure(project: object) {
    await next.patchFile(
      'next.test.config.json',
      JSON.stringify({
        maxWorkers: 2,
        projects: [{ name: 'selected', ...project }],
      })
    )
  }
  function identities(items: RecordEntry[]) {
    return items
      .filter((item) => item.event === 'start')
      .map((item) => `${item.mode}:${item.file}`)
      .sort()
  }
  async function assertClosed(items: RecordEntry[]) {
    const pids = new Set(
      items.flatMap((item) => [
        item.pid,
        ...(item.descendant ? [item.descendant] : []),
      ])
    )
    await retry(async () => {
      for (const pid of pids) expect(() => process.kill(pid, 0)).toThrow()
    })
  }

  it('matches serial results with bounded parallel workers, retries, and stable report identities', async () => {
    const serial = await success(['--project', 'dev', '--max-workers', '1'])
    const gate = join(audit, 'release')
    const parallel = launch(['--project', 'dev', '--max-workers', '2'], {
      NEXT_SCHEDULING_GATE: gate,
    })
    await retry(async () => {
      expect(
        (await records(parallel.journal)).filter(
          (item) => item.event === 'start'
        )
      ).toHaveLength(2)
    }, 60000)
    await writeFile(gate, '')
    const result = await parallel.done
    expect({
      code: result.code,
      failure: result.code ? result.stdout + result.stderr : '',
    }).toEqual({ code: 0, failure: '' })
    const items = await records(parallel.journal)
    expect(identities(items)).toEqual(identities(serial.records))
    expect(
      items.filter((item) => item.event === 'attempt' && item.file === 'beta')
    ).toHaveLength(2)
    expect(
      new Set(
        items.filter((item) => item.event === 'start').map((item) => item.pid)
      ).size
    ).toBe(3)
    let active = 0
    let peak = 0
    for (const item of items) {
      if (item.event === 'start') peak = Math.max(peak, ++active)
      if (item.event === 'end') active--
    }
    expect(peak).toBe(2)
    expect(active).toBe(0)
    const events = JSON.parse(
      '[' +
        (await readFile(parallel.eventsFile, 'utf8'))
          .trim()
          .split('\n')
          .join(',') +
        ']'
    )
    expect(events.filter((event) => event.type === 'file-end')).toHaveLength(3)
    expect(new Set(events.map((event) => event.runId)).size).toBe(1)
    await assertClosed(items)
  })

  it('assigns deterministic disjoint shards and permits empty shards', async () => {
    const ids: string[] = []
    for (const shard of ['1/2', '2/2']) {
      const listing = await success([
        '--project',
        'dev',
        '--shard',
        shard,
        '--list',
      ])
      const run = await success(['--project', 'dev', '--shard', shard])
      const selected = identities(run.records)
      for (const id of selected)
        expect(listing.stdout).toContain(
          `dev:units/${id.split(':')[1]}.case.mjs`
        )
      ids.push(...selected)
    }
    expect(ids.sort()).toEqual([
      'development:alpha',
      'development:beta',
      'development:gamma',
    ])
    const empty = await success(['--project', 'dev', '--shard', '4/4'])
    expect(empty.stdout).toContain('no test files assigned')
  })

  it('isolates mixed modes including config and env-file caches, in either project order', async () => {
    for (const projects of [config.projects, [...config.projects].reverse()]) {
      await next.patchFile(
        'next.test.config.json',
        JSON.stringify({ ...config, projects })
      )
      const result = await success([])
      expect(identities(result.records)).toEqual([
        'development:alpha',
        'development:beta',
        'development:gamma',
        'production:alpha',
        'production:beta',
        'production:gamma',
      ])
      const parents = new Map<string, Set<number>>()
      for (const item of result.records) {
        const set = parents.get(item.mode) ?? new Set<number>()
        set.add(item.parent)
        parents.set(item.mode, set)
      }
      // Broker-owned workers may have the same supervisor, but each compile
      // profile must still provide the correct fresh config/environment above.
      expect(parents.size).toBe(2)
      expect(result.stdout).toMatch(/Test Files\s+6 passed/)
      await assertClosed(result.records)
    }
  })

  it('aggregates parallel coverage and authorizes snapshots only on explicit updates', async () => {
    const coverage = await success(['--project', 'dev', '--coverage'])
    expect(coverage.stdout).toContain('subject.mjs')
    const serial = await success([
      '--project',
      'dev',
      '--coverage',
      '--max-workers',
      '1',
    ])
    async function coverageReport(file: string) {
      const events = (await readFile(file, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      const reports = events.filter(
        (event) =>
          event.type === 'attachment' &&
          event.attachment.name === 'coverage.json'
      )
      expect(reports).toHaveLength(1)
      return JSON.parse(await readFile(reports[0].attachment.path, 'utf8'))
    }
    expect(await coverageReport(coverage.eventsFile)).toEqual(
      await coverageReport(serial.eventsFile)
    )
    await configure({ include: ['snapshots/*.case.mjs'] })
    const readonly = await launch([]).done
    expect(readonly.code).toBe(1)
    await success(['--update'])
    const first = await readFile(
      join(next.testDir, 'snapshots/__snapshots__/first.case.mjs.snap'),
      'utf8'
    )
    await success([])
    expect(
      await readFile(
        join(next.testDir, 'snapshots/__snapshots__/first.case.mjs.snap'),
        'utf8'
      )
    ).toBe(first)
  })

  it('keeps parallel RSC rendering isolated in development and production', async () => {
    for (const mode of ['development', 'production']) {
      await configure({ environment: 'rsc', mode, include: ['rsc/*.case.tsx'] })
      const result = await success([])
      expect(result.stdout).toMatch(/Test Files\s+2 passed/)
    }
  })

  it('continues after worker crashes and reports the original source', async () => {
    await configure({
      include: ['units/*.case.mjs', 'failures/crash.case.mjs'],
    })
    const running = launch([])
    const result = await running.done
    expect(result.code).toBe(1)
    expect(result.stdout + result.stderr).toContain('crash.case.mjs')
    expect(identities(await records(running.journal))).toEqual([
      'development:alpha',
      'development:beta',
      'development:gamma',
    ])
    await assertClosed(await records(running.journal))
  })

  it('cancels active workers and descendants and excludes another output owner', async () => {
    await configure({
      include: ['failures/hang.case.mjs', 'units/*.case.mjs'],
      testTimeout: 60000,
      hookTimeout: 60000,
    })
    const gate = join(audit, 'never-release')
    const running = launch([], { NEXT_SCHEDULING_GATE: gate })
    await retry(async () => {
      expect(
        (await records(running.journal)).some((item) => item.event === 'hang')
      ).toBe(true)
    }, 60000)
    const competing = await launch([]).done
    expect(competing.code).toBe(1)
    expect(competing.stderr).toContain(
      'Another next test invocation owns this application'
    )
    running.child.kill('SIGTERM')
    expect((await running.done).code).toBe(130)
    const items = await records(running.journal)
    expect(
      items.filter((item) => item.event === 'start').length
    ).toBeLessThanOrEqual(1)
    await assertClosed(items)
    await assertClosed(await records(running.resourcesFile))
    expect(
      (await readdir(join(next.testDir, '.next'))).filter((name) =>
        name.startsWith('.next-test-')
      )
    ).toEqual([])
    await next.patchFile('next.test.config.json', JSON.stringify(config))
    await success(['--project', 'dev'])
  })

  it('reclaims broker-owned workers and artifacts when the compiler process crashes', async () => {
    await configure({
      include: ['failures/compiler-crash.case.mjs'],
      testTimeout: 60000,
    })
    const running = launch([])
    const result = await running.done
    expect(result.code).toBe(1)
    const items = await records(running.journal)
    expect(items).toHaveLength(1)
    await assertClosed(items)
    expect(
      (await readdir(join(next.testDir, '.next'))).filter((name) =>
        name.startsWith('.next-test-')
      )
    ).toEqual([])
    await next.patchFile('next.test.config.json', JSON.stringify(config))
    await success(['--project', 'dev'])
  })

  it('serializes browser/server leases despite a larger worker limit and closes every port', async () => {
    await configure({
      environment: 'browser',
      include: ['browsers/*.case.mjs'],
      testTimeout: 60000,
    })
    const result = await success(['--max-workers', '4'])
    const items = result.records.filter((item) => item.event === 'browser')
    expect(items).toHaveLength(2)
    expect(items.map((item) => item.file)).toEqual(['first', 'second'])
    for (const item of items) await expect(fetch(item.url!)).rejects.toThrow()
    await assertClosed(items)
  })

  it('reclaims the browser, server, and blocked driver after cancellation', async () => {
    await configure({
      environment: 'browser',
      include: ['failures/browser-hang.case.mjs'],
      testTimeout: 60000,
    })
    const running = launch(['--max-workers', '4'])
    await retry(async () => {
      expect(
        (await records(running.journal)).some(
          (item) => item.event === 'browser-hang'
        )
      ).toBe(true)
    }, 60000)
    running.child.kill('SIGTERM')
    expect((await running.done).code).toBe(130)
    const items = await records(running.journal)
    for (const item of items) await expect(fetch(item.url!)).rejects.toThrow()
    await assertClosed(await records(running.resourcesFile))
    await assertClosed(items)
  })
})
