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
      emit({ type: 'case-start', ...result(0, 'passed'), entryId: selected.id })
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

  it('shows only supported watch status without keyboard hints', () => {
    expect(formatWatchStatus('passed')).toBe(
      ' PASS  Waiting for file changes...\n'
    )
    expect(formatWatchStatus('failed')).toBe(
      ' FAIL  Tests failed. Watching for file changes...\n'
    )
    expect(formatWatchStatus('failed', true)).toBe(
      '\u001b[1m\u001b[30m\u001b[41m FAIL \u001b[49m\u001b[39m\u001b[22m \u001b[31mTests failed. Watching for file changes...\u001b[39m\n'
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

  it('keeps repeats independent and uses retry indices rather than arrival order', () => {
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
      passed: 1,
      failed: 1,
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
