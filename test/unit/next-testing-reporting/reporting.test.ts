import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { killApp, retry } from 'next-test-utils'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import 'next/dist/server/node-environment-baseline'
import { execFileSync } from 'node:child_process'
import {
  setBundlerFindSourceMapImplementation,
  getSourceMappedStackFrames,
} from 'next/dist/server/patch-error-inspect'
import { serializeSourceMappedDiagnostic } from 'next/dist/experimental/testing/reporting/source-mapped-diagnostics'
import {
  createTestReporter,
  formatDiagnostic,
  formatWatchStatus,
  type TestReporterOptions,
} from 'next/dist/experimental/testing/reporting/reporter'
import {
  createMachineReporter,
  parseResultReporters,
  mergeResultReports,
} from 'next/dist/experimental/testing/reporting/machine'
import { createTestTerminal } from 'next/dist/experimental/testing/reporting/terminal'
import { getFinalCaseResults } from 'next/dist/experimental/testing/reporting/final-cases'
import { serializeDiagnostic } from 'next/dist/experimental/testing/reporting/diagnostics'
import type {
  ResultEvent,
  CaseResult,
} from 'next/dist/experimental/testing/reporting/events'
import type { TestEntry } from 'next/dist/experimental/testing/contracts'

const entry: TestEntry = {
  id: 'node:example',
  file: '/project/example.test.ts',
  profile: {
    id: 'node',
    mode: 'development',
    environment: 'node',
    runtime: 'nodejs',
    bundler: 'turbopack',
  },
}
const envelope = {
  version: 1 as const,
  runId: 'run',
  timestamp: new Date(2026, 0, 1, 12, 34, 56).getTime(),
}

describe('persistent custom completion reporter ownership', () => {
  it.each([false, true])(
    'joins one watch reporter across generations with closeError=%s',
    async (closeError) => {
      const { openCustomReporters } = await import(
        'next/dist/experimental/testing/reporting/custom-reporter'
      )
      const root = await mkdtemp(join(tmpdir(), 'next-persistent-reporter-'))
      let session: Awaited<ReturnType<typeof openCustomReporters>> | undefined
      let disposed = false
      try {
        await cp(
          join(__dirname, 'fixtures/persistent-watch-reporter.mjs'),
          join(root, 'reporter.mjs')
        )
        await writeFile(
          join(root, 'persistent-options.json'),
          JSON.stringify({ closeError })
        )
        session = await openCustomReporters({
          projectDir: root,
          reporters: ['./reporter.mjs'],
          watch: true,
          write() {},
        })
        const trace = async () =>
          (await readFile(join(root, 'persistent-rows.jsonl'), 'utf8'))
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line))
        for (const generation of [1, 2]) {
          await session.beginWatchRun()
          const machine = createMachineReporter({
            projectDir: root,
            reporters: parseResultReporters(['./reporter.mjs']),
            customReporterSession: session,
            write() {},
          })
          try {
            await machine.initialize()
            expect(machine.captureTaskResults).toBe(true)
            const fact = { ...envelope, runId: `persistent-${generation}` }
            machine.onEvent({ ...fact, type: 'run-start' })
            machine.onEvent({
              ...fact,
              type: 'file-start',
              entry,
              revision: `revision-${generation}`,
            })
            machine.onEvent({
              ...fact,
              type: 'case-end',
              ...result(0, 'passed'),
              name: `generation ${generation}`,
            })
            machine.onEvent({
              ...fact,
              type: 'file-end',
              entryId: entry.id,
              status: 'passed',
              durationMs: 3,
            })
            machine.onEvent({
              ...fact,
              type: 'run-end',
              status: 'passed',
              durationMs: 3,
            })
            await machine.finish()
          } finally {
            await machine.dispose()
          }
          expect((await trace()).some((row) => row.type === 'close')).toBe(
            false
          )
        }
        const first = session.dispose()
        expect(session.dispose()).toBe(first)
        disposed = true
        if (closeError)
          await expect(first).rejects.toThrow(
            'actual persistent watch close failure'
          )
        else await first
        const rows = await trace()
        expect(rows[0]).toMatchObject({ type: 'init', watch: true })
        expect(rows[0].pid).not.toBe(process.pid)
        expect(rows.slice(1)).toEqual([
          {
            type: 'module',
            names: ['generation 1'],
            previousNames: null,
            state: 'passed',
          },
          {
            type: 'end',
            run: 1,
            names: [['generation 1']],
            sameModule: true,
            errors: [],
            reason: 'passed',
          },
          {
            type: 'module',
            names: ['generation 2'],
            previousNames: ['generation 1'],
            state: 'passed',
          },
          {
            type: 'end',
            run: 2,
            names: [['generation 2']],
            sameModule: true,
            errors: [],
            reason: 'passed',
          },
          { type: 'close', runs: 2 },
        ])
      } finally {
        if (!disposed) await session?.dispose()
        await rm(root, { recursive: true, force: true })
      }
    }
  )
})
function setup(options: Partial<TestReporterOptions> = {}) {
  let output = ''
  const reporter = createTestReporter({
    projectDir: '/project',
    version: '1.2.3',
    ...options,
    write: (text) => {
      output += text
    },
  })
  const emit = (
    event: ResultEvent extends infer E
      ? E extends ResultEvent
        ? Omit<E, keyof typeof envelope>
        : never
      : never
  ) => reporter.onEvent({ ...envelope, ...event } as ResultEvent)
  emit({ type: 'run-start' })
  emit({ type: 'file-start', entry, revision: 'rev-1' })
  return { reporter, emit, output: () => output }
}
function result(
  retry: number,
  status: CaseResult['status'],
  repeat = 0
): CaseResult {
  return {
    entryId: entry.id,
    caseId: 'case',
    attempt: { id: `attempt-${repeat}-${retry}`, retry, repeat },
    name: 'renders',
    status,
    durationMs: 3,
    errors:
      status === 'failed'
        ? [
            serializeDiagnostic(new Error('render failed'), {
              phase: 'runtime',
            }),
          ]
        : [],
  }
}

describe('Next test reporting', () => {
  it('prints the default file and summary layout without fast passing case rows', () => {
    const { emit, output } = setup()
    emit({ type: 'case-end', ...result(0, 'passed') })
    emit({
      type: 'file-end',
      entryId: entry.id,
      status: 'passed',
      durationMs: 3,
    })
    emit({ type: 'run-end', status: 'passed', durationMs: 1200 })
    expect(output()).toBe(
      '\n RUN  Next.js v1.2.3 /project\n\n' +
        ' ✓ |node| example.test.ts (1 test) 3ms\n' +
        '\n Test Files  1 passed (1)\n' +
        '      Tests  1 passed (1)\n' +
        '   Start at  12:34:56\n' +
        '   Duration  1.20s\n\n'
    )
  })

  it('prints all final cases in a failed file and defers errors until run end', () => {
    const { emit, output } = setup({ columns: 40 })
    emit({
      type: 'case-end',
      ...result(0, 'passed'),
      caseId: 'pass',
      name: 'passes',
    })
    emit({
      type: 'case-end',
      ...result(0, 'skipped'),
      caseId: 'skip',
      name: 'skips',
    })
    emit({
      type: 'case-end',
      ...result(0, 'failed'),
      errors: [
        {
          severity: 'error',
          phase: 'runtime',
          name: 'AssertionError',
          message: 'values differ',
          diff: '- Expected\n+ Received',
          frames: [
            {
              file: '/project/example.test.ts',
              line: 12,
              column: 4,
              original: true,
            },
          ],
        },
      ],
    })
    emit({
      type: 'file-end',
      entryId: entry.id,
      status: 'failed',
      durationMs: 9,
    })
    expect(output()).toContain(
      ' ❯ |node| example.test.ts (3 tests | 1 failed | 1 skipped) 9ms'
    )
    expect(output()).toContain('   ✓ passes 3ms\n   ↓ skips\n   × renders 3ms')
    expect(output()).not.toContain('AssertionError')
    emit({ type: 'run-end', status: 'failed', durationMs: 9 })
    expect(output()).toContain(' FAIL  |node| example.test.ts > renders')
    expect(output()).toContain(
      'AssertionError: values differ\n\n- Expected\n+ Received\n ❯ example.test.ts:12:4'
    )
    expect(output()).toContain(
      '      Tests  1 failed | 1 passed | 1 skipped (3)'
    )
    expect(
      output()
        .split('\n')
        .find((line) => line.includes('Failed Tests'))
    ).toHaveLength(40)
  })

  it('keeps profiles distinct and labels stdout and stderr with human test names', () => {
    const { reporter, emit, output } = setup()
    const browserEntry = {
      ...entry,
      id: 'browser:example',
      profile: {
        ...entry.profile,
        id: 'browser',
        environment: 'browser' as const,
      },
    }
    emit({ type: 'file-start', entry: browserEntry })
    for (const selected of [entry, browserEntry]) {
      emit({
        type: 'case-start',
        ...result(0, 'passed'),
        entryId: selected.id,
      })
      for (const stream of ['stdout', 'stderr'] as const)
        emit({
          type: 'output',
          entryId: selected.id,
          caseId: 'case',
          stream,
          text: 'hello',
        })
      emit({ type: 'case-end', ...result(0, 'passed'), entryId: selected.id })
      emit({
        type: 'file-end',
        entryId: selected.id,
        status: 'passed',
        durationMs: 3,
      })
    }
    emit({ type: 'run-end', status: 'passed', durationMs: 6 })
    expect(output()).toContain(
      'stdout | |node| example.test.ts > renders\nhello\n'
    )
    expect(output()).toContain(
      'stderr | |browser| example.test.ts > renders\nhello\n'
    )
    expect(output()).toContain('Test Files  2 passed (2)')
    expect(reporter.getSummary().cases.passed).toBe(2)
  })

  it('shows retries in a single-file terminal and slow cases in plain output', () => {
    const terminal = setup({ isTTY: true, fileCount: 1, watch: true })
    terminal.emit({ type: 'case-end', ...result(0, 'failed') })
    terminal.emit({ type: 'case-end', ...result(1, 'passed') })
    terminal.emit({
      type: 'file-end',
      entryId: entry.id,
      status: 'passed',
      durationMs: 6,
    })
    terminal.emit({ type: 'run-end', status: 'passed', durationMs: 6 })
    expect(terminal.output()).toContain(' DEV ')
    expect(terminal.output()).toContain('   ✓ renders 3ms (retry x1)')
    expect(terminal.output()).not.toContain('Failed Tests')
    const plain = setup()
    plain.emit({ type: 'case-end', ...result(0, 'passed'), durationMs: 301 })
    plain.emit({
      type: 'file-end',
      entryId: entry.id,
      status: 'passed',
      durationMs: 301,
    })
    expect(plain.output()).toContain('   ✓ renders 301ms')
  })

  it('strips producer ANSI in plain output and retains color when requested', () => {
    const plain = setup({ color: false })
    const colored = setup({ color: true })
    for (const target of [plain, colored]) {
      target.emit({
        type: 'output',
        stream: 'stdout',
        text: '\u001b[31mred\u001b[0m',
      })
      target.emit({ type: 'case-end', ...result(0, 'skipped') })
      target.emit({
        type: 'file-end',
        entryId: entry.id,
        status: 'skipped',
        durationMs: 0,
      })
      target.emit({ type: 'run-end', status: 'passed', durationMs: 0 })
    }
    expect(plain.output()).not.toContain('\u001b')
    expect(plain.output()).toContain(
      ' ↓ |node| example.test.ts (1 test | 1 skipped)'
    )
    expect(plain.output()).toContain('      Tests  1 skipped (1)')
    expect(colored.output()).toContain('\u001b[31mred\u001b[0m')
    expect(colored.output()).toContain(
      '\u001b[1m\u001b[30m\u001b[46m RUN \u001b[49m\u001b[39m\u001b[22m'
    )
  })

  it('renders structural suites and todo without splitting literal name separators', () => {
    const { reporter, emit, output } = setup({ isTTY: true, fileCount: 1 })
    const ancestors = [{ id: 'suite-1', name: 'suite > literal' }]
    emit({
      type: 'case-end',
      ...result(0, 'passed'),
      name: 'suite > literal > test > literal',
      testName: 'test > literal',
      ancestors,
      mode: 'run',
    })
    emit({
      type: 'case-end',
      ...result(0, 'skipped'),
      caseId: 'todo',
      name: 'suite > literal > pending',
      testName: 'pending',
      ancestors,
      mode: 'todo',
    })
    emit({
      type: 'file-end',
      entryId: entry.id,
      status: 'passed',
      durationMs: 3,
    })
    emit({ type: 'run-end', status: 'passed', durationMs: 3 })
    expect(output()).toContain(
      ' ✓ |node| example.test.ts (2 tests | 1 todo) 3ms\n   ✓ suite > literal (2)\n     ✓ test > literal 3ms\n     □ pending\n'
    )
    expect(output()).toContain('      Tests  1 passed | 1 todo (2)')
    expect(reporter.getSummary().cases.skipped).toBe(1)
  })

  it('uses stderr for user stderr, warnings and deferred failures', () => {
    let stderr = ''
    const { emit, output } = setup({
      writeError: (text) => {
        stderr += text
      },
    })
    emit({ type: 'output', stream: 'stderr', text: 'user stderr' })
    emit({
      type: 'diagnostic',
      diagnostic: { phase: 'runtime', severity: 'warning', message: 'warning' },
    })
    emit({
      type: 'case-end',
      ...result(0, 'failed'),
      errors: [
        { phase: 'runtime', severity: 'error', message: 'terminal failure' },
      ],
    })
    emit({
      type: 'file-end',
      entryId: entry.id,
      status: 'failed',
      durationMs: 3,
    })
    expect(stderr).not.toContain('terminal failure')
    emit({ type: 'run-end', status: 'failed', durationMs: 3 })
    expect(stderr).toContain('user stderr')
    expect(stderr).toContain('Warning: warning')
    expect(stderr).toContain('Failed Tests 1')
    expect(stderr).toContain('Error: terminal failure')
    expect(output()).not.toContain('terminal failure')
    expect(output()).toContain('Test Files  1 failed (1)')
  })

  it('formats real assertion values through the existing diff primitive', () => {
    const diagnostic = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '-e',
          `
      const { chai } = require(process.argv[1])
      const { serializeDiagnostic } = require(process.argv[2])
      try { chai.expect({ value: 1 }).to.deep.equal({ value: 2 }) }
      catch (error) { process.stdout.write(JSON.stringify(serializeDiagnostic(error, { phase: 'runtime' }))) }
    `,
          require.resolve('next/dist/compiled/next-test-primitives'),
          require.resolve(
            'next/dist/experimental/testing/reporting/diagnostics'
          ),
        ],
        { encoding: 'utf8' }
      )
    )
    expect(diagnostic.name).toBe('AssertionError')
    expect(diagnostic.diff).toContain('- Expected')
    expect(diagnostic.diff).toContain('+ Received')
    expect(diagnostic.diff).toContain('"value": 2')
    expect(diagnostic.diff).toContain('"value": 1')
    expect(
      serializeDiagnostic(
        { actual: 1, expected: 2, showDiff: false },
        { phase: 'runtime' }
      ).diff
    ).toBeUndefined()
  })

  it('loads standalone diff without initializing matcher globals', () => {
    execFileSync(process.execPath, [
      '-e',
      `
      const assert = require('node:assert/strict')
      const key = Symbol.for('$$jest-matchers-object')
      const before = Object.getOwnPropertyDescriptor(globalThis, key)
      const { printDiffOrStringify } = require(process.argv[1])
      assert.equal(typeof printDiffOrStringify, 'function')
      assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, key), before)
      assert.ok(printDiffOrStringify({ value: 1 }, { value: 2 }).includes('- Expected'))
    `,
      require.resolve('next/dist/compiled/next-test-primitives/diff'),
    ])
  })

  it('shows keyboard hints only when interactive input is enabled', () => {
    expect(formatWatchStatus('passed')).toBe(
      ' PASS  Waiting for file changes...\n'
    )
    expect(formatWatchStatus('failed')).toBe(
      ' FAIL  Tests failed. Watching for file changes...\n'
    )
    expect(formatWatchStatus('failed', true)).toBe(
      '\u001b[1m\u001b[30m\u001b[41m FAIL \u001b[49m\u001b[39m\u001b[22m \u001b[31mTests failed. Watching for file changes...\u001b[39m\n'
    )
    expect(formatWatchStatus('passed', false, true)).toBe(
      ' PASS  Waiting for file changes...\n       press h to show help, press q to quit\n'
    )
    expect(setup({ watch: true, rerun: true }).output()).toContain(' RERUN ')
  })

  it('relativizes only mapped project coordinates without changing standalone diagnostics', () => {
    const diagnostic = serializeDiagnostic('failed', {
      phase: 'runtime',
      frames: [
        {
          file: 'file:///project/app/page.tsx',
          line: 7,
          column: 3,
          original: true,
        },
        { file: '/outside/generated.js', line: 2, original: false },
      ],
    })
    expect(formatDiagnostic(diagnostic)).toContain(
      'file:///project/app/page.tsx:7:3'
    )
    expect(formatDiagnostic(diagnostic, '/project')).toContain(
      ' ❯ app/page.tsx:7:3'
    )
    expect(formatDiagnostic(diagnostic, '/project')).toContain(
      '/outside/generated.js:2 [generated]'
    )
  })

  it('serializes only producer-formatted string differences without invoking getters unsafely', () => {
    const error = Object.assign(new Error('different'), {
      diff: '- one\n+ two',
    })
    expect(serializeDiagnostic(error, { phase: 'runtime' }).diff).toBe(
      '- one\n+ two'
    )
    Object.defineProperty(error, 'diff', {
      get() {
        throw new Error('diff getter')
      },
    })
    expect(
      serializeDiagnostic(error, { phase: 'runtime' }).diff
    ).toBeUndefined()
  })

  it('fails zero-case compilation/collection failures and preserves original locations', () => {
    for (const phase of ['compilation', 'collection'] as const) {
      const { reporter, emit, output } = setup()
      emit({
        type: 'diagnostic',
        entryId: entry.id,
        diagnostic: serializeDiagnostic(new Error('invalid import'), {
          phase,
          location: { file: '/project/app/page.tsx', line: 12, column: 4 },
        }),
      })
      emit({
        type: 'file-end',
        entryId: entry.id,
        status: 'failed',
        durationMs: 2,
      })
      emit({ type: 'run-end', status: 'passed', durationMs: 2 })
      expect(reporter.getSummary()).toMatchObject({
        status: 'failed',
        cases: { passed: 0, failed: 0 },
        errors: 1,
      })
      expect(output()).toContain(' ❯ app/page.tsx:12:4')
      expect(output()).toContain(`[${phase}]`)
      expect(output()).toContain('Failed Suites 1')
      expect(output()).not.toContain('revision rev-1')
      expect(reporter.getEvents()).toContainEqual(
        expect.objectContaining({ type: 'file-start', revision: 'rev-1' })
      )
    }
  })

  it('retains failed-attempt errors, output and browser artifacts after a successful retry', () => {
    const { reporter, emit, output } = setup()
    const failed = result(0, 'failed')
    emit({ type: 'case-start', ...failed })
    emit({
      type: 'output',
      entryId: entry.id,
      caseId: failed.caseId,
      attempt: failed.attempt,
      stream: 'stderr',
      text: 'browser error',
    })
    emit({
      type: 'attachment',
      entryId: entry.id,
      caseId: failed.caseId,
      attempt: failed.attempt,
      attachment: {
        name: 'trace',
        kind: 'trace',
        path: '/artifacts/attempt-0/trace.zip',
        contentType: 'application/zip',
      },
    })
    emit({ type: 'case-end', ...failed })
    failed.errors[0].message = 'mutated by producer'
    emit({ type: 'case-end', ...result(1, 'passed') })
    emit({
      type: 'file-end',
      entryId: entry.id,
      status: 'passed',
      durationMs: 6,
    })
    emit({ type: 'run-end', status: 'passed', durationMs: 6 })
    expect(reporter.getSummary()).toMatchObject({
      status: 'passed',
      cases: { passed: 1, failed: 0 },
      attempts: { passed: 1, failed: 1 },
      attachments: 1,
    })
    const saved = reporter.getEvents()
    expect(saved.find((e) => e.type === 'case-end')).toMatchObject({
      errors: [{ message: 'render failed' }],
    })
    saved.length = 0
    expect(reporter.getEvents().length).toBeGreaterThan(0)
    expect(output()).toContain('renders (retry 0, repeat 0)')
    expect(output()).toContain('/artifacts/attempt-0/trace.zip')
    expect(output()).not.toContain('Failed Tests')
    expect(output()).not.toContain('render failed')
    expect(output()).not.toContain('1 failed')
    expect(output()).not.toContain('attempt-0-0')
  })

  it('counts repeats once and uses retry indices rather than arrival order', () => {
    const { reporter, emit } = setup()
    emit({ type: 'case-end', ...result(1, 'passed') })
    emit({ type: 'case-end', ...result(0, 'failed') })
    emit({ type: 'case-end', ...result(0, 'failed', 1) })
    emit({
      type: 'file-end',
      entryId: entry.id,
      status: 'failed',
      durationMs: 9,
    })
    emit({ type: 'run-end', status: 'failed', durationMs: 9 })
    expect(reporter.getSummary().cases).toEqual({
      passed: 0,
      failed: 1,
      skipped: 0,
      cancelled: 0,
    })
    expect(reporter.getSummary().attempts).toEqual({
      passed: 1,
      failed: 2,
      skipped: 0,
      cancelled: 0,
    })
  })

  it('does not silently pass missing terminal results or late cleanup failures', () => {
    const incomplete = setup()
    incomplete.emit({ type: 'run-end', status: 'passed', durationMs: 1 })
    expect(incomplete.reporter.getSummary().status).toBe('failed')
    const cleanup = setup()
    cleanup.emit({
      type: 'file-end',
      entryId: entry.id,
      status: 'passed',
      durationMs: 1,
    })
    cleanup.emit({
      type: 'diagnostic',
      entryId: entry.id,
      diagnostic: serializeDiagnostic('cleanup failed', { phase: 'cleanup' }),
    })
    cleanup.emit({ type: 'run-end', status: 'passed', durationMs: 1 })
    expect(cleanup.reporter.getSummary().status).toBe('failed')
  })

  it('preserves cancellation when a file cannot finish', () => {
    const { reporter, emit } = setup()
    emit({ type: 'run-end', status: 'cancelled', durationMs: 1 })
    expect(reporter.getSummary().status).toBe('cancelled')
  })

  it('rejects cross-run events, duplicate attempts and writer failures', () => {
    const { reporter, emit } = setup()
    expect(() =>
      reporter.onEvent({ ...envelope, runId: 'other', type: 'run-start' })
    ).toThrow('multiple runs')
    emit({ type: 'case-end', ...result(0, 'passed') })
    expect(() => emit({ type: 'case-end', ...result(0, 'passed') })).toThrow(
      'Duplicate attempt'
    )
    const broken = createTestReporter({
      write: () => {
        throw new Error('disk full')
      },
    })
    expect(() => broken.onEvent({ ...envelope, type: 'run-start' })).toThrow(
      'disk full'
    )
  })

  it('shows generated fallback without guessing original positions', () => {
    const diagnostic = serializeDiagnostic('failed', {
      phase: 'runtime',
      frames: [
        { file: '/chunks/generated.js', line: 5, column: 8, original: false },
      ],
    })
    expect(formatDiagnostic(diagnostic)).toContain(
      '/chunks/generated.js:5:8 [generated]'
    )
    expect(diagnostic.location).toBeUndefined()
  })

  it('retains all aggregate assertion errors', () => {
    const diagnostic = serializeDiagnostic(
      new AggregateError(
        [new Error('first assertion'), new Error('second assertion')],
        'Assertions failed'
      ),
      { phase: 'runtime' }
    )
    expect(diagnostic.errors?.map((error) => error.message)).toEqual([
      'first assertion',
      'second assertion',
    ])
    expect(formatDiagnostic(diagnostic)).toContain('second assertion')
  })

  it('preserves an aggregate when an element getter throws', () => {
    const error = new AggregateError([], 'original aggregate')
    Object.defineProperty(error.errors, '0', {
      get() {
        throw new Error('aggregate element getter')
      },
    })
    error.errors[1] = new Error('second child')
    const diagnostic = serializeSourceMappedDiagnostic(error, {
      phase: 'runtime',
    })
    expect(diagnostic.message).toBe('original aggregate')
    expect(diagnostic.errors?.map((child) => child.message)).toEqual([
      '[Unreadable aggregate error]',
      'second child',
    ])
  })

  it('does not call an aggregate array overridden map', () => {
    const error = new AggregateError([new Error('child')], 'original aggregate')
    error.errors.map = () => {
      throw new Error('overridden map')
    }
    expect(
      serializeSourceMappedDiagnostic(error, { phase: 'runtime' }).errors?.[0]
        .message
    ).toBe('child')
  })

  it('retains the parent when an aggregate array proxy is revoked', () => {
    const errors = Proxy.revocable([], {})
    const error = new AggregateError([], 'original aggregate')
    error.errors = errors.proxy
    errors.revoke()
    const diagnostic = serializeSourceMappedDiagnostic(error, {
      phase: 'runtime',
    })
    expect(diagnostic.message).toBe('original aggregate')
    expect(diagnostic.errors?.[0].message).toBe('[Unreadable aggregate error]')
  })

  it('bounds pathological sparse aggregate arrays', () => {
    const error = new AggregateError([], 'original aggregate')
    error.errors.length = 1_000_000
    const diagnostic = serializeDiagnostic(error, { phase: 'runtime' })
    expect(diagnostic.message).toBe('original aggregate')
    expect(diagnostic.errors).toHaveLength(1001)
    expect(diagnostic.errors?.[1000].message).toBe(
      '[999000 additional aggregate errors omitted]'
    )
  })

  it('serializes cross-realm errors, cycles and throwing accessors safely', () => {
    const error: { message: string; cause?: unknown } = { message: 'outer' }
    error.cause = error
    const serialized = serializeDiagnostic(error, { phase: 'runtime' })
    expect(serialized.cause?.message).toBe('[Circular error cause]')
    expect(() => JSON.stringify(serialized)).not.toThrow()
    expect(
      serializeDiagnostic(
        Object.defineProperty({}, 'message', {
          get() {
            throw new Error('getter')
          },
        }),
        { phase: 'runtime' }
      ).message
    ).toBe('Unknown thrown value')
    expect(serializeDiagnostic(null, { phase: 'runtime' }).message).toBe('null')
  })
})

describe('Next live test terminal', () => {
  afterEach(() => jest.useRealTimers())

  it('updates live elapsed time and active tests, then stops and restores the cursor', () => {
    jest.useFakeTimers()
    const { reporter, emit, output } = setup({ isTTY: true, fileCount: 2 })
    emit({ type: 'case-start', ...result(0, 'passed') })
    expect(output()).toContain('❯ |node| example.test.ts [running]')
    expect(output()).toContain('› renders')
    expect(output()).toContain('Test Files 0 passed (2)')
    jest.advanceTimersByTime(1500)
    expect(output()).toContain('Duration 1.50s')
    emit({ type: 'case-end', ...result(0, 'passed') })
    expect(output()).toContain('Tests 1 passed (1)')
    emit({ type: 'run-end', status: 'cancelled', durationMs: 1500 })
    const final = output()
    expect(final).toContain('\x1b[?25h')
    jest.advanceTimersByTime(1000)
    expect(output()).toBe(final)
    reporter.dispose()
  })

  it('keeps redraw escapes out of redirected output even when color is enabled', () => {
    jest.useFakeTimers()
    const { emit, output } = setup({ isTTY: false, color: true })
    jest.advanceTimersByTime(2000)
    emit({ type: 'run-end', status: 'cancelled', durationMs: 2000 })
    expect(output()).not.toContain('\x1b[?25')
    expect(output()).not.toContain('\x1b[0J')
  })

  it('suspends around prompts and partial stdout/stderr without losing permanent text', () => {
    let output = ''
    let errors = ''
    const terminal = createTestTerminal({
      isTTY: true,
      write: (text) => {
        output += text
      },
      writeError: (text) => {
        errors += text
      },
    })
    terminal.render(['progress'])
    terminal.write('partial')
    expect(output.endsWith('\x1b[?25h')).toBe(true)
    const partial = output
    terminal.render(['new progress'])
    expect(output).toBe(partial)
    terminal.write(' done\n', 'stderr')
    expect(errors).toBe(' done\n')
    expect(output).toContain('new progress')
    terminal.suspend()
    terminal.suspend()
    terminal.write('prompt: ')
    terminal.resume()
    const prompt = output
    terminal.render(['hidden'])
    expect(output).toBe(prompt)
    terminal.write('answer\n')
    terminal.resume()
    expect(output).toContain('hidden')
    terminal.dispose()
    expect(output.endsWith('\x1b[?25h')).toBe(true)
  })

  it('bounds multiline and wide text and accounts for narrower terminal reflow', () => {
    let output = ''
    let columns = 10
    const terminal = createTestTerminal({
      isTTY: true,
      columns: () => columns,
      rows: 4,
      write: (text) => {
        output += text
      },
    })
    terminal.render(['中文中文中文', 'emoji 👩‍💻👩‍💻👩‍💻', 'a\nb', 'omitted'])
    expect(output).toContain('中文中文\n')
    expect(output).toContain('emoji 👩‍💻\n')
    expect(output).toContain('a b\n')
    expect(output).not.toContain('omitted')
    columns = 5
    terminal.render(['short'])
    expect(output).toContain('\x1b[5A\r\x1b[0J')
    terminal.dispose()
  })

  it('restores the cursor and stops redraw after stderr or timer writer errors', () => {
    jest.useFakeTimers()
    let output = ''
    let fail = false
    const errors: unknown[] = []
    const reporter = createTestReporter({
      isTTY: true,
      write: (text) => {
        if (fail && text.includes('Duration')) throw new Error('timer write')
        output += text
      },
      writeError: () => {
        throw new Error('stderr write')
      },
      onError: (error) => {
        errors.push(error)
        throw new Error('callback failed')
      },
    })
    reporter.onEvent({ ...envelope, type: 'run-start' })
    fail = true
    jest.advanceTimersByTime(100)
    expect(errors).toEqual([new Error('timer write')])
    expect(output.endsWith('\x1b[?25h')).toBe(true)
    const final = output
    jest.advanceTimersByTime(1000)
    expect(output).toBe(final)
    expect(() =>
      reporter.onEvent({
        ...envelope,
        type: 'output',
        stream: 'stderr',
        text: 'message',
      })
    ).toThrow('timer write')

    const broken = createTestReporter({
      isTTY: true,
      write: (text) => {
        output += text
      },
      writeError: () => {
        throw new Error('stderr write')
      },
    })
    broken.onEvent({ ...envelope, type: 'run-start' })
    expect(() =>
      broken.onEvent({
        ...envelope,
        type: 'output',
        stream: 'stderr',
        text: 'message',
      })
    ).toThrow('stderr write')
    expect(output.endsWith('\x1b[?25h')).toBe(true)
  })

  it('leaves a supplied terminal reusable after reporter disposal', () => {
    let output = ''
    const terminal = createTestTerminal({
      isTTY: true,
      write: (text) => {
        output += text
      },
    })
    const reporter = createTestReporter({
      terminal,
      isTTY: true,
      write: () => {
        throw new Error('must use shared terminal')
      },
    })
    reporter.onEvent({ ...envelope, type: 'run-start' })
    reporter.dispose()
    terminal.render(['next run'])
    expect(output).toContain('next run')
    terminal.dispose()
  })
})

describe('Next structured source attribution', () => {
  afterEach(() => setBundlerFindSourceMapImplementation(() => undefined))

  it('maps original coordinates with the existing Next mapper, including aggregate children and causes', () => {
    // Generated position 1:0 maps to original position 7:2 (zero-based column).
    const payload = {
      version: 3,
      file: '/chunks/example.js',
      sources: ['file:///project/example.test.ts'],
      sourcesContent: [
        [
          'one',
          'two',
          'three',
          'four',
          'five',
          'six',
          '  fail()',
          'eight',
          'nine',
        ].join('\n'),
      ],
      names: [],
      mappings: 'AAME',
    }
    setBundlerFindSourceMapImplementation((file) =>
      file === 'file:///chunks/example.js' ? payload : undefined
    )
    const error = new Error('original failure')
    error.stack =
      'Error: original failure\n    at example (/chunks/example.js:1:1)'
    const diagnostic = serializeSourceMappedDiagnostic(
      new AggregateError([error], 'Assertions failed', { cause: error }),
      { phase: 'runtime' }
    )
    expect(diagnostic.errors?.[0].frames?.[0]).toMatchObject({
      file: 'file:///project/example.test.ts',
      line: 7,
      column: 3,
      original: true,
      codeFrame:
        '      5| five\n      6| six\n      7|   fail()\n       |   ^\n      8| eight\n      9| nine',
    })
    expect(diagnostic.cause?.frames?.[0]).toMatchObject({
      file: 'file:///project/example.test.ts',
      line: 7,
      column: 3,
      original: true,
    })
    expect(error.stack).toContain('/chunks/example.js:1:1')
    expect(getSourceMappedStackFrames(error.stack)[0]).not.toHaveProperty(
      'getSourceContent'
    )
    expect(formatDiagnostic(diagnostic)).toContain(
      '      7|   fail()\n       |   ^'
    )
  })

  it('captures only the first nonignored original excerpt from retained source content', () => {
    const source = 'throw new Error("retained revision")\n'
    setBundlerFindSourceMapImplementation((file) => {
      if (!file.startsWith('file:///chunks/')) return undefined
      const ignored = file.endsWith('/ignored.js')
      return {
        version: 3,
        file,
        sources: ['file:///project/retained.test.ts'],
        sourcesContent: [source],
        names: [],
        mappings: 'AAAA',
        ignoreList: ignored ? [0] : [],
      }
    })
    const error = new Error('failure')
    error.stack = [
      'Error: failure',
      '    at ignored (/chunks/ignored.js:1:1)',
      '    at original (/chunks/first.js:1:1)',
      '    at repeated (/chunks/second.js:1:1)',
    ].join('\n')
    const frames = serializeSourceMappedDiagnostic(error, {
      phase: 'runtime',
    }).frames!
    expect(frames[0]).not.toHaveProperty('codeFrame')
    expect(frames[0].ignored).toBe(true)
    expect(frames[1].ignored).toBe(false)
    expect(frames[1].codeFrame).toBe(
      '      1| throw new Error("retained revision")\n       | ^\n      2|'
    )
    expect(frames[2]).not.toHaveProperty('codeFrame')
    expect(frames[1]).not.toHaveProperty('getSourceContent')
  })

  it('hides ignored frames only in human output while retaining diagnostic evidence', () => {
    const diagnostic = serializeDiagnostic(new Error('failure'), {
      phase: 'runtime',
      frames: [
        {
          file: '/project/node_modules/internal.js',
          line: 1,
          column: 1,
          original: true,
          ignored: true,
        },
        {
          file: '/project/example.test.ts',
          line: 2,
          column: 1,
          original: true,
          ignored: false,
          codeFrame: '      2| fail()\n       | ^',
        },
        {
          file: '/project/unmapped.js',
          line: 3,
          column: 1,
          original: false,
          ignored: false,
        },
      ],
    })
    const { reporter, emit, output } = setup()
    emit({ type: 'case-end', ...result(0, 'failed'), errors: [diagnostic] })
    emit({
      type: 'file-end',
      entryId: entry.id,
      status: 'failed',
      durationMs: 3,
    })
    emit({ type: 'run-end', status: 'failed', durationMs: 3 })
    expect(output()).not.toContain('internal.js')
    expect(output()).toContain(
      'example.test.ts:2:1\n      2| fail()\n       | ^'
    )
    expect(output()).toContain('unmapped.js:3:1 [generated]')
    expect(formatDiagnostic(diagnostic)).toContain(
      '/project/node_modules/internal.js:1:1'
    )
    expect(reporter.getEvents()).toContainEqual(
      expect.objectContaining({ type: 'case-end', errors: [diagnostic] })
    )
    // Do not resurrect the raw internal stack when every mapped frame is hidden.
    expect(
      formatDiagnostic(
        { ...diagnostic, frames: diagnostic.frames!.slice(0, 1) },
        '/project'
      )
    ).toBe('Error: failure')
  })

  it.each([undefined, 'x'.repeat(100_001), 'x'.repeat(201)])(
    'omits missing or oversized source excerpts while retaining original coordinates',
    (source) => {
      setBundlerFindSourceMapImplementation(() => ({
        version: 3,
        file: '/chunks/bounded.js',
        sources: ['file:///project/retained.test.ts'],
        ...(source === undefined ? {} : { sourcesContent: [source] }),
        names: [],
        mappings: 'AAAA',
      }))
      const error = new Error('failure')
      error.stack = 'Error: failure\n    at original (/chunks/bounded.js:1:1)'
      const frame = serializeSourceMappedDiagnostic(error, {
        phase: 'runtime',
      }).frames![0]
      expect(frame).toMatchObject({ original: true, line: 1, column: 1 })
      expect(frame).not.toHaveProperty('codeFrame')
    }
  )

  it('preserves generated positions when a map is missing or lookup fails', () => {
    const stack = 'Error: failure\n    at example (/chunks/missing.js:12:8)'
    expect(getSourceMappedStackFrames(stack)[0]).toMatchObject({
      file: '/chunks/missing.js',
      line1: 12,
      column1: 8,
      original: false,
    })
    setBundlerFindSourceMapImplementation(() => {
      throw new Error('lookup failed')
    })
    const error = new Error('original error')
    error.stack = stack
    const diagnostic = serializeSourceMappedDiagnostic(error, {
      phase: 'runtime',
    })
    expect(diagnostic.message).toBe('original error')
    expect(diagnostic.frames?.[0]).toMatchObject({
      file: '/chunks/missing.js',
      line: 12,
      column: 8,
      original: false,
    })
    expect(formatDiagnostic(diagnostic)).toContain('[generated]')
  })
})

describe('Next machine result reporters', () => {
  it.each(
    ([undefined, false, true] as const).flatMap(
      (emptySelectionPassWithNoTests) =>
        [false, true].map((hasEntry) => ({
          emptySelectionPassWithNoTests,
          hasEntry,
        }))
    )
  )(
    'keeps empty JSON policy $emptySelectionPassWithNoTests separate from owned outcomes (hasEntry=$hasEntry)',
    ({ emptySelectionPassWithNoTests, hasEntry }) => {
      const machine = createMachineReporter({
        projectDir: '/project',
        reporters: ['json'],
        ...(emptySelectionPassWithNoTests === undefined
          ? {}
          : { emptySelectionPassWithNoTests }),
      })
      const emit = (event: object) =>
        machine.onEvent({ ...envelope, ...event } as ResultEvent)
      try {
        emit({ type: 'run-start' })
        if (hasEntry) {
          emit({ type: 'file-start', entry })
          emit({ type: 'case-end', ...result(0, 'passed') })
          emit({
            type: 'file-end',
            entryId: entry.id,
            status: 'passed',
            durationMs: 3,
          })
        }
        emit({ type: 'run-end', status: 'passed', durationMs: 3 })
        const report = machine.getJson()
        expect(report.success).toBe(
          hasEntry || emptySelectionPassWithNoTests !== false
        )
        expect(report.numPassedTests).toBe(hasEntry ? 1 : 0)
        expect(report.numFailedTests).toBe(0)
        expect(report.next.summary.status).toBe('passed')
        expect(
          report.next.events.find((event) => event.type === 'run-end')
        ).toMatchObject({ status: 'passed' })
        expect(machine.getJUnit()).toContain(
          hasEntry ? 'failures="0"' : '<testsuites></testsuites>'
        )
      } finally {
        machine.dispose()
      }
    }
  )

  it('retains retry evidence while reporting final outcomes, todo, and collection errors', async () => {
    const machine = createMachineReporter({
      projectDir: '/project',
      reporters: ['json'],
    })
    const emit = (event: object) =>
      machine.onEvent({ ...envelope, ...event } as ResultEvent)
    emit({ type: 'run-start' })
    emit({ type: 'file-start', entry })
    emit({ type: 'case-end', ...result(0, 'failed') })
    emit({ type: 'case-end', ...result(1, 'passed') })
    emit({
      type: 'case-end',
      ...result(0, 'skipped'),
      caseId: 'todo',
      attempt: { id: 'todo', retry: 0, repeat: 0 },
      mode: 'todo',
      name: 'todo',
    })
    emit({
      type: 'diagnostic',
      entryId: entry.id,
      diagnostic: serializeDiagnostic(new Error('teardown <failed>'), {
        phase: 'cleanup',
      }),
    })
    emit({
      type: 'file-end',
      entryId: entry.id,
      durationMs: 20,
      status: 'failed',
    })
    emit({ type: 'run-end', status: 'failed', durationMs: 20 })
    const report = machine.getJson()
    expect(report).toMatchObject({
      numTotalTests: 2,
      numPassedTests: 1,
      numFailedTests: 0,
      numTodoTests: 1,
      success: false,
    })
    expect(
      report.next.events.filter((event) => event.type === 'case-end')
    ).toHaveLength(3)
    expect(report.testResults[0].message).toContain('teardown <failed>')
    expect(machine.getJUnit()).toContain('teardown &lt;failed&gt;')
    expect(machine.getJUnit()).toContain('<error')
    machine.dispose()
  })

  it.each([
    'rejection',
    'case failure',
    'cleanup failure',
    'run error',
    'cancelled',
  ])('keeps task JSON separate from the command outcome for %s', (mode) => {
    const machine = createMachineReporter({
      projectDir: '/project',
      reporters: ['json'],
    })
    const emit = (event: object) =>
      machine.onEvent({ ...envelope, ...event } as ResultEvent)
    emit({ type: 'run-start' })
    emit({ type: 'file-start', entry })
    emit({
      type: 'case-end',
      ...result(0, mode === 'case failure' ? 'failed' : 'passed'),
    })
    emit({
      type: 'diagnostic',
      entryId: entry.id,
      diagnostic: {
        ...serializeDiagnostic(new Error('real unhandled rejection'), {
          phase: 'runtime',
        }),
        unhandled: 'rejection',
      },
    })
    if (mode === 'cleanup failure' || mode === 'run error')
      emit({
        type: 'diagnostic',
        ...(mode === 'cleanup failure' ? { entryId: entry.id } : {}),
        diagnostic: serializeDiagnostic(new Error('separate failure'), {
          phase: 'cleanup',
        }),
      })
    emit({
      type: 'file-end',
      entryId: entry.id,
      durationMs: 20,
      status: mode === 'cancelled' ? 'cancelled' : 'failed',
    })
    emit({
      type: 'run-end',
      status: mode === 'cancelled' ? 'cancelled' : 'failed',
      durationMs: 20,
    })
    const report = machine.getJson()
    expect(report.success).toBe(mode === 'rejection')
    expect(report.numPassedTests).toBe(mode === 'case failure' ? 0 : 1)
    expect(report.numFailedTests).toBe(mode === 'case failure' ? 1 : 0)
    expect(report.testResults[0].status).toBe(
      mode === 'rejection' || mode === 'run error' ? 'passed' : 'failed'
    )
    expect(report.testResults[0].message).not.toContain(
      'real unhandled rejection'
    )
    expect(report.next.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'diagnostic',
          diagnostic: expect.objectContaining({
            unhandled: 'rejection',
            message: 'real unhandled rejection',
          }),
        }),
        expect.objectContaining({
          type: 'run-end',
          status: mode === 'cancelled' ? 'cancelled' : 'failed',
        }),
      ])
    )
    machine.dispose()
  })

  it('uses source-file classnames and ancestor-qualified names for JUnit cases', () => {
    const machine = createMachineReporter({
      projectDir: '/project',
      reporters: ['junit'],
    })
    const emit = (event: object) =>
      machine.onEvent({ ...envelope, ...event } as ResultEvent)
    emit({ type: 'run-start' })
    emit({ type: 'file-start', entry })
    emit({
      type: 'case-end',
      ...result(0, 'passed'),
      testName: 'renders & reads',
      ancestors: [{ id: 'suite', name: 'outer' }],
    })
    emit({
      type: 'case-end',
      ...result(0, 'skipped'),
      caseId: 'unselected',
      attempt: { id: 'unselected', retry: 0, repeat: 0 },
      mode: 'skip',
      durationMs: 0,
    })
    emit({
      type: 'file-end',
      entryId: entry.id,
      status: 'passed',
      durationMs: 3,
    })
    emit({ type: 'run-end', status: 'passed', durationMs: 3 })
    expect(machine.getJUnit()).toContain(
      '<testcase classname="example.test.ts" name="outer &gt; renders &amp; reads"'
    )
    expect(machine.getJUnit()).toContain('name="renders" time="0"><skipped/>')
    machine.dispose()
  })

  it('retains empty and cleanup-failing suite metadata without failing their passing cases', () => {
    const machine = createMachineReporter({
      projectDir: '/project',
      reporters: ['json'],
    })
    const emit = (event: object) =>
      machine.onEvent({ ...envelope, ...event } as ResultEvent)
    emit({ type: 'run-start' })
    emit({ type: 'file-start', entry })
    emit({ type: 'case-end', ...result(0, 'passed') })
    for (const [suiteId, mode, status] of [
      ['empty', 'run', 'failed'],
      ['skipped', 'skip', 'skipped'],
      ['todo', 'todo', 'skipped'],
      [entry.id, 'run', 'failed'],
    ]) {
      emit({
        type: 'suite-end',
        entryId: entry.id,
        suiteId,
        name: suiteId,
        mode,
        status,
        durationMs: 0,
        ancestors: [],
        errors: [],
      })
    }
    emit({
      type: 'file-end',
      entryId: entry.id,
      status: 'failed',
      durationMs: 3,
    })
    emit({ type: 'run-end', status: 'failed', durationMs: 3 })
    expect(machine.getJson()).toMatchObject({
      numTotalTestSuites: 4,
      numFailedTestSuites: 2,
      numPassedTestSuites: 1,
      numPendingTestSuites: 1,
      numPassedTests: 1,
      numFailedTests: 0,
    })
    machine.dispose()
  })

  it('preserves complete bare JSON messages when failures have no saved stack', () => {
    for (const thrown of [
      null,
      'first\nsecond',
      { name: 'Fault', message: 'bare', stack: '' },
    ]) {
      const machine = createMachineReporter({
        projectDir: '/project',
        reporters: ['json'],
      })
      const emit = (event: object) =>
        machine.onEvent({ ...envelope, ...event } as ResultEvent)
      emit({ type: 'run-start' })
      emit({ type: 'file-start', entry })
      emit({
        type: 'case-end',
        ...result(0, 'failed'),
        errors: [serializeDiagnostic(thrown, { phase: 'runtime' })],
      })
      emit({
        type: 'file-end',
        entryId: entry.id,
        status: 'failed',
        durationMs: 1,
      })
      emit({ type: 'run-end', status: 'failed', durationMs: 1 })
      expect(
        machine.getJson().testResults[0].assertionResults[0].failureMessages
      ).toEqual([
        typeof thrown === 'object' && thrown ? thrown.message : String(thrown),
      ])
      machine.dispose()
    }
  })

  it('matches aggregate task failure messages while retaining the original diagnostic tree', () => {
    const machine = createMachineReporter({
      projectDir: '/project',
      reporters: ['json'],
    })
    const emit = (event: object) =>
      machine.onEvent({ ...envelope, ...event } as ResultEvent)
    const diagnostic = serializeDiagnostic(
      new AggregateError([new Error('first'), new Error('second')], 'combined'),
      { phase: 'runtime' }
    )
    emit({ type: 'run-start' })
    emit({ type: 'file-start', entry })
    emit({ type: 'case-end', ...result(0, 'failed'), errors: [diagnostic] })
    emit({
      type: 'file-end',
      entryId: entry.id,
      status: 'failed',
      durationMs: 3,
    })
    emit({ type: 'run-end', status: 'failed', durationMs: 3 })
    const report = machine.getJson()
    expect(
      report.testResults[0].assertionResults[0].failureMessages.map(
        (message) => message.split('\n')[0]
      )
    ).toEqual(['Error: first', 'Error: second'])
    expect(
      report.next.events.find((event) => event.type === 'case-end')
    ).toMatchObject({
      errors: [
        {
          name: 'AggregateError',
          message: 'combined',
          errors: [{ message: 'first' }, { message: 'second' }],
        },
      ],
    })
    machine.dispose()
  })

  it('preserves a saved async assertion stack heading without changing the structured error name', () => {
    const machine = createMachineReporter({
      projectDir: '/project',
      reporters: ['json'],
    })
    const emit = (event: object) =>
      machine.onEvent({ ...envelope, ...event } as ResultEvent)
    const error = new Error('async mismatch')
    error.name = 'AssertionError'
    error.stack =
      'Error: async mismatch\n    at original (/project/example.test.ts:12:3)'
    const diagnostic = serializeDiagnostic(error, { phase: 'runtime' })
    emit({ type: 'run-start' })
    emit({ type: 'file-start', entry })
    emit({ type: 'case-end', ...result(0, 'failed'), errors: [diagnostic] })
    emit({
      type: 'file-end',
      entryId: entry.id,
      status: 'failed',
      durationMs: 3,
    })
    emit({ type: 'run-end', status: 'failed', durationMs: 3 })
    const report = machine.getJson()
    expect(
      report.testResults[0].assertionResults[0].failureMessages[0].split(
        '\n'
      )[0]
    ).toBe('Error: async mismatch')
    expect(
      report.next.events.find((event) => event.type === 'case-end')
    ).toMatchObject({
      errors: [{ name: 'AssertionError', stack: error.stack }],
    })
    machine.dispose()
  })

  it('a runtime skip overrides earlier repeat failures while retaining all error evidence', () => {
    const machine = createMachineReporter({
      projectDir: '/project',
      reporters: ['json'],
    })
    const emit = (event: object) =>
      machine.onEvent({ ...envelope, ...event } as ResultEvent)
    const first = result(0, 'failed')
    const skipped = {
      ...result(0, 'skipped', 1),
      pending: true,
      mode: 'skip' as const,
      note: 'reason',
      errors: first.errors,
    }
    emit({ type: 'run-start' })
    emit({ type: 'file-start', entry })
    emit({ type: 'case-end', ...first })
    emit({ type: 'case-end', ...skipped })
    emit({
      type: 'file-end',
      entryId: entry.id,
      status: 'passed',
      durationMs: 3,
    })
    emit({ type: 'run-end', status: 'passed', durationMs: 3 })
    const report = machine.getJson()
    expect(report).toMatchObject({
      success: true,
      numPendingTests: 1,
      numFailedTests: 0,
    })
    expect(report.testResults[0].assertionResults[0].failureMessages).toEqual(
      []
    )
    expect(
      report.next.events.filter((event) => event.type === 'case-end')
    ).toMatchObject([
      { status: 'failed', errors: [{ message: 'render failed' }] },
      {
        status: 'skipped',
        pending: true,
        note: 'reason',
        errors: [{ message: 'render failed' }],
      },
    ])
    expect(
      getFinalCaseResults([first, skipped]).get(first.caseId)?.pending
    ).toBe(true)
    machine.dispose()
  })

  it('reports bailed declarations as unexecuted pending cases without hiding real cancellation', () => {
    const machine = createMachineReporter({
      projectDir: '/project',
      reporters: ['json'],
    })
    const emit = (event: object) =>
      machine.onEvent({ ...envelope, ...event } as ResultEvent)
    emit({ type: 'run-start' })
    emit({ type: 'file-start', entry })
    emit({ type: 'case-end', ...result(0, 'failed') })
    emit({
      type: 'case-end',
      ...result(0, 'cancelled'),
      caseId: 'bailed',
      mode: 'run',
      bail: true,
    })
    emit({
      type: 'case-end',
      ...result(0, 'cancelled'),
      caseId: 'cancelled',
      mode: 'run',
    })
    emit({
      type: 'file-end',
      entryId: entry.id,
      status: 'failed',
      durationMs: 3,
    })
    emit({ type: 'run-end', status: 'failed', durationMs: 3 })
    const report = machine.getJson()
    expect(report).toMatchObject({
      success: false,
      numTotalTests: 3,
      numFailedTests: 2,
      numPendingTests: 0,
      numPassedTests: 0,
    })
    expect(
      report.testResults[0].assertionResults.map((test) => test.status)
    ).toEqual(['failed', 'pending', 'failed'])
    expect(report.testResults[0].assertionResults[1]).not.toHaveProperty(
      'duration'
    )
    expect(
      report.testResults[0].assertionResults[0].failureMessages[0]
    ).toContain('render failed')
    machine.dispose()
  })

  it('refuses incomplete reports and propagates output failures', async () => {
    const machine = createMachineReporter({
      projectDir: '/project',
      reporters: ['json'],
      write: () => {
        throw new Error('reporter output failed')
      },
    })
    machine.onEvent({ ...envelope, type: 'run-start' })
    await expect(machine.finish()).rejects.toThrow(
      'before authoritative run cleanup'
    )
    machine.onEvent({
      ...envelope,
      type: 'run-end',
      status: 'passed',
      durationMs: 0,
    })
    await expect(machine.finish()).rejects.toThrow('reporter output failed')
    machine.dispose()
  })

  it('diagnoses unsupported and duplicate reporter selection', () => {
    expect(() => parseResultReporters(['json', 'json'])).toThrow(
      'without duplicates'
    )
    expect(parseResultReporters(['custom'])).toEqual(['custom'])
  })
})

it('merges disjoint Next blobs while preserving failures and rejects duplicated shards', async () => {
  const root = await mkdtemp(join(tmpdir(), 'next-merged-reports-'))
  const input = join(root, 'blobs')
  const outputFile = join(root, 'merged.json')
  await mkdir(input)
  try {
    for (let index = 0; index < 2; index++) {
      const identity = `shard-${index}`
      const selected = {
        ...entry,
        id: identity,
        file: `/project/shard-${index}.test.ts`,
      }
      const wrap = (event: object) => ({
        ...envelope,
        runId: identity,
        ...event,
      })
      const status = index ? 'failed' : 'passed'
      const blob = {
        version: 1,
        kind: 'next-test-results',
        referenceVersion: '5.0.4',
        projectDir: '/project',
        events: [
          wrap({ type: 'run-start' }),
          wrap({ type: 'file-start', entry: selected }),
          wrap({ type: 'case-end', ...result(0, status), entryId: identity }),
          wrap({
            type: 'suite-end',
            entryId: identity,
            suiteId: `${identity}/empty`,
            name: 'empty',
            ancestors: [],
            mode: 'skip',
            status: 'skipped',
            durationMs: 0,
            errors: [],
          }),
          wrap({
            type: 'suite-end',
            entryId: identity,
            suiteId: identity,
            name: '',
            ancestors: [],
            mode: 'run',
            status,
            durationMs: 10,
            errors: [],
          }),
          wrap({ type: 'file-end', entryId: identity, status, durationMs: 10 }),
          wrap({ type: 'run-end', status, durationMs: 10 }),
        ],
      }
      await writeFile(join(input, `shard-${index}.json`), JSON.stringify(blob))
    }
    expect(
      await mergeResultReports(input, {
        projectDir: root,
        reporters: ['json'],
        outputFile,
      })
    ).toBe('failed')
    const content = await readFile(outputFile, 'utf8')
    const merged = JSON.parse(content)
    expect(merged).toMatchObject({
      numTotalTests: 2,
      numPassedTests: 1,
      numFailedTests: 1,
      numTotalTestSuites: 4,
      numPassedTestSuites: 3,
      numFailedTestSuites: 1,
      success: false,
    })
    expect(merged.testResults[0].name).toBe(join(root, 'shard-0.test.ts'))
    await writeFile(
      join(input, 'duplicate.json'),
      await readFile(join(input, 'shard-0.json'))
    )
    await expect(
      mergeResultReports(input, {
        projectDir: root,
        reporters: ['json'],
        outputFile,
      })
    ).rejects.toThrow('Duplicate or invalid blob run identity')
    expect(await readFile(outputFile, 'utf8')).toBe(content)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('round-trips unstarted bail results without accepting an executed cancellation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'next-bail-blob-'))
  const input = join(root, 'blobs')
  const outputFile = join(root, 'result.json')
  await mkdir(input)
  try {
    const events = [
      { type: 'run-start' },
      { type: 'file-start', entry },
      { type: 'case-start', ...result(0, 'failed') },
      { type: 'case-end', ...result(0, 'failed') },
      {
        type: 'case-end',
        ...result(0, 'cancelled'),
        caseId: 'unstarted',
        attempt: { id: 'unstarted', retry: 0, repeat: 0 },
        mode: 'run',
        bail: true,
        durationMs: 0,
      },
      { type: 'file-end', entryId: entry.id, status: 'failed', durationMs: 3 },
      { type: 'run-end', status: 'failed', durationMs: 3 },
    ].map((event) => ({ ...envelope, ...event }))
    await writeFile(
      join(input, 'bail.json'),
      JSON.stringify({
        version: 1,
        kind: 'next-test-results',
        referenceVersion: '5.0.4',
        projectDir: '/project',
        events,
      })
    )
    await expect(
      mergeResultReports(input, {
        projectDir: root,
        reporters: ['json'],
        outputFile,
      })
    ).resolves.toBe('failed')
    const report = JSON.parse(await readFile(outputFile, 'utf8'))
    expect(report).toMatchObject({
      numTotalTests: 2,
      numFailedTests: 1,
      numPendingTests: 0,
    })
    expect(
      report.testResults[0].assertionResults.map((test: any) => test.status)
    ).toEqual(['failed', 'pending'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it.each([
  [
    'bail after case start',
    (events: any[]) => {
      Object.assign(events[2], {
        status: 'cancelled',
        mode: 'run',
        bail: true,
        durationMs: 0,
        errors: [],
      })
      events.splice(2, 0, { ...events[2], type: 'case-start' })
    },
  ],
  [
    'bail after earlier attempt',
    (events: any[]) => {
      Object.assign(events[2], {
        status: 'cancelled',
        mode: 'run',
        bail: true,
        durationMs: 0,
        errors: [],
      })
      events.splice(2, 0, {
        ...events[2],
        bail: undefined,
        status: 'passed',
        attempt: { id: 'earlier', retry: 0, repeat: 0 },
      })
    },
  ],
  [
    'bail with retry identity',
    (events: any[]) => {
      Object.assign(events[2], {
        status: 'cancelled',
        mode: 'run',
        bail: true,
        durationMs: 0,
        errors: [],
        attempt: { id: 'retry', retry: 1, repeat: 0 },
      })
    },
  ],
  [
    'invalid bail flag',
    (events: any[]) => {
      events[2].bail = 'yes'
    },
  ],
  [
    'bailed passing result',
    (events: any[]) => {
      events[2].bail = true
    },
  ],
  [
    'bailed failed result',
    (events: any[]) => {
      events[2].bail = true
      events[2].status = 'cancelled'
      events[2].mode = 'run'
      events[2].errors = [
        serializeDiagnostic(new Error('original failure'), {
          phase: 'runtime',
        }),
      ]
    },
  ],
  [
    'invalid pending flag',
    (events: any[]) => {
      events[2].pending = 'yes'
    },
  ],
  [
    'pending passing result',
    (events: any[]) => {
      events[2].pending = true
    },
  ],
  [
    'invalid skip note',
    (events: any[]) => {
      events[2].note = {}
    },
  ],
  [
    'missing root suite',
    (events: any[]) =>
      events.splice(3, 0, {
        ...events[2],
        type: 'suite-end',
        suiteId: 'child',
        mode: 'run',
        ancestors: [],
      }),
  ],
  [
    'missing suite ancestor',
    (events: any[]) => {
      const suite = {
        ...events[2],
        type: 'suite-end',
        mode: 'run',
        suiteId: events[1].entry.id,
        ancestors: [],
      }
      events.splice(
        3,
        0,
        {
          ...suite,
          suiteId: 'child',
          ancestors: [{ id: 'missing', name: 'missing' }],
        },
        suite
      )
    },
  ],
  [
    'duplicate suite',
    (events: any[]) => {
      const suite = {
        ...events[2],
        type: 'suite-end',
        suiteId: 'suite',
        mode: 'run',
        ancestors: [],
      }
      events.splice(3, 0, suite, { ...suite })
    },
  ],
  [
    'invalid suite ancestors',
    (events: any[]) =>
      events.splice(3, 0, {
        ...events[2],
        type: 'suite-end',
        suiteId: 'suite',
        mode: 'run',
        ancestors: [{}],
      }),
  ],
  [
    'suite after file completion',
    (events: any[]) =>
      events.splice(4, 0, {
        ...events[2],
        type: 'suite-end',
        suiteId: 'suite',
        mode: 'run',
        ancestors: [],
      }),
  ],
  [
    'nested run-start',
    (events: any[]) => events.splice(2, 0, { ...events[0] }),
  ],
  [
    'nested run-end',
    (events: any[]) => events.splice(2, 0, { ...events.at(-1) }),
  ],
  [
    'duplicate file-end',
    (events: any[]) => events.splice(4, 0, { ...events[3] }),
  ],
  [
    'duplicate attempt',
    (events: any[]) => events.splice(3, 0, { ...events[2] }),
  ],
  ['missing file-end', (events: any[]) => events.splice(3, 1)],
  [
    'foreign shard ownership',
    (events: any[]) => {
      events[2].entryId = 'first'
    },
  ],
  [
    'invalid diagnostic',
    (events: any[]) =>
      events.splice(3, 0, {
        ...events[0],
        type: 'diagnostic',
        diagnostic: {
          severity: 'silenced',
          message: 'lost failure',
          phase: 'runtime',
        },
      }),
  ],
  [
    'invalid case error',
    (events: any[]) => {
      events[2].errors = [{}]
    },
  ],
  [
    'invalid output',
    (events: any[]) =>
      events.splice(3, 0, {
        ...events[0],
        type: 'output',
        stream: 'stdout',
        text: {},
      }),
  ],
  [
    'invalid completion duration',
    (events: any[]) => {
      events.at(-1).durationMs = -1
    },
  ],
] as const)(
  'rejects %s before publishing a merged report',
  async (_name, mutate) => {
    const root = await mkdtemp(join(tmpdir(), 'next-invalid-merge-'))
    const input = join(root, 'blobs')
    const outputFile = join(root, 'merged.json')
    await mkdir(input)
    await writeFile(outputFile, 'previous report')
    try {
      for (const id of ['first', 'second']) {
        const events = [
          { type: 'run-start' },
          {
            type: 'file-start',
            entry: { ...entry, id, file: `/project/${id}.test.ts` },
          },
          { type: 'case-end', ...result(0, 'passed'), entryId: id },
          { type: 'file-end', entryId: id, status: 'passed', durationMs: 1 },
          { type: 'run-end', status: 'passed', durationMs: 1 },
        ].map((event) => ({ ...envelope, runId: id, ...event }))
        if (id === 'second') mutate(events)
        await writeFile(
          join(input, `${id}.json`),
          JSON.stringify({
            version: 1,
            kind: 'next-test-results',
            referenceVersion: '5.0.4',
            projectDir: '/project',
            events,
          })
        )
      }
      await expect(
        mergeResultReports(input, {
          projectDir: root,
          reporters: ['json'],
          outputFile,
        })
      ).rejects.toThrow()
      expect(await readFile(outputFile, 'utf8')).toBe('previous report')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
)

it('replaces failed retries while retaining failed or cancelled repeats independently per case', () => {
  const cases = getFinalCaseResults([
    result(0, 'failed'),
    result(1, 'passed'),
    result(0, 'passed', 1),
    { ...result(0, 'failed'), caseId: 'failed repeat' },
    { ...result(0, 'passed', 1), caseId: 'failed repeat' },
    { ...result(0, 'cancelled'), caseId: 'cancelled repeat' },
    { ...result(0, 'passed', 1), caseId: 'cancelled repeat' },
  ])
  expect([...cases].map(([caseId, test]) => [caseId, test.status])).toEqual([
    ['case', 'passed'],
    ['failed repeat', 'failed'],
    ['cancelled repeat', 'cancelled'],
  ])
  expect(
    getFinalCaseResults([result(1, 'passed'), result(0, 'failed')]).get('case')
      ?.status
  ).toBe('passed')
})

it('retains real annotation metadata through Next blob merging and rejects forged annotation ownership before publishing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'next-annotation-reports-'))
  const input = join(root, 'blobs')
  const outputFile = join(root, 'merged.json')
  await mkdir(input)
  const wrap = (event: object) => ({ ...envelope, ...event })
  const annotation = {
    message: 'release evidence',
    type: 'issue',
    location: { file: entry.file, line: 4, column: 7 },
    attachment: { body: 'AQID', bodyEncoding: 'base64' },
  }
  const completed = {
    ...result(0, 'passed'),
    mode: 'run',
    meta: { ticket: 42 },
    tags: ['release'],
    annotations: [annotation],
  }
  const start = {
    type: 'case-start',
    entryId: entry.id,
    caseId: completed.caseId,
    attempt: completed.attempt,
    name: completed.name,
  }
  const note = {
    type: 'test-annotation',
    entryId: entry.id,
    caseId: completed.caseId,
    attempt: completed.attempt,
    annotation,
  }
  const blob = {
    version: 1,
    kind: 'next-test-results',
    referenceVersion: '5.0.4',
    projectDir: '/project',
    events: [
      wrap({ type: 'run-start' }),
      wrap({ type: 'file-start', entry }),
      wrap(start),
      wrap(note),
      wrap({ type: 'case-end', ...completed }),
      wrap({
        type: 'suite-end',
        entryId: entry.id,
        suiteId: entry.id,
        name: '',
        ancestors: [],
        mode: 'run',
        status: 'passed',
        durationMs: 3,
        errors: [],
      }),
      wrap({
        type: 'file-end',
        entryId: entry.id,
        status: 'passed',
        durationMs: 3,
      }),
      wrap({ type: 'run-end', status: 'passed', durationMs: 3 }),
    ],
  }
  const shard = join(input, 'shard.json')
  try {
    await writeFile(shard, JSON.stringify(blob))
    expect(
      await mergeResultReports(input, {
        projectDir: root,
        reporters: ['json'],
        outputFile,
      })
    ).toBe('passed')
    const merged = JSON.parse(await readFile(outputFile, 'utf8'))
    expect(merged.testResults[0].assertionResults[0]).toMatchObject({
      meta: { ticket: 42 },
      tags: ['release'],
    })
    expect(
      merged.next.events.find((event: any) => event.type === 'test-annotation')
        .annotation
    ).toEqual(annotation)
    const validOutput = await readFile(outputFile, 'utf8')
    for (const mutate of [
      (events: any[]) => {
        events[3].annotation.message = 42
      },
      (events: any[]) => {
        events[3].annotation.location.line = 0
      },
      (events: any[]) => {
        events[3].attempt.id = 'foreign'
      },
      (events: any[]) => {
        events[3].caseId = 'foreign'
      },
      (events: any[]) => {
        const [late] = events.splice(3, 1)
        events.splice(4, 0, late)
      },
      (events: any[]) => {
        events[4].meta = []
      },
      (events: any[]) => {
        events[4].tags = [42]
      },
      (events: any[]) => {
        events[4].annotations[0].type = 42
      },
    ]) {
      const forged = JSON.parse(JSON.stringify(blob))
      mutate(forged.events)
      await writeFile(shard, JSON.stringify(forged))
      await expect(
        mergeResultReports(input, {
          projectDir: root,
          reporters: ['json'],
          outputFile,
        })
      ).rejects.toThrow(/Invalid|inactive/)
      expect(await readFile(outputFile, 'utf8')).toBe(validOutput)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('does not replace the completed report when a generation is cancelled during atomic publication', async () => {
  const root = await mkdtemp(join(tmpdir(), 'next-watch-report-cancel-'))
  const target = join(root, 'result.json')
  const controller = new AbortController()
  const reason = new Error('Superseded before publication')
  const machine = createMachineReporter({
    projectDir: root,
    reporters: ['json'],
    outputFile: 'result.json',
  })
  const originalWrite = writeFile
  await originalWrite(target, 'previous completed generation')
  const filesystem =
    require('node:fs/promises') as typeof import('node:fs/promises')
  const write = jest
    .spyOn(filesystem, 'writeFile')
    .mockImplementation(async (...args: Parameters<typeof writeFile>) => {
      const value = await originalWrite(...args)
      if (String(args[0]).endsWith('.tmp')) controller.abort(reason)
      return value
    })
  try {
    machine.onEvent({ ...envelope, type: 'run-start' })
    machine.onEvent({
      ...envelope,
      type: 'run-end',
      status: 'passed',
      durationMs: 1,
    })
    await expect(machine.finish({ signal: controller.signal })).rejects.toBe(
      reason
    )
    expect(await readFile(target, 'utf8')).toBe('previous completed generation')
    expect(await filesystem.readdir(root)).toEqual(['result.json'])
  } finally {
    write.mockRestore()
    machine.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

describe('pinned built-in result reporters', () => {
  it('accepts built-ins alongside a machine reporter without replacing it', () => {
    expect(
      parseResultReporters([
        'json',
        'tap',
        'tap-flat',
        'verbose',
        'dot',
        'github-actions',
      ])
    ).toEqual(['json', 'tap', 'tap-flat', 'verbose', 'dot', 'github-actions'])
  })

  it('verbose renders fast passing declarations with their full file and suite identity', () => {
    const { emit, output } = setup({ style: 'verbose' })
    emit({
      type: 'case-end',
      ...result(0, 'passed'),
      testName: 'renders',
      ancestors: [{ id: 'suite', name: 'nested' }],
    })
    emit({
      type: 'file-end',
      entryId: entry.id,
      status: 'passed',
      durationMs: 3,
    })
    emit({ type: 'run-end', status: 'passed', durationMs: 3 })
    expect(output()).toContain(
      ' ✓ |node| example.test.ts > nested > renders 3ms\n'
    )
    expect(output()).not.toContain('example.test.ts (1 test)')
    expect(output()).toContain('1 passed (1)')
  })

  it('dot uses final case glyphs and retains real failure diagnostics', () => {
    const { emit, output } = setup({ style: 'dot' })
    for (const [index, status] of [
      'passed',
      'failed',
      'skipped',
      'skipped',
    ].entries()) {
      emit({
        type: 'case-end',
        ...result(0, status as CaseResult['status']),
        caseId: `case-${index}`,
        mode: index === 3 ? 'todo' : index === 2 ? 'skip' : 'run',
      })
    }
    emit({
      type: 'file-end',
      entryId: entry.id,
      status: 'failed',
      durationMs: 3,
    })
    emit({ type: 'run-end', status: 'failed', durationMs: 3 })
    expect(output()).toContain('·x--\n')
    expect(output()).toContain('render failed')
    expect(output()).not.toContain('example.test.ts (4 tests')
  })

  it.each(['tap', 'tap-flat'] as const)(
    '%s emits real nested results while preserving the separate JSON file and retries',
    async (name) => {
      const root = await mkdtemp(join(tmpdir(), 'next-builtin-tap-'))
      const write = jest.fn()
      const machine = createMachineReporter({
        projectDir: '/project',
        reporters: ['json', name],
        outputFile: join(root, 'result.json'),
        write,
      })
      const emit = (event: object) =>
        machine.onEvent({ ...envelope, ...event } as ResultEvent)
      const failed = {
        ...result(0, 'failed'),
        caseId: `${entry.id}/0/0`,
        testName: 'fails # literal',
        ancestors: [{ id: `${entry.id}/0`, name: 'nested' }],
      }
      try {
        emit({ type: 'run-start' })
        emit({ type: 'file-start', entry })
        emit({ type: 'case-end', ...failed })
        emit({
          type: 'case-end',
          ...result(0, 'failed'),
          caseId: `${entry.id}/1`,
          testName: 'recovers',
        })
        emit({
          type: 'case-end',
          ...result(1, 'passed'),
          caseId: `${entry.id}/1`,
          testName: 'recovers',
        })
        emit({
          type: 'suite-end',
          entryId: entry.id,
          suiteId: `${entry.id}/0`,
          name: 'nested',
          ancestors: [],
          mode: 'run',
          status: 'failed',
          durationMs: 3,
          errors: [],
        })
        emit({
          type: 'file-end',
          entryId: entry.id,
          status: 'failed',
          durationMs: 3,
        })
        emit({ type: 'run-end', status: 'failed', durationMs: 3 })
        await machine.finish()
        const json = JSON.parse(
          await readFile(join(root, 'result.json'), 'utf8')
        )
        expect(json).toMatchObject({
          success: false,
          numTotalTests: 2,
          numPassedTests: 1,
          numFailedTests: 1,
        })
        expect(
          json.testResults[0].assertionResults[1].failureMessages[0]
        ).toContain('render failed')
        const text = write.mock.calls.flat().join('')
        expect(text).toContain('TAP version 13\n')
        expect(text).toContain('message: "render failed"')
        expect(text).toContain('fails \\# literal')
        expect(text).toContain('ok 2 - ')
        if (name === 'tap-flat') {
          expect(text).toContain('not ok 1 - example.test.ts > nested > fails')
          expect(text).not.toContain(' {\n')
        } else {
          expect(text).toContain('not ok 1 - example.test.ts # time=3.00ms {\n')
          expect(text).toContain('    not ok 1 - nested # time=3.00ms {\n')
        }
      } finally {
        machine.dispose()
        await rm(root, { recursive: true, force: true })
      }
    }
  )

  it('GitHub Actions escapes workflow commands and writes a result summary without swallowing failure evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'next-builtin-github-'))
    const previous = process.env.GITHUB_STEP_SUMMARY
    process.env.GITHUB_STEP_SUMMARY = join(root, 'summary.md')
    const write = jest.fn()
    const machine = createMachineReporter({
      projectDir: '/project',
      reporters: ['github-actions'],
      write,
    })
    const emit = (event: object) =>
      machine.onEvent({ ...envelope, ...event } as ResultEvent)
    try {
      emit({ type: 'run-start' })
      emit({ type: 'file-start', entry })
      emit({
        type: 'case-end',
        ...result(0, 'failed'),
        errors: [
          {
            phase: 'runtime',
            severity: 'error',
            message: 'bad%\r\n::warning::injected',
            location: { file: '/project/comma,name.ts', line: 2, column: 3 },
          },
        ],
        annotations: [
          {
            type: 'review',
            message: 'line one\nline two',
            location: { file: '/project/test.ts', line: 4, column: 5 },
          },
        ],
      })
      emit({
        type: 'file-end',
        entryId: entry.id,
        status: 'failed',
        durationMs: 3,
      })
      emit({ type: 'run-end', status: 'failed', durationMs: 3 })
      await machine.finish()
      const text = write.mock.calls.flat().join('')
      expect(text).toContain('::error file=/project/comma%2Cname.ts,')
      expect(text).toContain('bad%25%0D%0A::warning::injected')
      expect(text).toContain(
        '::notice file=/project/test.ts,line=4,column=5,title=review::line one%0Aline two'
      )
      expect(await readFile(join(root, 'summary.md'), 'utf8')).toContain(
        '| 0 | 1 | 0 |'
      )
    } finally {
      if (previous === undefined) delete process.env.GITHUB_STEP_SUMMARY
      else process.env.GITHUB_STEP_SUMMARY = previous
      machine.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('does not publish a completed machine result after a built-in writer throws', async () => {
    const machine = createMachineReporter({
      projectDir: '/project',
      reporters: ['json', 'verbose'],
      write: () => {
        throw new Error('builtin writer failed')
      },
    })
    try {
      expect(() => machine.onEvent({ ...envelope, type: 'run-start' })).toThrow(
        'builtin writer failed'
      )
      await expect(machine.finish()).rejects.toThrow(
        'authoritative run cleanup'
      )
    } finally {
      machine.dispose()
    }
  })
})

describe('owned custom completion reporters', () => {
  async function custom(mode = 'normal', reporter = 'completion-reporter.mjs') {
    const root = await mkdtemp(join(tmpdir(), 'next-custom-reporter-'))
    await cp(join(__dirname, 'fixtures', reporter), join(root, reporter))
    await writeFile(
      join(root, 'reporter-options.json'),
      JSON.stringify({ mode })
    )
    const machine = createMachineReporter({
      projectDir: root,
      reporters: parseResultReporters(['json', join(root, reporter)]),
      outputFile: 'result.json',
      write: jest.fn(),
    })
    const localEntry = {
      ...entry,
      id: 'release:contract.case.mjs',
      file: join(root, 'contract.case.mjs'),
      profile: { ...entry.profile, id: 'release' },
    }
    function complete() {
      const emit = (event: object) =>
        machine.onEvent({ ...envelope, ...event } as ResultEvent)
      emit({ type: 'run-start' })
      emit({ type: 'file-start', entry: localEntry })
      const suiteId = `${localEntry.id}/0`
      for (const [index, name] of ['passes', 'skipped', 'future'].entries()) {
        const caseId = `${suiteId}/${index}`
        emit({
          type: 'case-end',
          ...result(0, index === 0 ? 'passed' : 'skipped'),
          entryId: localEntry.id,
          caseId,
          attempt: { id: `${caseId}/0/0`, retry: 0, repeat: 0 },
          name,
          testName: name,
          mode: index === 0 ? 'run' : index === 1 ? 'skip' : 'todo',
          ancestors: [{ id: suiteId, name: 'outer' }],
        })
      }
      emit({
        type: 'suite-end',
        entryId: localEntry.id,
        suiteId,
        name: 'outer',
        ancestors: [],
        mode: 'run',
        status: 'passed',
        durationMs: 3,
        errors: [],
      })
      emit({
        type: 'file-end',
        entryId: localEntry.id,
        status: 'passed',
        durationMs: 3,
      })
      emit({ type: 'run-end', status: 'passed', durationMs: 3 })
    }
    const trace = async () =>
      (await readFile(join(root, 'trace.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
    return { root, machine, complete, trace }
  }

  it('initializes before events, exposes real nested task identities and awaits async completion/close', async () => {
    const c = await custom()
    try {
      expect(() => c.complete()).toThrow('initialize before execution events')
      await c.machine.initialize()
      const { pid } = JSON.parse(
        await readFile(join(c.root, 'initialized.json'), 'utf8')
      )
      expect(pid).not.toBe(process.pid)
      c.complete()
      await c.machine.finish()
      await c.machine.dispose()
      expect(await c.trace()).toEqual([
        { hook: 'init' },
        {
          hook: 'end',
          reason: 'passed',
          errors: [],
          modules: [
            {
              type: 'module',
              moduleId: '/contract.case.mjs',
              state: 'passed',
              ok: true,
              size: 1,
              tests: [
                {
                  type: 'test',
                  name: 'passes',
                  fullName: 'outer > passes',
                  result: { state: 'passed' },
                  sameModule: true,
                  parentName: 'outer',
                  annotations: [],
                  meta: {},
                  tags: [],
                  mode: 'run',
                },
                {
                  type: 'test',
                  name: 'skipped',
                  fullName: 'outer > skipped',
                  result: { state: 'skipped' },
                  sameModule: true,
                  parentName: 'outer',
                  annotations: [],
                  meta: {},
                  tags: [],
                  mode: 'skip',
                },
                {
                  type: 'test',
                  name: 'future',
                  fullName: 'outer > future',
                  result: { state: 'skipped' },
                  sameModule: true,
                  parentName: 'outer',
                  annotations: [],
                  meta: {},
                  tags: [],
                  mode: 'todo',
                },
              ],
            },
          ],
        },
        { hook: 'close' },
      ])
      expect(() => process.kill(pid, 0)).toThrow(
        expect.objectContaining({ code: 'ESRCH' })
      )
    } finally {
      await c.machine.dispose()
      await rm(c.root, { recursive: true, force: true })
    }
  })

  it('loads a CommonJS default constructor and reports actual cases', async () => {
    const c = await custom('normal', 'commonjs-reporter.cjs')
    try {
      await c.machine.initialize()
      c.complete()
      await c.machine.finish()
      expect(
        JSON.parse(await readFile(join(c.root, 'commonjs-result.json'), 'utf8'))
      ).toEqual([
        { name: 'passes', state: 'passed' },
        { name: 'skipped', state: 'skipped' },
        { name: 'future', state: 'skipped' },
      ])
    } finally {
      await c.machine.dispose()
      await rm(c.root, { recursive: true, force: true })
    }
  })

  it('keeps the passing JSON result while surfacing an async reporter publication failure', async () => {
    const c = await custom('end')
    try {
      await c.machine.initialize()
      c.complete()
      await expect(c.machine.finish()).rejects.toThrow(
        'reporter publication failed'
      )
      expect(
        JSON.parse(await readFile(join(c.root, 'result.json'), 'utf8'))
      ).toMatchObject({ success: true, numPassedTests: 1 })
      await c.machine.dispose()
      expect((await c.trace()).at(-1)).toEqual({ hook: 'close' })
    } finally {
      await c.machine.dispose()
      await rm(c.root, { recursive: true, force: true })
    }
  })

  it.each([
    ['constructor', 'reporter constructor failed'],
    ['init', 'reporter init failed'],
    ['unsupported', 'onTestCaseReady requires actual Next producer events'],
    ['context', 'context.projects needs a broader Next tooling adapter'],
  ])('reclaims the reporter realm after %s failure', async (mode, message) => {
    const c = await custom(mode)
    try {
      await expect(c.machine.initialize()).rejects.toThrow(message)
    } finally {
      await c.machine.dispose()
      await rm(c.root, { recursive: true, force: true })
    }
  })

  it('retains a real close callback failure after successful report publication', async () => {
    const c = await custom('cleanup')
    try {
      await c.machine.initialize()
      c.complete()
      await c.machine.finish()
      await expect(c.machine.dispose()).rejects.toThrow(
        'reporter cleanup failed'
      )
    } finally {
      await c.machine.dispose().catch(() => {})
      await rm(c.root, { recursive: true, force: true })
    }
  })

  it('cancels an uncooperative initialization and waits for its owned process to exit', async () => {
    const c = await custom('hang')
    const controller = new AbortController()
    const reason = new Error('custom reporter startup cancelled')
    try {
      const initialized = c.machine.initialize({ signal: controller.signal })
      // Attach the rejection observer before initiating cancellation.
      const rejected = initialized.then(
        () => undefined,
        (error) => error
      )
      let pid = 0
      await retry(async () => {
        pid = JSON.parse(
          await readFile(join(c.root, 'initialized.json'), 'utf8')
        ).pid
        expect(pid).toBeGreaterThan(0)
      })
      controller.abort(reason)
      expect(await rejected).toBe(reason)
      expect(() => process.kill(pid, 0)).toThrow(
        expect.objectContaining({ code: 'ESRCH' })
      )
    } finally {
      controller.abort(reason)
      await c.machine.dispose()
      await rm(c.root, { recursive: true, force: true })
    }
  }, 15000)
})

describe('producer specification and declaration ordering', () => {
  function orderedRun(specificationOrder?: string[]) {
    const machine = createMachineReporter({
      projectDir: '/project',
      reporters: ['json'],
      write: jest.fn(),
    })
    const events: ResultEvent[] = []
    const emit = (event: object) => {
      const value = { ...envelope, ...event } as ResultEvent
      events.push(value)
      machine.onEvent(value)
    }
    // Two projects select the same physical path; their identities remain distinct.
    const specifications = ['z', 'a'].flatMap((project) =>
      ['b', 'c'].map((file) => ({
        ...entry,
        id: `${project}:${file}`,
        file: `/project/${file}.case.mjs`,
        profile: { ...entry.profile, id: project },
      }))
    )
    emit({
      type: 'run-start',
      ...(specificationOrder ? { specificationOrder } : {}),
    })
    const declarations = [
      '0',
      '1',
      ...Array.from({ length: 12 }, (_, index) => `2/${index}`),
      ...Array.from({ length: 9 }, (_, index) => String(index + 3)),
    ]
    const execution = [...declarations].reverse()
    for (const selected of [...specifications].reverse()) {
      emit({ type: 'file-start', entry: selected })
      for (const declaration of execution) {
        const caseId = `${selected.id}/0/${declaration}`
        emit({
          type: 'case-end',
          ...result(0, 'passed'),
          entryId: selected.id,
          caseId,
          attempt: { id: `${caseId}/0/0`, retry: 0, repeat: 0 },
          name: declaration,
        })
      }
      emit({
        type: 'file-end',
        entryId: selected.id,
        status: 'passed',
        durationMs: 3,
      })
    }
    emit({ type: 'run-end', status: 'passed', durationMs: 12 })
    return { machine, events, declarations, execution, specifications }
  }

  it('retains original specification order and nested numeric declarations independently from seeded execution', async () => {
    const order = ['z:b', 'z:c', 'a:b', 'a:c']
    const c = orderedRun(order)
    try {
      const report = c.machine.getJson()
      expect(report.testResults.map((file) => file.name)).toEqual(
        c.specifications.map((selected) => selected.file)
      )
      for (const file of report.testResults)
        expect(file.assertionResults.map((test) => test.title)).toEqual(
          c.declarations
        )
      expect(report.next.events).toEqual(c.events)
      expect(
        report.next.events
          .filter((event) => event.type === 'file-start')
          .map((event) => event.entry.id)
      ).toEqual([...order].reverse())
      expect(
        report.next.events
          .filter(
            (event): event is Extract<ResultEvent, { type: 'case-end' }> =>
              event.type === 'case-end' && event.entryId === 'z:b'
          )
          .map((event) => event.name)
      ).toEqual(c.execution)
    } finally {
      await c.machine.dispose()
    }
  })

  it('preserves observed file order when no specification evidence is present', async () => {
    const c = orderedRun()
    try {
      expect(c.machine.getJson().testResults.map((file) => file.name)).toEqual(
        [...c.specifications].reverse().map((selected) => selected.file)
      )
    } finally {
      await c.machine.dispose()
    }
  })

  it('retains declaration/specification evidence through blob merging and rejects malformed ordering before publication', async () => {
    const root = await mkdtemp(join(tmpdir(), 'next-ordered-results-'))
    const c = orderedRun(['z:b', 'z:c', 'a:b', 'a:c'])
    const shard = join(root, 'shard.json')
    const outputFile = join(root, 'result.json')
    const blob = {
      version: 1,
      kind: 'next-test-results',
      referenceVersion: '5.0.4',
      projectDir: '/project',
      events: c.events,
    }
    try {
      await writeFile(shard, JSON.stringify(blob))
      await mergeResultReports(root, {
        projectDir: root,
        reporters: ['json'],
        outputFile,
      })
      const validOutput = await readFile(outputFile, 'utf8')
      const merged = JSON.parse(validOutput)
      expect(merged.testResults.map((file) => file.name)).toEqual(
        c.specifications.map((selected) =>
          join(root, selected.file.slice('/project/'.length))
        )
      )
      for (const file of merged.testResults)
        expect(file.assertionResults.map((test) => test.title)).toEqual(
          c.declarations
        )
      // Use a separate input folder so the published JSON is not read as a blob.
      const input = join(root, 'input')
      await mkdir(input)
      for (const invalid of [
        null,
        'z:b',
        ['z:b', 42],
        ['z:b', 'z:b'],
        ['z:b'],
      ]) {
        const forged = JSON.parse(JSON.stringify(blob))
        forged.events[0].specificationOrder = invalid
        await writeFile(join(input, 'shard.json'), JSON.stringify(forged))
        await expect(
          mergeResultReports(input, {
            projectDir: root,
            reporters: ['json'],
            outputFile,
          })
        ).rejects.toThrow('Invalid specification order')
        expect(await readFile(outputFile, 'utf8')).toBe(validOutput)
      }
    } finally {
      await c.machine.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('pinned foreign final-task blob import', () => {
  const fixtures = join(__dirname, 'fixtures', 'vitest-5.0.4')
  const scenarios = [
    'original-public-merge',
    'nested-pass-fail-retry',
    'collection-error',
    'unhandled-error',
    'runtime-skip-retry-repeat',
  ]
  it.each(scenarios)(
    'projects the actual pristine %s blob without manufacturing Next events',
    async (scenario) => {
      const root = await mkdtemp(join(tmpdir(), 'next-foreign-blob-'))
      const input = join(root, 'blobs')
      await mkdir(input)
      const outputFile = join(root, 'result.json')
      try {
        const wire = await readFile(join(fixtures, `${scenario}.blob`), 'utf8')
        await writeFile(join(input, 'reference.blob'), wire)
        const expected = JSON.parse(
          await readFile(join(fixtures, `${scenario}.json`), 'utf8')
        )
        const errorOutput = jest
          .spyOn(process.stderr, 'write')
          .mockImplementation(() => true)
        let status
        try {
          status = await mergeResultReports(input, {
            projectDir: root,
            reporters: ['json'],
            outputFile,
          })
        } finally {
          errorOutput.mockRestore()
        }
        expect(status).toBe(expected.expectedCode ? 'failed' : 'passed')
        const imported = JSON.parse(await readFile(outputFile, 'utf8'))
        expect(imported).not.toHaveProperty('next')
        expect(imported.vitest).toMatchObject({
          version: '5.0.4',
          evidence: 'foreign-final-task-graph',
          attemptHistory: 'unavailable',
          runBoundaries: 'unavailable',
          snapshotSummary: 'not-serialized',
          environmentGraphs: 'opaque-not-restored',
        })
        expect(imported.vitest.blobs[0].flatted).toEqual(JSON.parse(wire))
        const { vitest: _foreign, ...standard } = imported
        // Merge-context wall time is new; file times continue to come from producer cases.
        const expectedReport = {
          ...expected.report,
          startTime: imported.startTime,
          testResults: expected.report.testResults.map((file) =>
            file.assertionResults.every((test) => test.duration === undefined)
              ? {
                  ...file,
                  startTime: imported.startTime,
                  endTime: imported.startTime,
                }
              : file
          ),
        }
        expect(standard).toEqual(expectedReport)
        if (scenario === 'unhandled-error') {
          expect(imported.success).toBe(true)
          expect(imported.numPassedTests).toBe(1)
        }
        if (scenario === 'nested-pass-fail-retry') {
          const retryResult = imported.testResults
            .flatMap((file) => file.assertionResults)
            .find((test) => test.title === 'retry')
          expect(retryResult.status).toBe('passed')
          expect(retryResult.failureMessages).toEqual([
            expect.stringContaining('first retry failure'),
          ])
        }
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    }
  )

  it('rejects malformed, incomplete, overlapping and mixed foreign inputs before replacing an existing report', async () => {
    const root = await mkdtemp(join(tmpdir(), 'next-invalid-foreign-blob-'))
    const input = join(root, 'blobs')
    await mkdir(input)
    const source = await readFile(
      join(fixtures, 'original-public-merge.blob'),
      'utf8'
    )
    const outputFile = join(root, 'result.json')
    const mutate = (change: (table: any[], context: any) => void) => {
      const table = JSON.parse(source)
      const tuple = table[0]
      const files = table[Number(tuple[1])]
      const fileIndex = Number(files[0])
      const file = table[fileIndex]
      const tasks = table[Number(file.tasks)]
      const testIndex = Number(tasks[0])
      const test = table[testIndex]
      const result = table[Number(test.result)]
      const ref = (value: unknown) => String(table.push(value) - 1)
      change(table, {
        tuple,
        file,
        fileIndex,
        tasks,
        test,
        testIndex,
        result,
        ref,
      })
      return JSON.stringify(table)
    }
    try {
      await writeFile(outputFile, 'previous report')
      for (const text of [
        '[',
        mutate((table, { tuple }) => {
          tuple[1] = String(table.length + 10)
        }),
        mutate((table, { tuple, ref }) => {
          tuple[0] = ref('9.0.0')
        }),
        mutate((_table, { file, ref }) => {
          file.filepath = ref('/project/../escape.case.mjs')
        }),
        mutate((_table, { file, ref }) => {
          file.filepath = ref('/project/contract.case.mjs\0hidden')
        }),
        mutate((_table, { file, ref }) => {
          file.name = ref('../contract.case.mjs')
        }),
        mutate((_table, { file, testIndex }) => {
          file.file = String(testIndex)
        }),
        mutate((_table, { tasks }) => {
          tasks.push(tasks[0])
        }),
        mutate((_table, { test, fileIndex }) => {
          test.suite = String(fileIndex)
        }),
        mutate((_table, { test }) => {
          delete test.result
        }),
        mutate((_table, { result, ref }) => {
          result.state = ref('run')
        }),
        mutate((_table, { result }) => {
          result.duration = -1
        }),
        mutate((_table, { tuple, ref }) => {
          tuple[3] = ref({})
        }),
      ]) {
        await writeFile(join(input, 'reference.blob'), text)
        await expect(
          mergeResultReports(input, {
            projectDir: root,
            reporters: ['json'],
            outputFile,
          })
        ).rejects.toThrow()
        expect(await readFile(outputFile, 'utf8')).toBe('previous report')
      }
      await writeFile(join(input, 'reference.blob'), source)
      await writeFile(join(input, 'duplicate.blob'), source)
      await expect(
        mergeResultReports(input, {
          projectDir: root,
          reporters: ['json'],
          outputFile,
        })
      ).rejects.toThrow(/overlapping|duplicate/)
      await rm(join(input, 'duplicate.blob'))
      const ambiguous = mutate((_table, { file, ref }) => {
        file.name = ref('different.case.mjs')
        file.filepath = ref('/project/different.case.mjs')
      })
      await writeFile(join(input, 'ambiguous.blob'), ambiguous)
      await expect(
        mergeResultReports(input, {
          projectDir: root,
          reporters: ['json'],
          outputFile,
        })
      ).rejects.toThrow('ambiguous native task identity')
      await rm(join(input, 'ambiguous.blob'))
      await writeFile(
        join(input, 'next.json'),
        JSON.stringify({ version: 1, kind: 'next-test-results' })
      )
      await expect(
        mergeResultReports(input, {
          projectDir: root,
          reporters: ['json'],
          outputFile,
        })
      ).rejects.toThrow('cannot mix')
      await rm(join(input, 'next.json'))
      await expect(
        mergeResultReports(input, {
          projectDir: root,
          reporters: ['json', 'default'],
          outputFile,
        })
      ).rejects.toThrow('requires the JSON reporter')
      expect(await readFile(outputFile, 'utf8')).toBe('previous report')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('merges real disjoint blobs in producer start order rather than directory or specification order', async () => {
    const root = await mkdtemp(join(tmpdir(), 'next-combined-foreign-blob-'))
    const input = join(root, 'blobs')
    const outputFile = join(root, 'result.json')
    await mkdir(input)
    try {
      await cp(
        join(fixtures, 'nested-pass-fail-retry.blob'),
        join(input, 'a.blob')
      )
      await cp(
        join(fixtures, 'original-public-merge.blob'),
        join(input, 'b.blob')
      )
      const expected = JSON.parse(
        await readFile(join(fixtures, 'combined-real-blobs.json'), 'utf8')
      )
      await expect(
        mergeResultReports(input, {
          projectDir: root,
          reporters: ['json'],
          outputFile,
        })
      ).resolves.toBe('failed')
      const { vitest, ...standard } = JSON.parse(
        await readFile(outputFile, 'utf8')
      )
      expect(vitest.blobs).toHaveLength(2)
      expect(standard).toEqual({
        ...expected.report,
        startTime: standard.startTime,
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('keeps serialized prototype names inert and refuses linked or nonfile inputs before publication', async () => {
    const root = await mkdtemp(join(tmpdir(), 'next-owned-foreign-blob-'))
    const input = join(root, 'blobs')
    const outputFile = join(root, 'result.json')
    await mkdir(input)
    try {
      const source = await readFile(
        join(fixtures, 'original-public-merge.blob'),
        'utf8'
      )
      const table = JSON.parse(source)
      const file = table[Number(table[Number(table[0][1])][0])]
      const test = table[Number(table[Number(file.tasks)][0])]
      Object.defineProperty(table[Number(test.meta)], '__proto__', {
        enumerable: true,
        value: String(table.push({ foreignPollution: true }) - 1),
      })
      await writeFile(join(input, 'reference.blob'), JSON.stringify(table))
      await mergeResultReports(input, {
        projectDir: root,
        reporters: ['json'],
        outputFile,
      })
      const previous = await readFile(outputFile, 'utf8')
      const report = JSON.parse(previous)
      expect(report.testResults[0].assertionResults[0].meta).toHaveProperty(
        '__proto__.foreignPollution',
        true
      )
      expect(({} as any).foreignPollution).toBeUndefined()
      await rm(join(input, 'reference.blob'))
      await writeFile(join(root, 'outside.blob'), source)
      await symlink(
        join(root, 'outside.blob'),
        join(input, 'reference.blob'),
        'file'
      )
      await expect(
        mergeResultReports(input, {
          projectDir: root,
          reporters: ['json'],
          outputFile,
        })
      ).rejects.toThrow()
      expect(await readFile(outputFile, 'utf8')).toBe(previous)
      await rm(join(input, 'reference.blob'))
      await writeFile(join(input, 'reference.blob'), source)
      await mkdir(join(input, 'not-a-blob'))
      await expect(
        mergeResultReports(input, {
          projectDir: root,
          reporters: ['json'],
          outputFile,
        })
      ).rejects.toThrow('bounded regular file')
      expect(await readFile(outputFile, 'utf8')).toBe(previous)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  // Windows has no POSIX FIFO directory entries or mkfifo utility.
  const describePosix = process.platform === 'win32' ? describe.skip : describe
  describePosix('POSIX foreign input ownership', () => {
    it('rejects a POSIX FIFO before reading while reclaiming the isolated probe process', async () => {
      const root = await mkdtemp(join(tmpdir(), 'next-fifo-foreign-blob-'))
      const input = join(root, 'blobs')
      const outputFile = join(root, 'result.json')
      await mkdir(input)
      try {
        await writeFile(outputFile, 'previous report')
        execFileSync('mkfifo', [join(input, 'blocked.blob')])
        const script = `
          process.stdout.write(JSON.stringify({ pid: process.pid }) + '\\n');
          require(process.argv[1]).tryMergeVitestBlobReports(
            process.argv[2], ['blocked.blob'],
            { projectDir: process.argv[4], reporters: ['json'], outputFile: process.argv[3] }
          ).then(
            () => { process.exitCode = 2 },
            (error) => process.stdout.write(JSON.stringify({ message: error.message }) + '\\n')
          );
        `
        const output = execFileSync(
          process.execPath,
          [
            '-e',
            script,
            require.resolve(
              'next/dist/experimental/testing/reporting/vitest-blob'
            ),
            input,
            outputFile,
            root,
          ],
          { encoding: 'utf8', timeout: 3000, killSignal: 'SIGKILL' }
        )
        const [processInfo, failure] = output
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
        expect(failure.message).toContain('bounded regular file')
        expect(() => process.kill(processInfo.pid, 0)).toThrow(
          expect.objectContaining({ code: 'ESRCH' })
        )
        expect(await readFile(outputFile, 'utf8')).toBe('previous report')
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    })
  })
})

describe('helper diagnostic presentation', () => {
  afterEach(() => setBundlerFindSourceMapImplementation(() => undefined))

  it('trims through the last mapped helper marker and preserves raw error stacks', () => {
    setBundlerFindSourceMapImplementation((file) =>
      file.startsWith('file:///define-helper/')
        ? {
            version: 3,
            file,
            sources: ['file:///project/helper.test.ts'],
            sourcesContent: ['callHelper()\n'],
            names: [],
            mappings: 'AAAA',
          }
        : undefined
    )
    const error = new Error('helper failure')
    error.stack = [
      'Error: helper failure',
      '    at assertion (/define-helper/assertion.js:1:1)',
      '    at __VITEST_HELPER__ (/define-helper/inner.js:1:1)',
      '    at nested (/define-helper/nested.js:1:1)',
      '    at Object.__VITEST_HELPER__ (/define-helper/outer.js:1:1)',
      '    at authoredCaller (/define-helper/caller.js:1:1)',
    ].join('\n')
    const raw = error.stack
    const diagnostic = serializeSourceMappedDiagnostic(
      new AggregateError([error], 'soft failure', { cause: error }),
      { phase: 'runtime' }
    )
    for (const child of [diagnostic.errors![0], diagnostic.cause!]) {
      expect(child.stack).toBe(raw)
      expect(child.frames).toHaveLength(1)
      expect(child.frames![0]).toMatchObject({
        file: 'file:///project/helper.test.ts',
        line: 1,
        column: 1,
        methodName: 'authoredCaller',
        original: true,
      })
      expect(child.frames![0].codeFrame).toContain('callHelper()')
      expect(formatDiagnostic(child)).not.toContain('__VITEST_HELPER__')
    }
    expect(error.stack).toBe(raw)
    const machine = createMachineReporter({
      projectDir: '/project',
      reporters: ['json'],
    })
    const emit = (event: object) =>
      machine.onEvent({ ...envelope, ...event } as ResultEvent)
    try {
      emit({ type: 'run-start' })
      emit({ type: 'file-start', entry })
      emit({ type: 'case-end', ...result(0, 'failed'), errors: [diagnostic] })
      emit({
        type: 'file-end',
        entryId: entry.id,
        status: 'failed',
        durationMs: 1,
      })
      emit({ type: 'run-end', status: 'failed', durationMs: 1 })
      expect(
        machine.getJson().testResults[0].assertionResults[0].failureMessages
      ).toEqual([raw])
    } finally {
      machine.dispose()
    }
  })

  it('retains ordinary mapped frames when no helper marker occurs', () => {
    const error = new Error('ordinary failure')
    error.stack =
      'Error: ordinary failure\n    at authoredCaller (/project/plain.test.ts:9:3)'
    const raw = error.stack
    const diagnostic = serializeSourceMappedDiagnostic(error, {
      phase: 'runtime',
    })
    expect(diagnostic.stack).toBe(raw)
    expect(diagnostic.frames).toHaveLength(1)
    expect(diagnostic.frames![0]).toMatchObject({
      file: '/project/plain.test.ts',
      line: 9,
      column: 3,
      methodName: 'authoredCaller',
    })
    expect(error.stack).toBe(raw)
  })
})

it('retains late structured artifacts through JSON, blob merge and completion views', async () => {
  const {
    createCustomReporterModules,
  } = require('next/dist/experimental/testing/reporting/custom-reporter-tasks')
  const root = await mkdtemp(join(tmpdir(), 'next-artifact-reports-'))
  const input = join(root, 'blobs')
  await mkdir(input)
  const completed = result(0, 'passed')
  const first = {
    type: 'custom:schema',
    location: { file: entry.file, line: 4, column: 2 },
    data: { valid: true },
    attachments: [
      { body: '', path: '/retained/source.txt', bodyEncoding: 'base64' },
      { body: 'AP9B', bodyEncoding: 'base64' },
    ],
  }
  const second = { type: 'custom:late', value: 7 }
  const events: ResultEvent[] = [
    { ...envelope, type: 'run-start' },
    { ...envelope, type: 'file-start', entry },
    {
      ...envelope,
      type: 'case-start',
      entryId: entry.id,
      caseId: completed.caseId,
      attempt: completed.attempt,
      name: completed.name,
    },
    {
      ...envelope,
      type: 'test-artifact',
      entryId: entry.id,
      caseId: completed.caseId,
      attempt: completed.attempt,
      artifact: first as any,
    },
    { ...envelope, type: 'case-end', ...completed },
    {
      ...envelope,
      type: 'test-artifact',
      entryId: entry.id,
      caseId: completed.caseId,
      attempt: completed.attempt,
      artifact: second as any,
    },
    {
      ...envelope,
      type: 'file-end',
      entryId: entry.id,
      status: 'passed',
      durationMs: 1,
    },
    { ...envelope, type: 'run-end', status: 'passed', durationMs: 1 },
  ]
  const collector = createTestReporter({ write() {}, projectDir: '/project' })
  try {
    for (const event of events) collector.onEvent(event)
    const module = createCustomReporterModules('/project', {
      ...collector.getResults(),
      events,
      status: 'passed',
    })[0]
    const test = [...module.children.allTests()][0]
    expect(test.artifacts()).toEqual([first, second])
    expect(test.artifacts()).not.toBe(test.artifacts())
    const blob = {
      version: 1,
      kind: 'next-test-results',
      referenceVersion: '5.0.4',
      projectDir: '/project',
      events,
    }
    const shard = join(input, 'shard.json'),
      outputFile = join(root, 'merged.json')
    await writeFile(shard, JSON.stringify(blob))
    await expect(
      mergeResultReports(input, {
        projectDir: root,
        reporters: ['json'],
        outputFile,
      })
    ).resolves.toBe('passed')
    const merged = JSON.parse(await readFile(outputFile, 'utf8'))
    expect(
      merged.next.events
        .filter((event: any) => event.type === 'test-artifact')
        .map((event: any) => event.artifact)
    ).toEqual([first, second])
    expect(merged.testResults[0].assertionResults[0]).not.toHaveProperty(
      'artifacts'
    )
    const previous = await readFile(outputFile)
    for (const invalid of [
      { artifact: { type: 'custom:bad', attachments: [{}] } },
      { attempt: { id: 'not-started', retry: 0, repeat: 0 } },
    ]) {
      const copied = structuredClone(blob)
      Object.assign(copied.events[3], invalid)
      await writeFile(shard, JSON.stringify(copied))
      await expect(
        mergeResultReports(input, {
          projectDir: root,
          reporters: ['json'],
          outputFile,
        })
      ).rejects.toThrow()
      expect(await readFile(outputFile)).toEqual(previous)
    }
  } finally {
    collector.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

it('maps artifact ordinary and optional call forms to their genuine positions without changing computed calls', async () => {
  const {
    mapArtifactCallLocation,
  } = require('next/dist/experimental/testing/reporting/artifact-location')
  const source = await readFile(
    join(__dirname, 'fixtures/artifact-callsites.mjs.txt'),
    'utf8'
  )
  const expected = JSON.parse(
    await readFile(
      join(__dirname, 'fixtures/artifact-callsites-pristine.json'),
      'utf8'
    )
  )
  for (const content of [source, source.replace(/\n/g, '\r\n')]) {
    const lines = content.split(/\r?\n/)
    const actual = expected.map((row: any) => ({
      type: row.type,
      location: mapArtifactCallLocation(content, 'calls.test.mjs', {
        file: 'calls.test.mjs',
        line: row.location.line,
        column:
          row.type === 'probe:optional'
            ? lines[row.location.line - 1].indexOf('?.') + 1
            : lines[row.location.line - 1].lastIndexOf('(') + 1,
      }),
    }))
    expect(actual).toEqual(expected)
    const optional = expected.find((row: any) => row.type === 'probe:optional')
    expect(
      mapArtifactCallLocation(content, 'calls.test.mjs', optional.location)
    ).toEqual(optional.location)
  }
  const lines = source.split('\n')
  const prefix = "  const emoji = '😀'; "
  lines[6] = prefix + lines[6]
  const line = lines[6]
  expect(
    mapArtifactCallLocation(lines.join('\n'), 'calls.test.mjs', {
      file: 'calls.test.mjs',
      line: 7,
      column: line.lastIndexOf('(') + 1,
    })
  ).toEqual({
    file: 'calls.test.mjs',
    line: 7,
    column: expected[0].location.column + prefix.length,
  })
  const fallback = { file: 'unknown.ts', line: 1, column: 8 }
  expect(
    mapArtifactCallLocation('not valid JavaScript', fallback.file, fallback)
  ).toBe(fallback)
  expect(
    mapArtifactCallLocation('const value = 1', fallback.file, fallback)
  ).toBe(fallback)
  expect(
    mapArtifactCallLocation(source, 'calls.test.mjs', {
      ...fallback,
      line: 900,
    })
  ).toEqual({ ...fallback, line: 900 })
})

it('normalizes only artifact locations from retained source while leaving annotation and raw stacks unchanged', () => {
  const {
    mapTestArtifactLocation,
  } = require('next/dist/experimental/testing/reporting/artifact-location')
  const {
    mapTestAnnotationLocation,
  } = require('next/dist/experimental/testing/reporting/source-mapped-diagnostics')
  const source = 'const pending = record(task, {})\n'
  let content: string | undefined = source
  setBundlerFindSourceMapImplementation((file) =>
    file === 'file:///chunks/artifact-call.js'
      ? {
          version: 3,
          file,
          sources: ['file:///immutable/helper.test.mjs'],
          ...(content === undefined ? {} : { sourcesContent: [content] }),
          names: [],
          // Generated1:0 -> original1:22 (zero-based), the call parenthesis.
          mappings: 'AAAsB',
        }
      : undefined
  )
  const error = new Error('STACK_TRACE')
  error.stack = 'Error: STACK_TRACE\n    at call (/chunks/artifact-call.js:1:1)'
  const raw = error.stack
  const original = { file: '/immutable/helper.test.mjs', line: 1, column: 23 }
  try {
    expect(mapTestArtifactLocation(error, original.file)).toEqual({
      ...original,
      column: 17,
    })
    expect(mapTestAnnotationLocation(error, original.file)).toEqual(original)
    expect(error.stack).toBe(raw)
    content = undefined
    expect(mapTestArtifactLocation(error, original.file)).toEqual(original)
    content = 'not valid JavaScript'
    expect(mapTestArtifactLocation(error, original.file)).toEqual(original)
    expect(
      mapTestArtifactLocation(error, '/different.test.mjs')
    ).toBeUndefined()
    expect(error.stack).toBe(raw)
  } finally {
    setBundlerFindSourceMapImplementation(() => undefined)
  }
})

it('maps Browser artifact callees with the standalone parser and preserves Node syntax support', async () => {
  const {
    getClientArtifactLocation,
  } = require('next/dist/experimental/testing/client/artifact-location')
  const {
    mapArtifactCallLocation,
  } = require('next/dist/experimental/testing/reporting/artifact-location')
  const source = await readFile(
    join(__dirname, 'fixtures/artifact-callsites.mjs.txt'),
    'utf8'
  )
  const expected = JSON.parse(
    await readFile(
      join(__dirname, 'fixtures/artifact-callsites-pristine.json'),
      'utf8'
    )
  )
  const error = new Error('original raw stack')
  const rawStack =
    'Error: original raw stack\n    at http://localhost/selected.js:1:1'
  error.stack = rawStack
  for (const content of [source, source.replace(/\n/g, '\r\n')]) {
    const lines = content.split(/\r?\n/)
    const actual = expected.map((row: any) => {
      const mapped = {
        file: 'calls.test.mjs',
        line: row.location.line,
        column:
          row.type === 'probe:optional'
            ? lines[row.location.line - 1].indexOf('?.') + 1
            : lines[row.location.line - 1].lastIndexOf('(') + 1,
      }
      return {
        type: row.type,
        location: getClientArtifactLocation(error, {
          mapLocation: () => mapped,
          getSourceContent: () => content,
        }),
      }
    })
    expect(actual).toEqual(expected)
  }
  const typed = 'const input: unknown = recordArtifact(task, {})'
  const mapped = {
    file: 'calls.test.ts',
    line: 1,
    column: typed.indexOf('(') + 1,
  }
  expect(
    getClientArtifactLocation(error, {
      mapLocation: () => mapped,
      getSourceContent: () => typed,
    })
  ).toEqual(mapped)
  expect(mapArtifactCallLocation(typed, mapped.file, mapped)).toEqual({
    ...mapped,
    column: typed.indexOf('recordArtifact') + 1,
  })
  const jsx = 'const element = <div />; recordArtifact(task, {})'
  const jsxMapped = {
    file: 'calls.test.jsx',
    line: 1,
    column: jsx.indexOf('(') + 1,
  }
  expect(
    getClientArtifactLocation(error, {
      mapLocation: () => jsxMapped,
      getSourceContent: () => jsx,
    })
  ).toEqual(jsxMapped)
  expect(mapArtifactCallLocation(jsx, jsxMapped.file, jsxMapped)).toEqual({
    ...jsxMapped,
    column: jsx.indexOf('recordArtifact') + 1,
  })
  for (const content of [
    'recordArtifact?.(task, {})',
    'api?.recordArtifact(task, {})',
  ]) {
    const original = {
      file: 'calls.test.mjs',
      line: 1,
      column: content.indexOf('recordArtifact') + 3,
    }
    expect(mapArtifactCallLocation(content, original.file, original)).toEqual(
      original
    )
    expect(
      getClientArtifactLocation(error, {
        mapLocation: () => original,
        getSourceContent: () => content,
      })
    ).toEqual(original)
  }
  const nested = 'api?.method(recordArtifact(task, {}))'
  const nestedMapped = {
    file: 'calls.test.mjs',
    line: 1,
    column: nested.lastIndexOf('(') + 1,
  }
  const nestedExpected = {
    ...nestedMapped,
    column: nested.indexOf('recordArtifact') + 1,
  }
  expect(
    mapArtifactCallLocation(nested, nestedMapped.file, nestedMapped)
  ).toEqual(nestedExpected)
  expect(
    getClientArtifactLocation(error, {
      mapLocation: () => nestedMapped,
      getSourceContent: () => nested,
    })
  ).toEqual(nestedExpected)
  expect(error.stack).toBe(rawStack)
})

describe('live custom console reporter callbacks', () => {
  async function open(mode: string) {
    const root = await mkdtemp(join(tmpdir(), 'next-live-console-'))
    await cp(
      join(__dirname, 'fixtures/live-console-reporter.mjs'),
      join(root, 'reporter.mjs')
    )
    await writeFile(join(root, 'live-options.json'), JSON.stringify({ mode }))
    const machine = createMachineReporter({
      projectDir: root,
      reporters: parseResultReporters(['json', './reporter.mjs']),
      outputFile: 'result.json',
      write() {},
    })
    await machine.initialize()
    const emit = (event: object) =>
      machine.onEvent({ ...envelope, ...event } as ResultEvent)
    emit({ type: 'run-start' })
    emit({ type: 'file-start', entry })
    const test = result(0, 'passed')
    emit({
      type: 'case-start',
      entryId: entry.id,
      caseId: test.caseId,
      attempt: test.attempt,
      name: test.name,
    })
    const output = (text: string, size: number, timestamp: number) =>
      emit({
        type: 'output',
        entryId: entry.id,
        caseId: test.caseId,
        attempt: test.attempt,
        stream: 'stdout',
        text,
        timestamp,
        console: { taskId: test.caseId, size },
      })
    const complete = () => {
      emit({ type: 'case-end', ...test })
      emit({
        type: 'file-end',
        entryId: entry.id,
        status: 'passed',
        durationMs: 1,
      })
      emit({ type: 'run-end', status: 'passed', durationMs: 1 })
    }
    const trace = async () =>
      (await readFile(join(root, 'live-trace.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
    return { root, machine, emit, output, complete, trace, test }
  }

  it('delivers actual payload fields live, preserves order and drains async callbacks before completion and close', async () => {
    const c = await open('gate')
    try {
      c.output('first\n', 2, 42)
      await retry(async () => expect((await c.trace())[0].hook).toBe('console'))
      c.output('second\n', 1, 43)
      // A raw pipe write is still reported, without inventing a console count.
      c.emit({
        type: 'output',
        entryId: entry.id,
        stream: 'stderr',
        text: 'raw process output\n',
      })
      c.complete()
      let finished = false
      const finish = c.machine.finish().then(() => {
        finished = true
      })
      await Promise.resolve()
      expect(finished).toBe(false)
      expect((await c.trace()).map((row) => row.hook)).toEqual(['console'])
      await writeFile(join(c.root, 'release-console'), '')
      await finish
      await c.machine.dispose()
      expect(await c.trace()).toEqual([
        {
          hook: 'console',
          keys: ['type', 'content', 'taskId', 'time', 'size', 'origin'],
          log: {
            type: 'stdout',
            content: 'first\n',
            taskId: c.test.caseId,
            time: 42,
            size: 2,
          },
        },
        { hook: 'settled', content: 'first\n' },
        {
          hook: 'console',
          keys: ['type', 'content', 'taskId', 'time', 'size', 'origin'],
          log: {
            type: 'stdout',
            content: 'second\n',
            taskId: c.test.caseId,
            time: 43,
            size: 1,
          },
        },
        { hook: 'settled', content: 'second\n' },
        {
          hook: 'end',
          reason: 'passed',
          errors: [],
          tasks: [entry.id, c.test.caseId],
        },
        { hook: 'close' },
      ])
    } finally {
      await writeFile(join(c.root, 'release-console'), '')
      await c.machine.dispose()
      await rm(c.root, { recursive: true, force: true })
    }
  })

  it('retains async callback errors for run-end, continues later logs and preserves passing test JSON', async () => {
    const c = await open('reject')
    try {
      c.output('first\n', 1, 10)
      c.output('second\n', 1, 11)
      c.complete()
      await expect(c.machine.finish()).rejects.toThrow('console hook rejected')
      expect(
        JSON.parse(await readFile(join(c.root, 'result.json'), 'utf8'))
      ).toMatchObject({ success: true, numPassedTests: 1, numFailedTests: 0 })
      await c.machine.dispose()
      const rows = await c.trace()
      expect(
        rows
          .filter((row) => row.hook === 'console')
          .map((row) => row.log.content)
      ).toEqual(['first\n', 'second\n'])
      expect(rows.find((row) => row.hook === 'end')).toMatchObject({
        errors: ['console hook rejected'],
        reason: 'passed',
        tasks: [entry.id, c.test.caseId],
      })
      expect(rows.at(-1)).toEqual({ hook: 'close' })
    } finally {
      await c.machine.dispose()
      await rm(c.root, { recursive: true, force: true })
    }
  })
  it('preserves Browser raw content, zero and UTF-16 sizes and the measured Browser field shape', async () => {
    const c = await open('normal')
    try {
      for (const [content, taskId] of [
        ['', '__vitest__unknown_test__'],
        ['kept newline\n', c.test.caseId],
        ['😀', c.test.caseId],
      ]) {
        c.emit({
          type: 'output',
          entryId: entry.id,
          stream: 'stdout',
          text: content + '\n',
          timestamp: 20,
          console: { browser: true, taskId, size: content.length },
        })
      }
      c.complete()
      await c.machine.finish()
      await c.machine.dispose()
      const logs = (await c.trace()).filter((row) => row.hook === 'console')
      expect(logs.map((row) => row.keys)).toEqual(
        Array(3).fill([
          'origin',
          'content',
          'browser',
          'time',
          'taskId',
          'type',
          'size',
        ])
      )
      expect(logs.map((row) => row.log)).toEqual([
        {
          content: '',
          browser: true,
          time: 20,
          taskId: '__vitest__unknown_test__',
          type: 'stdout',
          size: 0,
        },
        {
          content: 'kept newline\n',
          browser: true,
          time: 20,
          taskId: c.test.caseId,
          type: 'stdout',
          size: 13,
        },
        {
          content: '😀',
          browser: true,
          time: 20,
          taskId: c.test.caseId,
          type: 'stdout',
          size: 2,
        },
      ])
    } finally {
      await c.machine.dispose()
      await rm(c.root, { recursive: true, force: true })
    }
  })
})

it('delivers actual module completion callbacks with stable final task identities in both Node profiles', () => {
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'module-end-reporter.cjs')],
    { encoding: 'utf8', timeout: 100000 }
  )
  expect(JSON.parse(result)).toEqual({ cases: 12, callbacks: 2, profiles: 2 })
}, 110000)

it('drains rejected module completion callbacks through following files, run end and close', () => {
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'module-end-failure.cjs')],
    { encoding: 'utf8', timeout: 100000 }
  )
  expect(JSON.parse(result)).toEqual({ cases: 4, callbacks: 4, profiles: 2 })
}, 110000)

it('proves body timeout declaration origins from real leased chunks and refuses incomplete or foreign associations', () => {
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'registration-origin.cjs')],
    { encoding: 'utf8' }
  )
  expect(JSON.parse(result)).toEqual({ profiles: 2, checks: 24 })
})

describe('authored Browser instance reporter labels', () => {
  it.each(['', 'authored / client'])(
    'retains the exact public label %j without exposing its compiler ID',
    (projectName) => {
      const { emit, output } = setup({ color: false })
      emit({
        type: 'file-start',
        entry: {
          ...entry,
          projectName,
          profile: { ...entry.profile, id: 'browser-instance-0' },
        },
        revision: 'label-revision',
      })
      emit({
        type: 'file-end',
        entryId: entry.id,
        status: 'passed',
        durationMs: 3,
      })
      expect(output()).toContain(
        projectName ? `|${projectName}| example.test.ts` : '✓ example.test.ts'
      )
      expect(output()).not.toContain('browser-instance-0')
      expect(output()).not.toContain('||')
    }
  )
})

it('reports lexical parents without moving raw collector children or replacing task views', async () => {
  const { createCollector } = await import(
    'next/dist/experimental/testing/runner/collector'
  )
  const { runCollected } = await import(
    'next/dist/experimental/testing/runner/lifecycle'
  )
  const { captureReporterTaskTree, assertReporterTaskTree } = await import(
    'next/dist/experimental/testing/reporting/live-tasks'
  )
  const { createLiveReporterTaskStore } = await import(
    'next/dist/experimental/testing/reporting/custom-reporter-live-tasks'
  )
  const c = createCollector('lexical-file')
  const raw = c.api.describe.fn.call(
    {
      concurrent: false,
      only: false,
      skip: false,
      todo: false,
      shuffle: false,
    },
    'physical',
    {},
    () => {
      raw.task('inside', { handler() {} })
    }
  )
  raw.task('outside', { handler() {} })
  c.api.describe('later lexical suite', () => {
    raw.task('cross', { handler() {} })
    c.api.test('ordinary lexical child', () => {})
  })
  await c.settle()
  const store = createLiveReporterTaskStore('/project')
  let tree!: ReturnType<typeof captureReporterTaskTree>
  let early: unknown[] = []
  const result = await runCollected(
    c.close(),
    {
      runId: 'lexical-run',
      signal: new AbortController().signal,
      filePath: '/project/lexical.test.mjs',
      onCollected(file) {
        tree = captureReporterTaskTree(file)
        store.update(tree)
        early = [...store.get(file.id)!.children!.allTests()]
      },
      onCaseResult(task) {
        store.update(captureReporterTaskTree(task.file), [task.id])
      },
    },
    () => {}
  )
  expect(result.errors).toEqual([])
  const module = store.get('lexical-file')!
  const [physical, lexical] = module.children!.array()
  const [outside, cross, inside] = [...physical.children!.allTests()]
  expect([...module.children!.allTests()]).toEqual(early)
  expect([outside.name, cross.name, inside.name]).toEqual([
    'outside',
    'cross',
    'inside',
  ])
  expect(outside.parent).toBe(module)
  expect(cross.parent).toBe(lexical)
  expect(inside.parent).toBe(physical)
  expect(lexical.children!.size).toBe(1)
  expect(lexical.children!.at(0)!.parent).toBe(lexical)
  expect(tree.parentSuiteId).toBeNull()
  expect(tree.tasks![0].parentSuiteId).toBeNull()
  expect(tree.tasks![0].tasks!.map((task) => task.parentSuiteId)).toEqual([
    null,
    tree.tasks![1].id,
    tree.tasks![0].id,
  ])
  const legacy = structuredClone(tree)
  const omitParent = (task: typeof tree) => {
    delete task.parentSuiteId
    task.tasks?.forEach(omitParent)
  }
  omitParent(legacy)
  const legacyModule = createLiveReporterTaskStore('/project').update(legacy)
  const legacyPhysical = legacyModule.children!.at(0)!
  for (const task of legacyPhysical.children!.allTests())
    expect(task.parent).toBe(legacyPhysical)
  expect(() => store.update(legacy)).toThrow('declaration identity changed')
  expect(outside.result().state).toBe('passed')
  expect(cross.result().state).toBe('passed')
  const assertTree: typeof assertReporterTaskTree = assertReporterTaskTree
  const entryId = tree.id
  for (const mutate of [
    (changed: typeof tree) => {
      changed.tasks![0].parentSuiteId = 'missing'
    },
    (changed: typeof tree) => {
      changed.tasks![1].parentSuiteId = changed.tasks![0].tasks![0].id
    },
    (changed: typeof tree) => {
      changed.tasks![0].parentSuiteId = changed.tasks![0].id
    },
    (changed: typeof tree) => {
      changed.tasks![0].parentSuiteId = changed.tasks![1].id
      changed.tasks![1].parentSuiteId = changed.tasks![0].id
    },
    (changed: typeof tree) => {
      changed.parentSuiteId = changed.tasks![0].id
    },
    (changed: typeof tree) => {
      changed.tasks![0].parentSuiteId = changed.id
    },
    (changed: typeof tree) => {
      Object.assign(changed.tasks![0], { parentSuiteId: 4 })
    },
  ]) {
    const changed = structuredClone(tree)
    mutate(changed)
    expect(() => assertTree(changed, entryId)).toThrow(/reporter.*parent/)
    expect(() => store.update(changed)).toThrow(/reporter.*parent/)
    expect(store.get(entryId)).toBe(module)
    expect(outside.parent).toBe(module)
    expect(cross.parent).toBe(lexical)
    expect(outside.result().state).toBe('passed')
  }
})

it('matches actual raw collector parents in supported case and completion reporter callbacks', () => {
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'logical-case-parent.cjs')],
    { encoding: 'utf8', timeout: 150000 }
  )
  expect(JSON.parse(result)).toEqual({
    profiles: 2,
    cases: 16,
    authoredRows: 2,
    callbackRows: 48,
    fullReferenceRows: true,
  })
}, 160000)

it('captures actual physical order and lexical parents for completion-only custom reporters', () => {
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'logical-case-parent.cjs'), 'completion'],
    { encoding: 'utf8', timeout: 150000 }
  )
  expect(JSON.parse(result)).toEqual({
    profiles: 2,
    cases: 16,
    authoredRows: 2,
    callbackRows: 32,
    fullReferenceRows: true,
  })
}, 160000)

it.each(['module', 'run'])(
  'captures actual task snapshots when only the %s completion hook is present',
  (variant) => {
    const result = execFileSync(
      process.execPath,
      [join(__dirname, 'logical-case-parent.cjs'), variant],
      { encoding: 'utf8', timeout: 150000 }
    )
    expect(JSON.parse(result)).toEqual({
      profiles: 2,
      cases: 16,
      authoredRows: 2,
      callbackRows: 16,
      fullReferenceRows: true,
    })
  },
  160000
)

it('retains actual collected hierarchy and live task identities before following bodies complete', async () => {
  const { createCollector } = await import(
    'next/dist/experimental/testing/runner/collector'
  )
  const { runCollected } = await import(
    'next/dist/experimental/testing/runner/lifecycle'
  )
  const { captureReporterTaskTree } = await import(
    'next/dist/experimental/testing/reporting/live-tasks'
  )
  const { createLiveReporterTaskStore } = await import(
    'next/dist/experimental/testing/reporting/custom-reporter-live-tasks'
  )
  const c = createCollector('live-file')
  const store = createLiveReporterTaskStore('/project')
  let release!: () => void, entered!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const secondEntered = new Promise<void>((resolve) => {
    entered = resolve
  })
  const seen: unknown[] = []
  let firstMeta: object | undefined
  let early: unknown
  c.api.describe('observed completion', () => {
    c.api.test(
      'first',
      {
        meta: Object.assign(
          {} as import('next/dist/experimental/testing/runner/tasks').TaskMeta,
          { authored: 'first' }
        ),
      },
      ({ task, onTestFinished }) => {
        onTestFinished(() => {
          Object.assign(task.meta, { finished: true })
        })
      }
    )
    c.api.test(
      'held second',
      {
        meta: Object.assign(
          {} as import('next/dist/experimental/testing/runner/tasks').TaskMeta,
          { authored: 'second' }
        ),
      },
      async () => {
        entered()
        await gate
      }
    )
  })
  c.api.afterAll((...args: unknown[]) => {
    const task =
      args[1] as import('next/dist/experimental/testing/runner/tasks').Suite
    Object.assign(task.meta, { fileFinished: true })
  })
  const running = runCollected(
    c.close(),
    {
      runId: 'live-run',
      signal: new AbortController().signal,
      filePath: '/project/contract.test.mjs',
      onCollected(file) {
        store.update(captureReporterTaskTree(file))
      },
      onCaseResult(task) {
        const module = store.update(captureReporterTaskTree(task.file), [
          task.id,
        ])
        const test = store.case(task.file.id, task.id)
        seen.push(test)
        if (task.name === 'first') {
          firstMeta = test.meta()
          early = {
            state: module.state(),
            cases: [...module.children!.allTests()].map((item) => ({
              name: item.name,
              result: item.result().state,
              meta: { ...item.meta() },
            })),
          }
        }
      },
      onSuiteEnd(_result, task) {
        expect(task.file.file).toBe(task.file)
        store.update(captureReporterTaskTree(task.file), [task.id])
      },
    },
    () => {}
  )
  try {
    await secondEntered
    expect(early).toEqual({
      state: 'pending',
      cases: [
        {
          name: 'first',
          result: 'passed',
          meta: { authored: 'first', finished: true },
        },
        {
          name: 'held second',
          result: 'pending',
          meta: { authored: 'second' },
        },
      ],
    })
  } finally {
    release()
  }
  expect((await running).errors).toEqual([])
  const module = store.get('live-file')!
  expect(module.state()).toBe('passed')
  expect(module.meta()).toEqual({ fileFinished: true })
  const cases = [...module.children!.allTests()]
  expect(cases).toEqual(seen)
  expect(cases[0].meta()).toBe(firstMeta)
  expect(cases.map((task) => task.result().state)).toEqual(['passed', 'passed'])
})

it('supplies the actual root suite task to completion callbacks even without cases', async () => {
  const { createCollector } = await import(
    'next/dist/experimental/testing/runner/collector'
  )
  const { runCollected } = await import(
    'next/dist/experimental/testing/runner/lifecycle'
  )
  const { captureReporterTaskTree } = await import(
    'next/dist/experimental/testing/reporting/live-tasks'
  )
  const c = createCollector('empty-live-file')
  const root = c.close()
  Object.assign(root.meta, { authored: 'empty' })
  const seen: unknown[] = []
  await runCollected(
    root,
    {
      runId: 'empty-live-run',
      signal: new AbortController().signal,
      passWithNoTests: true,
      onSuiteEnd(result, task) {
        expect(task.file).toBe(task)
        expect(result.suiteId).toBe(task.id)
        seen.push(captureReporterTaskTree(task.file))
      },
    },
    () => {}
  )
  expect(seen).toHaveLength(1)
  expect(seen[0]).toMatchObject({
    id: 'empty-live-file',
    type: 'suite',
    tasks: [],
    meta: { authored: 'empty' },
  })
})

it('rejects task snapshots without their real file, unique declarations or completed case identity', async () => {
  const { createCollector } = await import(
    'next/dist/experimental/testing/runner/collector'
  )
  const { runCollected } = await import(
    'next/dist/experimental/testing/runner/lifecycle'
  )
  const { captureReporterTaskTree, assertReporterTaskTree } = await import(
    'next/dist/experimental/testing/reporting/live-tasks'
  )
  const assertTree: typeof import('next/dist/experimental/testing/reporting/live-tasks').assertReporterTaskTree =
    assertReporterTaskTree
  const c = createCollector('validated-live-file')
  c.api.test('real', () => {})
  let checks = 0
  await runCollected(
    c.close(),
    {
      runId: 'validated-live-run',
      signal: new AbortController().signal,
      onCaseResult(task) {
        const tree = captureReporterTaskTree(task.file)
        expect(() => assertTree(tree, task.file.id, task.id)).not.toThrow()
        const mutations = [
          () => assertTree(tree, 'foreign', task.id),
          () => assertTree(tree, task.file.id, 'absent'),
          () => {
            const changed = structuredClone(tree)
            changed.tasks!.push(changed.tasks![0])
            assertTree(changed, task.file.id, task.id)
          },
          () => {
            const changed = structuredClone(tree)
            Reflect.deleteProperty(changed.tasks![0], 'annotations')
            assertTree(changed, task.file.id, task.id)
          },
          () => {
            const changed = structuredClone(tree)
            Object.assign(changed.tasks![0].result!, { state: 'invented' })
            assertTree(changed, task.file.id, task.id)
          },
        ]
        for (const mutation of mutations) {
          expect(mutation).toThrow()
          checks++
        }
        expect(tree.tasks).toHaveLength(1)
      },
    },
    () => {}
  )
  expect(checks).toBe(5)
})

it('replaces only actual packed metadata while preserving prior reporter references', async () => {
  const { createCollector } = await import(
    'next/dist/experimental/testing/runner/collector'
  )
  const { runCollected } = await import(
    'next/dist/experimental/testing/runner/lifecycle'
  )
  const { captureReporterTaskTree } = await import(
    'next/dist/experimental/testing/reporting/live-tasks'
  )
  const { createLiveReporterTaskStore } = await import(
    'next/dist/experimental/testing/reporting/custom-reporter-live-tasks'
  )
  const c = createCollector('packed-meta-file')
  const store = createLiveReporterTaskStore('/project')
  let futureMeta: object | undefined
  let futureView: unknown
  let firstTask: import('next/dist/experimental/testing/runner/tasks').Test
  c.api.test('first', ({ task }) => {
    firstTask = task
    Object.assign(task.meta, { authored: 'first' })
  })
  c.api.test('second', ({ task }) => {
    Object.assign(task.meta, { authored: 'second' })
    Object.assign(firstTask.meta, { lateChildMutation: true })
  })
  const result = await runCollected(
    c.close(),
    {
      runId: 'packed-meta-run',
      signal: new AbortController().signal,
      filePath: '/project/packed-meta.test.mjs',
      onCollected(file) {
        store.update(captureReporterTaskTree(file))
      },
      onCaseResult(task) {
        store.update(captureReporterTaskTree(task.file), [task.id])
        if (task.name === 'first') {
          const second = [...store.get(task.file.id)!.children!.allTests()][1]
          futureMeta = second.meta()
          futureView = second
        }
      },
      onSuiteEnd(_result, task) {
        store.update(captureReporterTaskTree(task.file), [task.id])
      },
    },
    () => {}
  )
  expect(result.errors).toEqual([])
  const [first, second] = [
    ...store.get('packed-meta-file')!.children!.allTests(),
  ]
  expect(first.meta()).toEqual({ authored: 'first' })
  expect(second).toBe(futureView)
  expect(second.meta()).not.toBe(futureMeta)
  expect(futureMeta).toEqual({})
  expect(second.meta()).toEqual({ authored: 'second' })
})

it('rejects absent task pack identities before changing an actual reporter tree', async () => {
  const { createCollector } = await import(
    'next/dist/experimental/testing/runner/collector'
  )
  const { runCollected } = await import(
    'next/dist/experimental/testing/runner/lifecycle'
  )
  const { captureReporterTaskTree } = await import(
    'next/dist/experimental/testing/reporting/live-tasks'
  )
  const { createLiveReporterTaskStore } = await import(
    'next/dist/experimental/testing/reporting/custom-reporter-live-tasks'
  )
  const c = createCollector('pack-validation-file')
  const store = createLiveReporterTaskStore('/project')
  c.api.test('real', () => {})
  let checked = false
  await runCollected(
    c.close(),
    {
      runId: 'pack-validation-run',
      signal: new AbortController().signal,
      filePath: '/project/pack-validation.test.mjs',
      onCollected(file) {
        store.update(captureReporterTaskTree(file))
      },
      onCaseResult(task) {
        const module = store.get(task.file.id)!
        const actual = store.case(task.file.id, task.id)
        const previousMeta = actual.meta()
        expect(actual.result().state).toBe('pending')
        expect(() =>
          store.update(captureReporterTaskTree(task.file), ['absent'])
        ).toThrow('absent task')
        expect(store.get(task.file.id)).toBe(module)
        expect(actual.meta()).toBe(previousMeta)
        expect(actual.result().state).toBe('pending')
        store.update(captureReporterTaskTree(task.file), [task.id])
        expect(actual.result().state).toBe('passed')
        checked = true
      },
    },
    () => {}
  )
  expect(checked).toBe(true)
})

it('delivers compiled logical callbacks with full actual task rows before a held following body finishes', () => {
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'logical-case-reporter.cjs')],
    { encoding: 'utf8', timeout: 90000 }
  )
  expect(JSON.parse(result)).toEqual({
    cases: 4,
    profiles: 2,
    earlyCallbacks: 2,
    fullTaskRows: true,
  })
}, 100000)

it('matches actual case/module callback order and rejected reporters through following files and shared cleanup', () => {
  const { execFileSync } = require('node:child_process')
  const output = execFileSync(
    process.execPath,
    [join(__dirname, 'logical-case-order.cjs')],
    { encoding: 'utf8', timeout: 140000 }
  )
  expect(JSON.parse(output)).toEqual({
    profiles: 3,
    cases: 6,
    callbacks: 6,
    followingBodyRequiresActualModuleCallback: true,
  })
}, 150000)

it('replays recorded terminal task graphs and both reporter errors without compiling authored tests', () => {
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'logical-blob-replay.cjs')],
    { encoding: 'utf8', timeout: 170000 }
  )
  expect(JSON.parse(result)).toEqual({
    profiles: 6,
    cases: 9,
    callbackRows: 30,
    recordedAndReplayErrorsRetained: true,
    noAuthoredTestsInMergeRoot: true,
    jsonAndJUnitRetained: true,
  })
}, 180000)

it('replays genuine terminal Vitest blob task views and reporter failures without authored tests', () => {
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'foreign-blob-replay.cjs')],
    { encoding: 'utf8', timeout: 230000 }
  )
  expect(JSON.parse(result)).toEqual({
    corpora: 8,
    callbacks: 20,
    fullRows: 48,
    noAuthoredTests: true,
    completeForeignReports: 8,
    originalAndReplayErrors: true,
  })
}, 240000)

it('keeps legacy JSON blob projection while refusing absent reporter facts before loading adapters', async () => {
  const root = await mkdtemp(join(tmpdir(), 'next-foreign-reporter-facts-'))
  const input = join(root, 'blobs')
  await mkdir(input)
  const outputFile = join(root, 'result.json')
  const marker = join(root, 'adapter-loaded')
  const reporter = join(root, 'reporter.mjs')
  const wire = await readFile(
    join(__dirname, 'fixtures/vitest-5.0.4/original-public-merge.blob'),
    'utf8'
  )
  try {
    await writeFile(
      reporter,
      `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)}, 'loaded'); export default class { onTestCaseResult() {} }`
    )
    for (const change of [
      (file: any, _test: any) => delete file.fullName,
      (_file: any, test: any) => (test.each = 42),
      (_file: any, test: any) => (test.timeout = -1),
      (_file: any, test: any) => delete test.annotations,
    ]) {
      const table = JSON.parse(wire)
      const files = table[Number(table[0][1])]
      const file = table[Number(files[0])]
      const tests = table[Number(file.tasks)]
      change(file, table[Number(tests[0])])
      await writeFile(join(input, 'actual.blob'), JSON.stringify(table))
      await expect(
        mergeResultReports(input, {
          projectDir: root,
          reporters: ['json'],
          outputFile,
        })
      ).resolves.toBe('passed')
      expect(JSON.parse(await readFile(outputFile, 'utf8')).success).toBe(true)
      await writeFile(outputFile, 'existing report')
      await expect(
        mergeResultReports(input, {
          projectDir: root,
          reporters: parseResultReporters(['json', reporter]),
          outputFile,
        })
      ).rejects.toThrow()
      expect(await readFile(outputFile, 'utf8')).toBe('existing report')
      await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' })
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('loads TypeScript and MTS reporters with real local typed imports and exact terminal task views', () => {
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'typescript-reporter-import.cjs')],
    { encoding: 'utf8', timeout: 100000 }
  )
  expect(JSON.parse(result)).toEqual({
    profiles: 4,
    callbacks: 8,
    fullRows: 24,
    noAuthoredTests: true,
    completeForeignReports: 4,
    typedLocalDependencyAndOriginalErrors: true,
  })
}, 110000)

it('loads typed directory, output-suffix, dynamic and mixed reporter dependency graphs', () => {
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'reporter-import-graphs.cjs')],
    { encoding: 'utf8' }
  )
  expect(JSON.parse(result)).toEqual({
    profiles: 8,
    callbacks: 16,
    fullRows: 48,
    noAuthoredTests: true,
    completeForeignReports: 8,
    typedDirectoryOutputDynamicAndMixedImports: true,
  })
}, 180000)

describe('actual custom reporter cancellation ownership', () => {
  it.each([
    'normal',
    'callback-error',
    'close-error',
    'callback-error-close-error',
    'terminal-error-close-error',
    'callback-error-terminal-error-close-error',
    'transport-error',
  ])(
    'joins cancelled %s reporters while preserving actual errors',
    async (mode) => {
      const root = await mkdtemp(join(tmpdir(), 'next-cancel-reporter-'))
      const { openCustomReporters } = await import(
        'next/dist/experimental/testing/reporting/custom-reporter'
      )
      const controller = new AbortController()
      let session: Awaited<ReturnType<typeof openCustomReporters>> | undefined
      try {
        await cp(
          join(__dirname, 'fixtures/cancellation-reporter.mjs'),
          join(root, 'reporter.mjs')
        )
        await writeFile(
          join(root, 'cancel-options.json'),
          JSON.stringify({ mode })
        )
        session = await openCustomReporters({
          projectDir: root,
          reporters: ['./reporter.mjs'],
          signal: controller.signal,
          write() {},
        })
        const trace = async () =>
          (await readFile(join(root, 'cancel-trace.jsonl'), 'utf8'))
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line))
        const [{ pid }] = await trace()
        expect(pid).not.toBe(process.pid)
        expect(session.captureTaskResults).toBe(true)
        const collector = createTestReporter({ projectDir: root, write() {} })
        const completion = {
          ...collector.getResults(),
          events: [],
          status: 'cancelled' as const,
        }
        if (mode.startsWith('callback-error')) {
          session.onEvent({
            ...envelope,
            type: 'output',
            entryId: entry.id,
            stream: 'stdout',
            text: 'before cancellation\n',
            console: { taskId: '__vitest__unknown_test__', size: 19 },
          })
          expect(await session.collectErrors()).toEqual([
            expect.objectContaining({
              message: 'actual prior console callback rejected',
            }),
          ])
        }
        const leaves = (error: any): string[] =>
          error instanceof AggregateError
            ? error.errors.flatMap(leaves)
            : [error.message]
        if (mode.includes('terminal-error')) {
          const prior = await session.finish(completion).then(
            () => undefined,
            (error) => error
          )
          expect(leaves(prior)).toContain(
            'actual prior terminal callback rejected'
          )
        }
        controller.abort(new Error('actual reporter owner cancelled'))
        session.onEvent({
          ...envelope,
          type: 'output',
          entryId: entry.id,
          stream: 'stdout',
          text: 'after cancellation\n',
          console: { taskId: '__vitest__unknown_test__', size: 18 },
        })
        const finished = await session.finish(completion).then(
          () => undefined,
          (error) => error
        )
        const disposed = await session.dispose().then(
          () => undefined,
          (error) => error
        )
        const errors = [finished, disposed].filter(
          (error) => error !== undefined
        )
        const messages = errors.flatMap(leaves).join('\n')
        if (mode === 'normal') {
          expect(errors).toEqual([])
          expect(await session.collectErrors()).toEqual([])
        }
        if (mode.startsWith('callback-error'))
          expect(messages).toContain('actual prior console callback rejected')
        if (mode.includes('terminal-error'))
          expect(messages).toContain('actual prior terminal callback rejected')
        if (mode.includes('close-error'))
          expect(messages).toContain('actual cancellation close rejected')
        if (mode === 'transport-error')
          expect(messages).toContain('Invalid custom reporter response')
        const rows = await trace()
        expect(rows.some((row) => row.hook === 'close-start')).toBe(true)
        expect(
          rows.filter((row) => row.hook === 'terminal-request')
        ).toHaveLength(mode.includes('terminal-error') ? 1 : 0)
        expect(errors.flatMap(leaves)).toEqual([
          ...(mode.startsWith('callback-error')
            ? ['actual prior console callback rejected']
            : []),
          ...(mode.includes('terminal-error')
            ? ['actual prior terminal callback rejected']
            : []),
          ...(mode.includes('close-error')
            ? ['actual cancellation close rejected']
            : []),
          ...(mode === 'transport-error'
            ? ['Invalid custom reporter response.']
            : []),
        ])
        expect(
          rows.filter((row) => row.hook === 'console').map((row) => row.content)
        ).not.toContain('after cancellation\n')
        expect(() => process.kill(pid, 0)).toThrow()
      } finally {
        controller.abort()
        await session?.dispose().catch(() => {})
        await rm(root, { recursive: true, force: true })
      }
    }
  )
})

it('loads native package reporters from the actual project root in both Node profiles', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'reporter-packages.cjs')],
    { timeout: 180000, maxBuffer: 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toEqual({
    profiles: 8,
    callbacks: 16,
    fullRows: 48,
    noAuthoredTests: true,
    completeForeignReports: 8,
    nativeImportConditionsCommonJsSubpathAndUnscoped: true,
  })
}, 190000)

it('keeps unimplemented built-in reporter names separate from package entries', () => {
  for (const reporter of [
    'agent',
    'minimal',
    'tree',
    'hanging-process',
    'html',
  ])
    expect(() => parseResultReporters([reporter])).toThrow(
      'Unsupported result reporter'
    )
  for (const reporter of [
    'node:fs',
    'https://example.invalid/reporter',
    '@scope',
    'name/../reporter',
  ])
    expect(() => parseResultReporters([reporter])).toThrow(
      'Unsupported result reporter'
    )
})

it('keeps actual native entry rejections global across standard, TAP and stable/live custom module views', async () => {
  const { createCustomReporterModules } = await import(
    'next/dist/experimental/testing/reporting/custom-reporter-tasks'
  )
  const { createLiveReporterTaskStore } = await import(
    'next/dist/experimental/testing/reporting/custom-reporter-live-tasks'
  )
  const { renderTapReport } = await import(
    'next/dist/experimental/testing/reporting/builtin-reporters'
  )
  const { createCollector } = await import(
    'next/dist/experimental/testing/runner/collector'
  )
  const { runCollected } = await import(
    'next/dist/experimental/testing/runner/lifecycle'
  )
  const { captureReporterTaskTree } = await import(
    'next/dist/experimental/testing/reporting/live-tasks'
  )
  const diagnostics: ResultEvent[] = [
    {
      ...envelope,
      type: 'diagnostic',
      entryId: entry.id,
      revision: 'rev-1',
      diagnostic: {
        phase: 'runtime',
        severity: 'error',
        message: 'ordinary suite failure',
      },
    },
    {
      ...envelope,
      type: 'diagnostic',
      entryId: entry.id,
      revision: 'rev-1',
      diagnostic: {
        phase: 'runtime',
        severity: 'error',
        unhandled: 'rejection',
        message: 'first native event',
      },
    },
    {
      ...envelope,
      type: 'diagnostic',
      entryId: entry.id,
      revision: 'rev-1',
      diagnostic: {
        phase: 'cleanup',
        severity: 'error',
        message: 'ordinary cleanup failure',
      },
    },
    {
      ...envelope,
      type: 'diagnostic',
      diagnostic: {
        phase: 'runtime',
        severity: 'error',
        message: 'ordinary global failure',
      },
    },
    {
      ...envelope,
      type: 'diagnostic',
      entryId: entry.id,
      revision: 'rev-1',
      diagnostic: {
        phase: 'runtime',
        severity: 'error',
        unhandled: 'rejection',
        message: 'second native event',
      },
    },
  ]
  const events: ResultEvent[] = [
    { ...envelope, type: 'run-start' },
    { ...envelope, type: 'file-start', entry, revision: 'rev-1' },
    ...diagnostics,
    {
      ...envelope,
      type: 'file-end',
      entryId: entry.id,
      status: 'failed',
      durationMs: 1,
    },
    { ...envelope, type: 'run-end', status: 'failed', durationMs: 1 },
  ]
  const original = JSON.stringify(events)
  let text = ''
  const reporter = createTestReporter({
    projectDir: '/project',
    write(value) {
      text += value
    },
  })
  try {
    for (const event of events) reporter.onEvent(event)
    expect(text).toContain('Failed Suites 1')
    expect(text.match(/Unhandled Rejection/g)).toHaveLength(2)
    expect(text).toContain('Errors  3 errors')
    const suites = text.slice(
      text.indexOf('Failed Suites'),
      text.indexOf('Unhandled Errors')
    )
    expect(suites).toContain('ordinary suite failure')
    expect(suites).toContain('ordinary cleanup failure')
    expect(suites).not.toContain('first native event')
    expect(suites).not.toContain('second native event')
    const completion = {
      ...reporter.getResults(),
      events,
      status: 'failed' as const,
    }
    const stable = createCustomReporterModules('/project', completion)[0]
    expect(stable.errors()).toEqual([
      {
        phase: 'runtime',
        severity: 'error',
        message: 'ordinary suite failure',
      },
      {
        phase: 'cleanup',
        severity: 'error',
        message: 'ordinary cleanup failure',
      },
    ])
    const c = createCollector(entry.id)
    c.api.test('real', () => {})
    const live = createLiveReporterTaskStore('/project')
    await runCollected(
      c.close(),
      {
        runId: 'native-consumer',
        signal: new AbortController().signal,
        filePath: entry.file,
        onCollected(file) {
          live.update(captureReporterTaskTree(file))
        },
      },
      () => {}
    )
    const module = live.finishModule(entry.id, completion)!
    expect(module.errors()).toEqual([
      {
        phase: 'runtime',
        severity: 'error',
        message: 'ordinary suite failure',
      },
      {
        phase: 'cleanup',
        severity: 'error',
        message: 'ordinary cleanup failure',
      },
    ])
    const tap = renderTapReport(completion, events, { projectDir: '/project' })
    expect(tap).toContain('[run errors]')
    expect(tap.match(/first native event/g)).toHaveLength(1)
    expect(tap.match(/second native event/g)).toHaveLength(1)
    expect(tap.match(/ordinary suite failure/g)).toHaveLength(1)
    expect(tap.match(/ordinary cleanup failure/g)).toHaveLength(1)
    expect(JSON.stringify(events)).toBe(original)
  } finally {
    reporter.dispose()
  }
})

it('loads JSX and TSX completion reporters with actual React evaluation and exact terminal task views', () => {
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'jsx-reporter-import.cjs')],
    { encoding: 'utf8', timeout: 100000 }
  )
  expect(JSON.parse(result)).toEqual({
    profiles: 4,
    callbacks: 8,
    fullRows: 28,
    noAuthoredTests: true,
    completeForeignReports: 4,
    jsxEvaluationAndOriginalErrors: true,
  })
}, 110000)

it('loads relative JSX/TSX reporter graphs with pinned file, index and output suffix precedence', () => {
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'jsx-reporter-graphs.cjs')],
    { encoding: 'utf8', timeout: 170000 }
  )
  expect(JSON.parse(result)).toEqual({
    profiles: 6,
    callbacks: 12,
    fullRows: 42,
    noAuthoredTests: true,
    completeForeignReports: 6,
    jsxRelativeGraphsAndResolverOrder: true,
  })
}, 180000)

it.each([
  'unowned-relative',
  'owned-package',
  'unexpected-native-error',
  'package-directory',
])('preserves the native reporter resolution boundary for %s', async (kind) => {
  const root = await mkdtemp(join(tmpdir(), 'next-jsx-reporter-boundary-'))
  try {
    const { pathToFileURL } = await import('node:url')
    const loader = await import(
      'next/dist/experimental/testing/reporting/custom-reporter-loader'
    )
    const filename = join(root, 'reporter.mjs')
    await writeFile(filename, 'export default class Reporter {}\n')
    await writeFile(join(root, 'dependency.jsx'), 'export default 1\n')
    await mkdir(join(root, 'dependency'))
    await writeFile(join(root, 'dependency/index.jsx'), 'export default 2\n')
    if (kind === 'package-directory')
      await writeFile(
        join(root, 'dependency/package.json'),
        '{"type":"module"}\n'
      )
    await loader.initialize({ entries: [filename] })
    const parentURL = pathToFileURL(
      kind === 'unowned-relative' ? join(root, 'outside.mjs') : filename
    ).href
    const failure = Object.assign(
      new Error('actual native resolution rejected'),
      {
        code:
          kind === 'unexpected-native-error'
            ? 'ERR_ACCESS_DENIED'
            : 'ERR_MODULE_NOT_FOUND',
      }
    )
    if (kind === 'package-directory') await rm(join(root, 'dependency.jsx'))
    const nextResolve = jest.fn(async () => {
      throw failure
    })
    await expect(
      loader.resolve(
        kind === 'owned-package' ? 'dependency' : './dependency',
        { parentURL },
        nextResolve
      )
    ).rejects.toBe(failure)
    expect(nextResolve).toHaveBeenCalledTimes(1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('preserves raw Error reflection while sharing exact frame boundaries across formatter copies and installations', () => {
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'error-reflection.cjs')],
    { encoding: 'utf8' }
  )
  expect(JSON.parse(result)).toEqual({ reflections: 10, consumers: 7 })
})

it.each([
  'valid',
  'legacy',
  'foreign-suite',
  'slot-other-error',
  'slot-absent',
  'slot-negative',
  'slot-fractional',
  'slot-nan',
  'slot-string',
  'wrong-payload-name',
  'wrong-payload-stack',
  'wrong-run',
  'wrong-entry',
  'wrong-revision',
  'missing-revision',
  'later-owner',
  'duplicate-equal',
  'duplicate-different',
])(
  'retains exact suite error ownership in live and replayed module views: %s',
  async (mode) => {
    const { createCustomReporterModules, isReportedSuiteError } = await import(
      'next/dist/experimental/testing/reporting/custom-reporter-tasks'
    )
    const { createLiveReporterTaskStore } = await import(
      'next/dist/experimental/testing/reporting/custom-reporter-live-tasks'
    )
    const { createCollector } = await import(
      'next/dist/experimental/testing/runner/collector'
    )
    const { runCollected } = await import(
      'next/dist/experimental/testing/runner/lifecycle'
    )
    const { captureReporterTaskTree } = await import(
      'next/dist/experimental/testing/reporting/live-tasks'
    )
    const first = {
      phase: 'runtime' as const,
      severity: 'error' as const,
      name: 'Error',
      message: 'same authored message',
      stack: 'first actual authored stack',
    }
    const second = { ...first, stack: 'second actual authored stack' }
    const suite: Extract<ResultEvent, { type: 'suite-end' }> = {
      ...envelope,
      type: 'suite-end',
      entryId: entry.id,
      revision: 'rev-1',
      suiteId: entry.id,
      name: '',
      ancestors: [],
      mode: 'run',
      status: 'failed',
      durationMs: 1,
      errors: [first, second],
    }
    const diagnostic: Extract<ResultEvent, { type: 'diagnostic' }> = {
      ...envelope,
      type: 'diagnostic',
      entryId: entry.id,
      revision: 'rev-1',
      suiteError: { suiteId: entry.id, index: 0 },
      diagnostic: structuredClone(first),
    }
    const { reporter, emit } = setup()
    try {
      reporter.onEvent(suite)
      reporter.onEvent(diagnostic)
      emit({
        type: 'file-end',
        entryId: entry.id,
        status: 'failed',
        durationMs: 1,
      })
      const results = reporter.getResults()
      const events = [structuredClone(suite), structuredClone(diagnostic)]
      const owner = events[0] as typeof suite
      const candidate = events[1] as typeof diagnostic
      if (mode === 'legacy') delete candidate.suiteError
      if (mode === 'foreign-suite') candidate.suiteError!.suiteId = 'foreign'
      if (mode === 'slot-other-error') candidate.suiteError!.index = 1
      if (mode === 'slot-absent') candidate.suiteError!.index = 2
      if (mode === 'slot-negative') candidate.suiteError!.index = -1
      if (mode === 'slot-fractional') candidate.suiteError!.index = 0.5
      if (mode === 'slot-nan') candidate.suiteError!.index = NaN
      if (mode === 'slot-string')
        candidate.suiteError!.index = '0' as unknown as number
      if (mode === 'wrong-payload-name')
        candidate.diagnostic.name = 'OtherError'
      if (mode === 'wrong-payload-stack')
        candidate.diagnostic.stack = second.stack
      if (mode === 'wrong-run') owner.runId = 'foreign-run'
      if (mode === 'wrong-entry') owner.entryId = 'foreign-entry'
      if (mode === 'wrong-revision') owner.revision = 'foreign-revision'
      if (mode === 'missing-revision') delete candidate.revision
      if (mode === 'later-owner') events.reverse()
      if (mode === 'duplicate-equal') events.unshift(structuredClone(owner))
      if (mode === 'duplicate-different') {
        const duplicate = structuredClone(owner)
        duplicate.errors[0] = structuredClone(second)
        events.unshift(duplicate)
      }
      for (const replayed of [false, true]) {
        const actualEvents: ResultEvent[] = replayed
          ? JSON.parse(JSON.stringify(events))
          : events
        const actualDiagnostic = actualEvents.find(
          (event) => event.type === 'diagnostic'
        ) as typeof diagnostic
        const original = JSON.stringify(actualEvents)
        expect(isReportedSuiteError(actualDiagnostic, actualEvents)).toBe(
          mode === 'valid'
        )
        const completion = {
          ...results,
          events: actualEvents,
          status: 'failed' as const,
        }
        const expected =
          mode === 'valid'
            ? [first, second]
            : [first, second, actualDiagnostic.diagnostic]
        const stable = createCustomReporterModules('/project', completion)[0]
        expect(stable.errors()).toEqual(expected)
        const c = createCollector(entry.id)
        c.api.test('actual declaration', () => {})
        const live = createLiveReporterTaskStore('/project')
        await runCollected(
          c.close(),
          {
            runId: 'suite-error-owner',
            signal: new AbortController().signal,
            filePath: entry.file,
            onCollected(file) {
              live.update(captureReporterTaskTree(file))
            },
          },
          () => {}
        )
        expect(live.finishModule(entry.id, completion)!.errors()).toEqual(
          expected
        )
        expect(JSON.stringify(actualEvents)).toBe(original)
      }
    } finally {
      reporter.dispose()
    }
  }
)

it('retains genuine All-hook suite/module error ownership through the ordinary public CLI', async () => {
  const output = execFileSync(
    process.execPath,
    [join(__dirname, 'suite-error-ownership.cjs')],
    { encoding: 'utf8', timeout: 520000 }
  )
  expect(JSON.parse(output)).toEqual({
    completeProfiles: 12,
    genuineProfiles: 12,
    allCaseEventCallbackAndErrorRowsExact: true,
    actualSuiteSlotAssociations: 12,
  })
}, 530000)

describe('closed watch file JSON history', () => {
  function historicalFile(status: 'passed' | 'failed' = 'passed') {
    const machine = createMachineReporter({
      projectDir: '/project',
      reporters: ['json'],
    })
    const emit = (event: object) =>
      machine.onEvent({
        ...envelope,
        runId: 'old-run',
        ...event,
      } as ResultEvent)
    emit({ type: 'run-start' })
    emit({
      type: 'file-start',
      entry,
      revision: 'old-revision',
      timestamp: 500,
    })
    emit({ type: 'case-end', ...result(0, status), name: 'old actual title' })
    emit({
      type: 'file-end',
      entryId: entry.id,
      status,
      durationMs: 3,
    })
    emit({ type: 'run-end', status, durationMs: 3 })
    const record = machine.snapshotClosedFiles(new Set([entry.id]))[0]
    machine.dispose()
    return record
  }

  it('retains original closed rows in selected specification order without replaying events', () => {
    const old = historicalFile()
    const active = { ...entry, id: 'active', file: '/project/active.test.ts' }
    const unseen = { ...entry, id: 'unseen', file: '/project/unseen.test.ts' }
    const machine = createMachineReporter({
      projectDir: '/project',
      reporters: ['json'],
    })
    const emit = (event: object) =>
      machine.onEvent({
        ...envelope,
        runId: 'new-run',
        ...event,
      } as ResultEvent)
    try {
      emit({ type: 'run-start' })
      emit({
        type: 'file-start',
        entry: active,
        revision: 'fresh-revision',
        timestamp: 1,
      })
      emit({
        type: 'case-end',
        ...result(0, 'skipped'),
        entryId: active.id,
        name: 'actually cancelled case',
      })
      emit({
        type: 'file-end',
        entryId: active.id,
        status: 'passed',
        durationMs: 0,
      })
      machine.retainUnexecutedFiles(
        [entry, unseen],
        [old],
        [entry.id, active.id, unseen.id]
      )
      old.result.cases[0].name = 'caller mutation'
      emit({ type: 'run-end', status: 'passed', durationMs: 3 })
      const report = machine.getJson()
      expect(report.testResults.map((file) => file.name)).toEqual([
        entry.file,
        active.file,
        unseen.file,
      ])
      expect(report.testResults[0]).toMatchObject({
        startTime: 500,
        endTime: 503,
        status: 'passed',
        assertionResults: [
          expect.objectContaining({
            fullName: 'old actual title',
            status: 'passed',
          }),
        ],
      })
      expect(report.testResults[2]).toMatchObject({
        status: 'passed',
        assertionResults: [],
      })
      expect(report).toMatchObject({
        success: true,
        numTotalTests: 2,
        numPassedTests: 1,
        numPendingTests: 1,
      })
      expect(
        report.next.events.every((event) => event.runId === 'new-run')
      ).toBe(true)
      expect(
        report.next.events.filter((event) => event.type === 'case-end')
      ).toHaveLength(1)
      expect(
        machine
          .snapshotClosedFiles(new Set([entry.id, active.id]))
          .map((record) => record.result.entry.entry.id)
      ).toEqual([active.id])
    } finally {
      machine.dispose()
    }
  })

  it('keeps current executed rows authoritative over historical data', () => {
    const old = historicalFile()
    const machine = createMachineReporter({
      projectDir: '/project',
      reporters: ['json'],
    })
    const emit = (event: object) =>
      machine.onEvent({
        ...envelope,
        runId: 'new-run',
        ...event,
      } as ResultEvent)
    try {
      emit({ type: 'run-start' })
      emit({ type: 'file-start', entry, revision: 'fresh-revision' })
      emit({
        type: 'case-end',
        ...result(0, 'passed'),
        name: 'actual new title',
      })
      emit({
        type: 'file-end',
        entryId: entry.id,
        status: 'passed',
        durationMs: 1,
      })
      machine.retainUnexecutedFiles([entry], [old], [entry.id])
      emit({ type: 'run-end', status: 'passed', durationMs: 1 })
      expect(
        machine
          .getJson()
          .testResults[0].assertionResults.map((test) => test.fullName)
      ).toEqual(['actual new title'])
      expect(machine.getJson().numTotalTests).toBe(1)
    } finally {
      machine.dispose()
    }
  })

  it('preserves a real failed historical row and unsuccessful JSON after user cancellation', () => {
    const old = historicalFile('failed')
    const active = { ...entry, id: 'active', file: '/project/active.test.ts' }
    const machine = createMachineReporter({
      projectDir: '/project',
      reporters: ['json'],
    })
    const emit = (event: object) =>
      machine.onEvent({
        ...envelope,
        runId: 'new-run',
        ...event,
      } as ResultEvent)
    try {
      emit({ type: 'run-start' })
      emit({ type: 'file-start', entry: active, revision: 'new-revision' })
      emit({ type: 'case-end', ...result(0, 'skipped'), entryId: active.id })
      emit({
        type: 'file-end',
        entryId: active.id,
        status: 'passed',
        durationMs: 1,
      })
      machine.retainUnexecutedFiles([entry], [old], [active.id, entry.id])
      emit({ type: 'run-end', status: 'passed', durationMs: 1 })
      const report = machine.getJson()
      expect(report).toMatchObject({
        success: false,
        numFailedTests: 1,
        numFailedTestSuites: 1,
        numPendingTests: 1,
      })
      expect(report.testResults[1]).toMatchObject({
        status: 'failed',
        startTime: 500,
        endTime: 503,
        assertionResults: [
          expect.objectContaining({
            fullName: 'old actual title',
            status: 'failed',
          }),
        ],
      })
      expect(
        report.next.events.every((event) => event.runId === 'new-run')
      ).toBe(true)
      expect(
        report.next.events.filter((event) => event.type === 'case-end')
      ).toHaveLength(1)
    } finally {
      machine.dispose()
    }
  })

  it('refuses mixed historical ownership without adding any current case', () => {
    const old = historicalFile()
    const machine = createMachineReporter({
      projectDir: '/project',
      reporters: ['json'],
    })
    try {
      old.caseCompletions[0].runId = 'foreign'
      expect(() =>
        machine.retainUnexecutedFiles([entry], [old], [entry.id])
      ).toThrow('Invalid closed watch file record')
    } finally {
      machine.dispose()
    }
  })
})

describe('actual custom watch hooks and worker ownership', () => {
  it.each(['none', 'initial', 'later', 'rerun', 'removed'])(
    'joins async watch callbacks with %s failure policy',
    async (error) => {
      const { openCustomReporters } = await import(
        'next/dist/experimental/testing/reporting/custom-reporter'
      )
      const { createCollector } = await import(
        'next/dist/experimental/testing/runner/collector'
      )
      const { runCollected } = await import(
        'next/dist/experimental/testing/runner/lifecycle'
      )
      const { captureReporterTaskTree } = await import(
        'next/dist/experimental/testing/reporting/live-tasks'
      )
      const root = await mkdtemp(join(tmpdir(), 'next-watch-hooks-'))
      let session: Awaited<ReturnType<typeof openCustomReporters>> | undefined
      try {
        await cp(
          join(__dirname, 'fixtures/watch-hooks-reporter.mjs'),
          join(root, 'reporter.mjs')
        )
        await writeFile(
          join(root, 'watch-options.json'),
          JSON.stringify({ error })
        )
        session = await openCustomReporters({
          projectDir: root,
          reporters: ['./reporter.mjs'],
          watch: true,
          write() {},
        })
        expect(session.captureTaskResults).toBe(true)
        const empty = {
          entries: [],
          files: [],
          cases: [],
          suites: [],
          events: [],
          status: 'passed' as const,
        }
        await session.beginWatchRun()
        await session.finish(empty)
        const initialError = await session.readyWatchRun(true)
        if (error === 'initial')
          expect(initialError?.message).toBe('actual initial readiness failure')
        else expect(initialError).toBeUndefined()
        const rerun = session.beginWatchRun({
          rerun: { files: [entry.file], trigger: 'subject.mjs' },
        })
        if (error === 'rerun')
          await expect(rerun).rejects.toThrow('actual rerun failure')
        else {
          await rerun
          const collector = createCollector(entry.id)
          collector.api.describe('owned suite', () => {
            collector.api.test('owned test', ({ task }) => {
              Object.assign(task.meta, { authored: 'kept' })
            })
          })
          let tree!: ReturnType<typeof captureReporterTaskTree>
          await runCollected(
            collector.close(),
            {
              runId: 'watch-hook-run',
              filePath: entry.file,
              signal: new AbortController().signal,
              onSuiteEnd(_result, task) {
                if (task.file === task)
                  tree = captureReporterTaskTree(task.file)
              },
            },
            () => {}
          )
          const completion = {
            ...empty,
            entries: [{ ...envelope, type: 'file-start' as const, entry }],
            files: [
              {
                ...envelope,
                type: 'file-end' as const,
                entryId: entry.id,
                status: 'passed' as const,
                durationMs: 0,
              },
            ],
          }
          await session.replayFile(tree, completion)
          await session.finish(completion)
          const later = session.readyWatchRun(false)
          if (error === 'later')
            await expect(later).rejects.toThrow(
              'actual later readiness failure'
            )
          else {
            await expect(later).resolves.toBeUndefined()
            const removed = session.removeWatchTests([entry.file])
            if (error === 'removed')
              await expect(removed).rejects.toThrow('actual removed failure')
            else await removed
          }
        }
        const closing = session.dispose()
        expect(session.dispose()).toBe(closing)
        await closing
        const rows = (await readFile(join(root, 'watch-hooks.jsonl'), 'utf8'))
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
        expect(rows[0]).toEqual({ type: 'ready', count: 1 })
        expect(rows[1]).toEqual({
          type: 'rerun',
          files: [entry.file],
          trigger: 'subject.mjs',
        })
        if (error !== 'rerun')
          expect(rows[2]).toEqual({
            type: 'ready',
            count: 2,
            files: [
              {
                name: 'example.test.ts',
                mode: 'run',
                state: 'pass',
                self: true,
                cases: [
                  {
                    name: 'owned suite',
                    file: true,
                    parent: true,
                    tests: [
                      {
                        name: 'owned test',
                        file: true,
                        suite: true,
                        privateParent: false,
                        meta: { authored: 'kept' },
                        state: 'pass',
                      },
                    ],
                  },
                ],
              },
            ],
          })
        expect(rows.filter((row) => row.type === 'close')).toHaveLength(
          ['none', 'initial'].includes(error) ? 1 : 0
        )
        if (['none', 'initial', 'removed'].includes(error))
          expect(rows.some((row) => row.type === 'removed')).toBe(true)
      } finally {
        await session?.dispose()
        await rm(root, { recursive: true, force: true })
      }
    }
  )
})

it('settles initial related selection before a recovering reporter readiness failure', async () => {
  const { spawn } = await import('node:child_process')
  const root = await mkdtemp(
    join(__dirname, '../../../.next-test-related-startup-')
  )
  const source = join(__dirname, 'fixtures/related-startup-watch-error')
  let child: ReturnType<typeof spawn> | undefined
  let closed:
    | Promise<{ code: number | null; signal: NodeJS.Signals | null }>
    | undefined
  let output = ''
  let outputRoot: string | undefined
  function joinClosed() {
    if (!closed) return Promise.resolve(undefined)
    let timer: ReturnType<typeof setTimeout> | undefined
    return Promise.race([
      closed,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('Owned related watch did not close.')),
          10000
        )
      }),
    ]).finally(() => clearTimeout(timer))
  }
  try {
    outputRoot = await mkdtemp(join(tmpdir(), 'next-related-reporter-'))
    for (const file of [
      'alpha.mjs.txt',
      'beta.mjs.txt',
      'alpha.case.mjs.txt',
      'beta.case.mjs.txt',
      'reporter.mjs',
      'watch.mjs',
    ])
      await cp(join(source, file), join(root, file.replace(/\.txt$/, '')))
    await writeFile(
      join(root, 'package.json'),
      ' {"private":true,"type":"module"}\n'
    )
    await writeFile(
      join(root, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({ turbopack: { root: join(__dirname, '../../..') } }) +
        '\n'
    )
    await writeFile(
      join(root, 'next.test.config.json'),
      JSON.stringify({
        maxWorkers: 1,
        projects: [
          {
            name: 'watch-node',
            mode: 'development',
            environment: 'node',
            include: ['*.case.mjs'],
          },
        ],
      })
    )
    const marker = join(outputRoot, 'events.jsonl')
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'development' as const,
      NEXT_TELEMETRY_DISABLED: '1',
      WATCH_EVENTS: marker,
      WATCH_ERROR_KIND: 'ready',
    }
    delete env.CI
    child = spawn(
      process.execPath,
      [
        join(root, 'watch.mjs'),
        root,
        join(__dirname, '../../../packages/next/dist/experimental/testing'),
      ],
      { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }
    )
    child.stdout!.on('data', (chunk) => (output += chunk))
    child.stderr!.on('data', (chunk) => (output += chunk))
    child.on('message', (message: any) => {
      if (message?.type === 'diagnostic')
        output += JSON.stringify(message.event) + '\n'
    })
    closed = new Promise((resolve, reject) => {
      child!.once('error', reject)
      child!.once('close', (code, signal) => resolve({ code, signal }))
    })
    void closed.catch(() => {})
    const rows = async () =>
      (await readFile(marker, 'utf8'))
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    await retry(
      async () => {
        expect((await rows()).some((row) => row.type === 'ready-error')).toBe(
          true
        )
      },
      60000,
      500,
      'actual initial related reporter failure'
    )
    await writeFile(join(root, 'beta.mjs'), 'export const value=2\n')
    await retry(
      async () => {
        expect((await rows()).some((row) => row.type === 'ready-after')).toBe(
          true
        )
      },
      60000,
      500,
      'actual beta-only recovery'
    )
    child.send({ type: 'close' })
    expect(await joinClosed()).toEqual({ code: 0, signal: null })
    expect(await rows()).toEqual(
      JSON.parse(
        await readFile(join(source, 'pristine-development.json'), 'utf8')
      )
    )
    expect(output).toContain('actual async ready rejection')
  } catch (error) {
    console.error(output)
    throw error
  } finally {
    try {
      if (child?.connected) child.send({ type: 'close' })
      try {
        await joinClosed()
      } finally {
        await killApp(child)
        await closed?.catch(() => {})
      }
    } finally {
      try {
        await rm(root, { recursive: true, force: true })
      } finally {
        if (outputRoot) await rm(outputRoot, { recursive: true, force: true })
      }
    }
  }
}, 180000)

it.each([false, true])(
  'publishes an actual removal rejection before owned shutdown (writerFails=%s)',
  async (writerFails) => {
    const { spawn } = await import('node:child_process')
    const root = await mkdtemp(
      join(__dirname, '../../../.next-test-removed-watch-')
    )
    const source = join(__dirname, 'fixtures/removed-watch-error')
    let outputRoot: string | undefined
    let child: ReturnType<typeof spawn> | undefined
    let closed:
      | Promise<{ code: number | null; signal: NodeJS.Signals | null }>
      | undefined
    let output = ''
    const messages: any[] = []
    function joinClosed() {
      if (!closed) return Promise.resolve(undefined)
      let timer: ReturnType<typeof setTimeout> | undefined
      return Promise.race([
        closed,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('Owned removal watch did not close.')),
            10000
          )
        }),
      ]).finally(() => clearTimeout(timer))
    }
    try {
      outputRoot = await mkdtemp(join(tmpdir(), 'next-removed-reporter-'))
      for (const file of [
        'contract.case.mjs.txt',
        'subject.mjs.txt',
        'watch.mjs',
      ])
        await cp(join(source, file), join(root, file.replace(/\.txt$/, '')))
      await cp(
        join(__dirname, 'fixtures/related-startup-watch-error/reporter.mjs'),
        join(root, 'reporter.mjs')
      )
      await writeFile(
        join(root, 'package.json'),
        '{"private":true,"type":"module"}\n'
      )
      await writeFile(
        join(root, 'next.config.mjs'),
        'export default ' +
          JSON.stringify({ turbopack: { root: join(__dirname, '../../..') } }) +
          '\n'
      )
      await writeFile(
        join(root, 'next.test.config.json'),
        JSON.stringify({
          maxWorkers: 1,
          projects: [
            {
              name: 'watch-node',
              mode: 'development',
              environment: 'node',
              include: ['*.case.mjs'],
            },
          ],
        })
      )
      const marker = join(outputRoot, 'events.jsonl')
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        NODE_ENV: 'development' as const,
        NEXT_TELEMETRY_DISABLED: '1',
        WATCH_EVENTS: marker,
        WATCH_ERROR_KIND: 'removed',
        WATCH_ERROR_WRITER: writerFails ? '1' : '0',
      }
      delete env.CI
      child = spawn(
        process.execPath,
        [
          join(root, 'watch.mjs'),
          root,
          join(__dirname, '../../../packages/next/dist/experimental/testing'),
        ],
        { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }
      )
      child.stdout!.on('data', (chunk) => (output += chunk))
      child.stderr!.on('data', (chunk) => (output += chunk))
      child.on('message', (message) => messages.push(message))
      closed = new Promise((resolve, reject) => {
        child!.once('error', reject)
        child!.once('close', (code, signal) => resolve({ code, signal }))
      })
      void closed.catch(() => {})
      const rows = async () =>
        (await readFile(marker, 'utf8'))
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      await retry(
        async () => {
          expect(
            (await rows()).filter((row) => row.type === 'ready-after')
          ).toHaveLength(1)
        },
        60000,
        500,
        'actual initial removal reporter readiness'
      )
      const added = join(root, 'added.case.mjs')
      await writeFile(added, "import{test}from'vitest';test('added',()=>{})\n")
      await retry(
        async () => {
          expect(
            (await rows()).filter((row) => row.type === 'ready-after')
          ).toHaveLength(2)
        },
        60000,
        500,
        'actual added reporter readiness'
      )
      await rm(added)
      expect(await joinClosed()).toEqual({ code: 1, signal: null })
      expect(await rows()).toEqual(
        JSON.parse(await readFile(join(source, 'pristine.json'), 'utf8'))
      )
      expect(messages).toEqual([
        {
          type: 'write-error',
          text: 'Test watch error: actual async removed rejection\n',
        },
        writerFails
          ? { type: 'thrown', message: 'Owned watch error writer failed.' }
          : { type: 'result', result: { status: 'failed' } },
      ])
    } catch (error) {
      console.error(output, messages)
      throw error
    } finally {
      try {
        if (child?.connected) child.send({ type: 'close' })
        try {
          await joinClosed()
        } finally {
          await killApp(child)
          await closed?.catch(() => {})
        }
      } finally {
        try {
          await rm(root, { recursive: true, force: true })
        } finally {
          if (outputRoot) await rm(outputRoot, { recursive: true, force: true })
        }
      }
    }
  },
  180000
)

it('retains exact selected declaration columns without artifact-call snapping', () => {
  const {
    mapTestDeclarationLocation,
  } = require('next/dist/experimental/testing/reporting/declaration-location')
  setBundlerFindSourceMapImplementation((file) =>
    file === 'file:///chunks/declaration.js'
      ? {
          version: 3,
          file,
          sources: ['file:///immutable/declaration.test.mjs'],
          sourcesContent: ['test("real", () => {})\n'],
          names: [],
          mappings: 'AAAI',
        }
      : undefined
  )
  const error = new Error('declaration')
  error.stack = 'Error: declaration\n    at create (/chunks/declaration.js:1:1)'
  const original = error.stack
  try {
    expect(
      mapTestDeclarationLocation(error, '/immutable/declaration.test.mjs')
    ).toEqual({ line: 1, column: 5 })
    expect(
      mapTestDeclarationLocation(error, '/immutable/other.test.mjs')
    ).toBeUndefined()
    expect(error.stack).toBe(original)
    let reads = 0
    Object.defineProperty(error, 'stack', {
      get() {
        reads++
        throw new Error('authored stack read')
      },
    })
    expect(
      mapTestDeclarationLocation(error, '/immutable/declaration.test.mjs')
    ).toBeUndefined()
    expect(reads).toBe(1)
  } finally {
    setBundlerFindSourceMapImplementation(() => undefined)
  }
})

it('maps actual Browser declaration frames including Gecko srcScript identities', () => {
  const {
    getClientDeclarationLocation,
  } = require('next/dist/experimental/testing/client/declaration-location')
  const frames: unknown[] = []
  const mapper = {
    mapLocation(frame: { file: string; line: number; column: number }) {
      frames.push(frame)
      if (frame.file !== 'http://localhost:1234/issued.js line 17 > srcScript')
        throw new Error('unselected frame')
      return { file: '/selected.test.mjs', line: 8, column: 5 }
    },
  }
  const error = new Error('declaration')
  error.stack =
    'Error\ninternal@http://localhost:1234/runtime.js:2:3\n@http://localhost:1234/issued.js line 17 > srcScript:4:9'
  expect(getClientDeclarationLocation(error, mapper)).toEqual({
    line: 8,
    column: 5,
  })
  expect(frames).toEqual([
    { file: 'http://localhost:1234/runtime.js', line: 2, column: 3 },
    {
      file: 'http://localhost:1234/issued.js line 17 > srcScript',
      line: 4,
      column: 9,
    },
  ])
  let reads = 0
  Object.defineProperty(error, 'stack', {
    get() {
      reads++
      return '    at declared (http://localhost:1234/issued.js line 17 > srcScript:4:9)'
    },
  })
  expect(getClientDeclarationLocation(error, mapper)).toEqual({
    line: 8,
    column: 5,
  })
  expect(reads).toBe(1)
})

it('publishes actual collection locations while retaining mutable in-realm Tasks', async () => {
  const { createCollector } = await import(
    'next/dist/experimental/testing/runner/collector'
  )
  const { runCollected } = await import(
    'next/dist/experimental/testing/runner/lifecycle'
  )
  const { captureReporterTaskTree, assertReporterTaskTree } = await import(
    'next/dist/experimental/testing/reporting/live-tasks'
  )
  const { createLiveReporterTaskStore } = await import(
    'next/dist/experimental/testing/reporting/custom-reporter-live-tasks'
  )
  const c = createCollector('location-file', {
    filePath: '/project/location.test.mjs',
    getTaskLocation: () => ({ line: 8, column: 5 }),
  })
  const raw = c.api.describe.fn.call(
    {
      concurrent: false,
      only: false,
      skip: false,
      todo: false,
      shuffle: false,
    },
    'located suite',
    {},
    () => {}
  )
  const task = raw.task('located case', {
    handler({ task }) {
      expect(task.location).toEqual({ line: 777, column: 5 })
      task.location!.line = 888
      task.location = { line: 999, column: 998 }
    },
  })
  expect(Object.getOwnPropertyDescriptor(task, 'location')).toEqual({
    value: { line: 8, column: 5 },
    enumerable: true,
    writable: true,
    configurable: true,
  })
  task.location!.line = 777
  c.api.test.skip('located skipped', () => {})
  c.api.test.todo('located todo')
  const store = createLiveReporterTaskStore('/project')
  const results = await runCollected(
    c.close(),
    {
      runId: 'location-run',
      filePath: '/project/location.test.mjs',
      signal: new AbortController().signal,
      onCollected(file) {
        store.update(captureReporterTaskTree(file))
      },
      onCaseResult(current) {
        store.update(captureReporterTaskTree(current.file), [current.id])
      },
    },
    () => {}
  )
  expect(results.errors).toEqual([])
  expect(results.cases.map((current) => current.location)).toEqual([
    { file: '/project/location.test.mjs', line: 777, column: 5 },
    { file: '/project/location.test.mjs', line: 8, column: 5 },
    { file: '/project/location.test.mjs', line: 8, column: 5 },
  ])
  expect(task.location).toEqual({ line: 999, column: 998 })
  const tree = captureReporterTaskTree(task.file)
  const assertTree: typeof assertReporterTaskTree = assertReporterTaskTree
  assertTree(tree, 'location-file')
  expect(tree).not.toHaveProperty('location')
  expect(tree.tasks![0].location).toEqual({ line: 8, column: 5 })
  expect(tree.tasks![0].tasks![0].location).toEqual({ line: 777, column: 5 })
  tree.tasks![0].tasks![0].location!.line = 123
  expect(
    captureReporterTaskTree(task.file).tasks![0].tasks![0].location
  ).toEqual({ line: 777, column: 5 })
  expect(
    [...store.get('location-file')!.children!.allTests()].map(
      (current) => current.location
    )
  ).toEqual([
    { line: 777, column: 5 },
    { line: 8, column: 5 },
    { line: 8, column: 5 },
  ])
  const invalid = structuredClone(tree)
  invalid.tasks![0].location!.column = 0
  expect(() => assertTree(invalid, 'location-file')).toThrow(
    'Invalid live reporter task graph'
  )
})

it('keeps declaration file identity internal and projects only JSON line and column', () => {
  const machine = createMachineReporter({
    projectDir: '/project',
    reporters: ['json'],
  })
  const emit = (event: object) =>
    machine.onEvent({ ...envelope, ...event } as ResultEvent)
  try {
    emit({ type: 'run-start' })
    emit({ type: 'file-start', entry })
    emit({
      type: 'case-end',
      ...result(0, 'passed'),
      location: { file: entry.file, line: 8, column: 5 },
    })
    emit({
      type: 'file-end',
      entryId: entry.id,
      status: 'passed',
      durationMs: 3,
    })
    emit({ type: 'run-end', status: 'passed', durationMs: 3 })
    const report = machine.getJson()
    expect(report.testResults[0].assertionResults[0].location).toEqual({
      line: 8,
      column: 5,
    })
    expect(
      report.next.events.find((event) => event.type === 'case-end')
    ).toMatchObject({ location: { file: entry.file, line: 8, column: 5 } })
  } finally {
    machine.dispose()
  }
})

it('captures producer-owned locations across reporting module instances', async () => {
  const { createCollector } = await import(
    'next/dist/experimental/testing/runner/collector'
  )
  const { runCollected } = await import(
    'next/dist/experimental/testing/runner/lifecycle'
  )
  const { getPublishedTaskLocation } = await import(
    'next/dist/experimental/testing/runner/tasks'
  )
  type LiveTasks =
    typeof import('next/dist/experimental/testing/reporting/live-tasks')
  type TaskUpdates =
    typeof import('next/dist/experimental/testing/reporting/task-updates')
  let capture!: LiveTasks['captureReporterTaskTree']
  let createUpdates!: TaskUpdates['createReporterTaskUpdates']
  jest.isolateModules(() => {
    capture =
      require('next/dist/experimental/testing/reporting/live-tasks').captureReporterTaskTree
    createUpdates =
      require('next/dist/experimental/testing/reporting/task-updates').createReporterTaskUpdates
  })
  const c = createCollector('producer-location-file', {
    filePath: '/project/producer-location.test.mjs',
    getTaskLocation: () => ({ line: 4, column: 7 }),
  })
  c.api.test('located case', ({ task }) => {
    expect(Reflect.set(task, 'location', { line: 999, column: 998 })).toBe(true)
  })
  const snapshots: import('next/dist/experimental/testing/reporting/live-tasks').ReporterTaskSnapshot[] =
    []
  const resolved: import('next/dist/experimental/testing/runner/tasks').Task[] =
    []
  const resolveLocation: typeof getPublishedTaskLocation = (task) => {
    resolved.push(task)
    return getPublishedTaskLocation(task)
  }
  const updates = createUpdates({
    getTaskLocation: resolveLocation,
    onUpdate(update) {
      snapshots.push(update.taskTree)
    },
  })
  try {
    const result = await runCollected(
      c.close(),
      {
        runId: 'producer-location-run',
        filePath: '/project/producer-location.test.mjs',
        signal: new AbortController().signal,
        onCollected(file) {
          snapshots.push(capture(file, undefined, resolveLocation))
          updates.collected(file)
        },
        onCaseResult(task, current) {
          updates.caseResult(task, current)
        },
        onSuiteEnd(_, task) {
          updates.suiteEnd(task)
        },
      },
      () => {}
    )
    await updates.finish()
    expect(result.errors).toEqual([])
    expect(result.cases[0].status).toBe('passed')
    expect(snapshots.length).toBeGreaterThan(2)
    expect(
      resolved.every(
        (task) => task === task.file || task.file.tasks.includes(task)
      )
    ).toBe(true)
    for (const snapshot of snapshots) {
      expect(snapshot).not.toHaveProperty('location')
      expect(snapshot.tasks![0].location).toEqual({ line: 4, column: 7 })
    }
    snapshots[0].tasks![0].location!.line = 123
    expect(snapshots.at(-1)!.tasks![0].location).toEqual({ line: 4, column: 7 })
  } finally {
    updates.dispose()
  }
})

it('retains exact Browser intrinsic raw declarations and the existing closed-scope checks', () => {
  const output = execFileSync(
    process.execPath,
    [join(__dirname, 'browser-declaration-scope.cjs')],
    {
      encoding: 'utf8',
      timeout: 5000,
    }
  )
  expect(JSON.parse(output)).toEqual({
    cases: 5,
    trace: ['raw', 1, 2, 3, 'child'],
    exactIntrinsicIdentity: true,
    realEachForAndSuite: true,
    privateClosedGetApplyHeld: true,
    frozenUnknownTargetGuarded: true,
    guardCalls: 11,
  })
})
