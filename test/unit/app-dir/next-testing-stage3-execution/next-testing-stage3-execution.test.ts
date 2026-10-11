import {
  assertCoverageCompletion,
  assertCoverageRequest,
  createCoverageAttemptTracker,
} from 'next/dist/experimental/testing/execution/coverage'
import { createCollector } from 'next/dist/experimental/testing/runner/collector'
import { runCollected } from 'next/dist/experimental/testing/runner/lifecycle'
import { createExecutionBrokerClient } from 'next/dist/experimental/testing/execution/broker'
import { executeWithEnvironment } from 'next/dist/experimental/testing/execution/execute'
import type {
  CompiledTestArtifact,
  ExecuteTestOptions,
} from 'next/dist/experimental/testing/contracts'
import type { ResultEvent } from 'next/dist/experimental/testing/reporting/events'

const artifact: CompiledTestArtifact = {
  version: 2,
  kind: 'node',
  entryId: 'entry',
  revision: 'revision',
  rootDir: '/artifact',
  entryPath: 'entry.js',
  files: ['entry.js'],
  diagnostics: [],
  profile: {
    id: 'unit',
    environment: 'node',
    mode: 'development',
    runtime: 'nodejs',
    bundler: 'turbopack',
  },
  coverage: { version: 1, scripts: [], sources: {} },
}
const request = {
  coverage: { version: 1 as const, kind: 'node-line' as const },
  onCoverage: async () => {},
}
const completion = {
  version: 1,
  runId: 'run',
  entryId: 'entry',
  revision: 'revision',
  complete: true,
  data: { version: 1, scripts: [] },
}
const executionOptions: ExecuteTestOptions = {
  runId: 'run',
  projectDir: '/project',
  entry: {
    id: artifact.entryId,
    file: '/project/spec.ts',
    profile: artifact.profile,
  },
  setupFiles: [],
  testTimeout: 1000,
  hookTimeout: 1000,
  fileTimeout: 1000,
  signal: new AbortController().signal,
  onEvent() {},
}
function caseEvent(
  type: 'case-start' | 'case-end',
  retry = 0,
  status = 'passed'
): ResultEvent {
  return {
    version: 1,
    runId: 'run',
    timestamp: 1,
    entryId: 'entry',
    revision: 'revision',
    type,
    caseId: 'case',
    name: 'case',
    attempt: { id: `attempt-${retry}`, retry, repeat: 0 },
    status,
    durationMs: 1,
    errors: [],
  } as ResultEvent
}

describe('coverage lifecycle admission and completion', () => {
  it('rejects coverage combined with snapshot writes before running a worker', async () => {
    await expect(
      executeWithEnvironment(
        artifact,
        { ...executionOptions, ...request, updateSnapshots: true },
        process.env
      )
    ).rejects.toThrow('Coverage and snapshot updates cannot run together')
  })
  it('rejects watch coverage without serializing a callback or starting a request', async () => {
    const send = jest.fn(async () => {})
    const client = createExecutionBrokerClient({ send })
    await expect(
      client.execute(artifact, { ...executionOptions, ...request })
    ).rejects.toThrow('Watch execution')
    expect(send).not.toHaveBeenCalled()
  })

  it('retains the development-only snapshot boundary for production artifacts', async () => {
    await expect(
      executeWithEnvironment(
        { ...artifact, profile: { ...artifact.profile, mode: 'production' } },
        { ...executionOptions, updateSnapshots: true },
        { ...process.env, NODE_ENV: 'production' }
      )
    ).rejects.toThrow('development Node or RSC')
  })

  it('requires an explicit supported request and awaited consumer', () => {
    expect(() => assertCoverageRequest(artifact, {})).not.toThrow()
    expect(() => assertCoverageRequest(artifact, request)).not.toThrow()
    expect(() =>
      assertCoverageRequest(artifact, { coverage: request.coverage })
    ).toThrow('consumer')
    expect(() =>
      assertCoverageRequest(artifact, { onCoverage: request.onCoverage })
    ).toThrow('requires a request')
    expect(() =>
      assertCoverageRequest({ ...artifact, coverage: undefined }, request)
    ).toThrow('metadata')
    expect(() =>
      assertCoverageRequest(
        { ...artifact, moduleMocking: { version: 1 } },
        request
      )
    ).toThrow('unmocked')
  })

  it.each(['production', 'browser', 'route', 'version'])(
    'rejects unsupported coverage %s before launch',
    (kind) => {
      const input = { ...artifact, profile: { ...artifact.profile } }
      const options: Pick<ExecuteTestOptions, 'coverage' | 'onCoverage'> = {
        ...request,
      }
      if (kind === 'production') input.profile.mode = 'production'
      if (kind === 'browser') input.profile.environment = 'browser'
      if (kind === 'route') input.profile.route = '/'
      if (kind === 'version')
        options.coverage = { ...request.coverage, version: 2 } as never
      expect(() => assertCoverageRequest(input, options)).toThrow(
        'development Node'
      )
    }
  )

  it.each([
    undefined,
    { ...completion, version: 2 },
    { ...completion, runId: 'other' },
    { ...completion, entryId: 'other' },
    { ...completion, revision: 'old' },
    { ...completion, complete: undefined },
    { ...completion, data: undefined },
    { ...completion, error: { message: 'ambiguous' } },
    { ...completion, complete: false, error: { message: 'ambiguous' } },
  ])('rejects absent, mismatched and malformed payload %j', (value) => {
    expect(() => assertCoverageCompletion(value, artifact, 'run')).toThrow()
  })

  it('accepts only a well formed matching completion or explicit failure', () => {
    expect(() =>
      assertCoverageCompletion(completion, artifact, 'run')
    ).not.toThrow()
    const { data: _data, ...identity } = completion
    expect(() =>
      assertCoverageCompletion(
        {
          ...identity,
          complete: false,
          error: {
            phase: 'cleanup',
            severity: 'error',
            message: 'cleanup failed',
          },
        },
        artifact,
        'run'
      )
    ).not.toThrow()
  })

  it('requires completion of every executed retry, retaining failed attempts', () => {
    const tracker = createCoverageAttemptTracker()
    tracker.observe(caseEvent('case-start'))
    tracker.observe(caseEvent('case-end', 0, 'failed'))
    tracker.observe(caseEvent('case-start', 1))
    expect(tracker.complete).toBe(false)
    tracker.observe(caseEvent('case-end', 1))
    expect(tracker.complete).toBe(true)
    expect(() => tracker.observe(caseEvent('case-end', 1))).toThrow('Duplicate')
  })

  it('rejects altered and unstarted attempt completions', () => {
    const tracker = createCoverageAttemptTracker()
    tracker.observe(caseEvent('case-start'))
    expect(() =>
      tracker.observe({
        ...caseEvent('case-end'),
        caseId: 'other',
      } as ResultEvent)
    ).toThrow('Mismatched')
    expect(() =>
      createCoverageAttemptTracker().observe(caseEvent('case-end'))
    ).toThrow('without a start')
  })

  it.each(['cancelled', 'cleanup', 'late'])(
    'vetoes complete coverage for %s',
    (failure) => {
      const tracker = createCoverageAttemptTracker()
      tracker.observe(caseEvent('case-start'))
      const event = caseEvent(
        'case-end',
        0,
        failure === 'cancelled' ? 'cancelled' : 'failed'
      )
      if (failure === 'cleanup' && event.type === 'case-end')
        event.errors.push({
          phase: 'cleanup',
          severity: 'error',
          message: 'cleanup failed',
        })
      tracker.observe(event)
      if (failure === 'late')
        tracker.observe({
          version: 1,
          runId: 'run',
          timestamp: 1,
          type: 'diagnostic',
          diagnostic: {
            phase: 'runtime',
            severity: 'error',
            message: 'late failure',
          },
        })
      expect(tracker.complete).toBe(false)
    }
  )
})

describe('runner interrupted execution evidence', () => {
  const options = () => ({ runId: 'run', signal: new AbortController().signal })
  it('does not mark an ordinary failing test or failed retry interrupted', async () => {
    const c = createCollector('file')
    let attempts = 0
    c.api.test('retry', { retry: 1 }, () => {
      if (++attempts === 1) throw new Error('first attempt')
    })
    c.api.test('ordinary failure', () => {
      throw new Error('assertion failure')
    })
    const result = await runCollected(c.close(), options(), () => {})
    expect(result.interrupted).toBe(false)
    expect(result.cases.map((item) => item.status)).toEqual([
      'failed',
      'passed',
      'failed',
    ])
  })

  it('marks a final timed-out attempt interrupted even with no following case', async () => {
    const c = createCollector('file')
    c.api.test('timeout', { timeout: 10 }, () => new Promise(() => {}))
    const result = await runCollected(c.close(), options(), () => {})
    expect(result.interrupted).toBe(true)
    expect(result.cases).toHaveLength(1)
    expect(result.cases[0].status).toBe('failed')
  })

  it('marks cancellation interrupted and preserves following-file isolation', async () => {
    const c = createCollector('cancelled')
    c.api.test('never started', () => {
      throw new Error('must not run')
    })
    const cancelled = await runCollected(
      c.close(),
      { ...options(), signal: AbortSignal.abort() },
      () => {}
    )
    expect(cancelled.interrupted).toBe(true)
    const next = createCollector('following')
    next.api.test('clean', () => {})
    const clean = await runCollected(next.close(), options(), () => {})
    expect(clean.interrupted).toBe(false)
    expect(clean.cases[0].status).toBe('passed')
  })
})
