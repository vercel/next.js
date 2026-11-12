/* eslint-disable no-empty-pattern -- Fixture callbacks require explicit destructuring. */
import {
  initializeModuleCache,
  resetModules,
} from 'next/dist/experimental/testing/mocking/module-cache'
import { createModuleImportTracker } from 'next/dist/experimental/testing/runner/imports'
import { createAsyncScope } from 'next/dist/experimental/testing/runner/async-context'
import { createCollector } from 'next/dist/experimental/testing/runner/collector'
import { runCollected } from 'next/dist/experimental/testing/runner/lifecycle'
import type { Task } from 'next/dist/experimental/testing/runner/tasks'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { runNodeHelper } from '../../lib/next-testing-node-helpers'
import { join } from 'node:path'

// Semantic reference: Vitest checkout 0780a8e5b7967a4168173599e9c74fb79aab2483,
// packages/vitest/src/runtime/runner/{hooks,run,fixture}.ts. This corpus exercises
// Next's collector directly; it does not establish compiler/runtime integration.
const options = () => ({ runId: 'run', signal: new AbortController().signal })
const run = (collector: ReturnType<typeof createCollector>) =>
  runCollected(collector.close(), options(), () => {})

async function runFreshProcessTest(
  argv: readonly string[],
  {
    evidenceEnv,
    prefix,
    tests,
    receiptFile = 'original-child.json',
    saveErrorMessage,
  }: {
    evidenceEnv: string
    prefix: string
    tests: number
    receiptFile?: string
    saveErrorMessage?: string
  }
) {
  const fs = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const base = process.env[evidenceEnv] ?? tmpdir()
  await fs.mkdir(base, { recursive: true })
  const evidence = await fs.mkdtemp(join(base, prefix))
  const pending = runNodeHelper(argv, { timeout: 20000 })
  const child = pending.child
  const closed = new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  let stdout = ''
  let stderr = ''
  let failure: unknown
  try {
    try {
      const result = await pending
      stdout = result.stdout
      stderr = result.stderr
    } catch (error) {
      failure = error
      const raw = error as { stdout?: string; stderr?: string }
      stdout = raw.stdout ?? ''
      stderr = raw.stderr ?? ''
    }
    const actualClose = await closed
    const writes = [
      () => fs.writeFile(join(evidence, 'stdout.log'), stdout),
      () => fs.writeFile(join(evidence, 'stderr.log'), stderr),
      () =>
        fs.writeFile(
          join(evidence, receiptFile),
          JSON.stringify(
            {
              pid: child.pid,
              argv: [process.execPath, ...argv],
              actualClose,
              stdoutClosed: child.stdout?.destroyed,
              stderrClosed: child.stderr?.destroyed,
              error: failure === undefined ? null : String(failure),
            },
            null,
            2
          )
        ),
    ]
    if (saveErrorMessage) {
      const saved = await Promise.allSettled(writes.map((write) => write()))
      const errors = saved
        .filter(
          (row): row is PromiseRejectedResult => row.status === 'rejected'
        )
        .map((row) => row.reason)
      if (errors.length) throw new AggregateError(errors, saveErrorMessage)
    } else {
      for (const write of writes) await write()
    }
    if (failure !== undefined) throw failure
    expect(actualClose).toEqual({ code: 0, signal: null })
    expect(stdout).toContain('# tests ' + tests)
    expect(stdout).toContain('# pass ' + tests)
    expect(stdout).toContain('# fail 0')
  } finally {
    if (!process.env[evidenceEnv])
      await fs.rm(evidence, { recursive: true, force: true })
  }
}

// These controls validate the cache owner and import tracker. The unchanged public
// module-reset acceptance fixture separately requires the native emitted graph.
describe('compiler-owned actual module cache reset', () => {
  function context() {
    return Object.assign(Object.create(null), {
      c: new Map([
        ['subject', { exports: { count: 1 } }],
        ['dependency', { exports: { count: 1 } }],
        ['facade', { exports: { identity: 'protected' } }],
        ['bootstrap', { exports: { identity: 'protected' } }],
      ]),
      M: new Map(
        ['subject', 'dependency', 'facade', 'bootstrap'].map((id) => [
          id,
          () => {},
        ])
      ),
      m: { id: 'bootstrap' },
    })
  }
  const manifest = {
    version: 1 as const,
    resettable: ['subject', 'dependency'],
    protected: ['facade'],
  }

  it('evicts only authorized evaluated records while retaining factories and held namespace objects', () => {
    const runtime = context()
    const held = runtime.c.get('subject')!
    const factories = [...runtime.M]
    const retire = jest.fn()
    const owner = initializeModuleCache(runtime, manifest, retire)
    try {
      resetModules()
      expect([...runtime.c.keys()]).toEqual(['facade', 'bootstrap'])
      expect([...runtime.M]).toEqual(factories)
      expect(held.exports.count).toBe(1)
      expect(retire).toHaveBeenCalledWith([held, { exports: { count: 1 } }])
      // The retained factory table, rather than a name/value cache, remains owned
      // by the actual compiled runtime; absent evaluations need no deletion.
      resetModules()
      expect(retire).toHaveBeenLastCalledWith([])
    } finally {
      owner.dispose()
    }
    expect(() => resetModules()).toThrow('active compiler-owned module cache')
  })

  it('validates the complete reset before mutation or an ownership handoff', () => {
    const runtime = context()
    const retire = jest.fn()
    const owner = initializeModuleCache(runtime, manifest, retire)
    try {
      runtime.M.delete('dependency')
      expect(() => resetModules()).toThrow('retained native factory')
      expect([...runtime.c.keys()]).toEqual([
        'subject',
        'dependency',
        'facade',
        'bootstrap',
      ])
      expect(retire).not.toHaveBeenCalled()
      runtime.M.set('dependency', () => {})
      retire.mockImplementationOnce(() => {
        throw new Error('tracker closed')
      })
      expect(() => resetModules()).toThrow('tracker closed')
      expect(runtime.c.has('subject')).toBe(true)
      const retained = runtime.c
      runtime.c = new Map(retained)
      expect(() => resetModules()).toThrow('owner changed after initialization')
      expect(retained.has('subject')).toBe(true)
    } finally {
      owner.dispose()
    }
    for (const resettable of [
      ['facade'],
      ['bootstrap'],
      ['subject', 'subject'],
    ])
      expect(() =>
        initializeModuleCache(runtime, { ...manifest, resettable }, () => {})
      ).toThrow('protected runtime identities')
  })

  it('rejects a closed originating scope without clearing a later owner cache', async () => {
    const late: Error[] = []
    const scope = createAsyncScope(
      { kind: 'collection', context: { id: 'first', name: 'first' } },
      (error) => late.push(error)
    )
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const continuation = scope.run(() => gate.then(() => resetModules()))
    const first = initializeModuleCache(context(), manifest, () => {})
    first.dispose()
    scope.close()
    const next = context()
    const second = initializeModuleCache(next, manifest, () => {})
    try {
      release()
      await expect(continuation).rejects.toThrow(
        'closed collection scope "first"'
      )
      expect(late).toHaveLength(1)
      expect(next.c.has('subject')).toBe(true)
    } finally {
      second.dispose()
    }
  })

  it('keeps evicted top-level-await evaluations visible until their actual settlement', async () => {
    const runtime = context()
    // Each file gets its own actual runtime prototype; no global timer is used
    // to decide whether the pending evaluation settled.
    Object.setPrototypeOf(runtime, {})
    let complete!: () => void
    const pending = new Promise<void>((resolve) => {
      complete = resolve
    })
    let observe!: () => void
    const observed = new Promise<void>((resolve) => {
      observe = resolve
    })
    const getter = () => {
      observe()
      return pending
    }
    const module = Object.defineProperties(
      {},
      { exports: { get: getter }, namespaceObject: { get: getter } }
    )
    runtime.c.set('subject', module)
    const tracker = createModuleImportTracker(runtime)
    const owner = initializeModuleCache(
      runtime,
      manifest,
      tracker.retireModules
    )
    try {
      resetModules()
      let settled = false
      const waiting = tracker.waitForImports().then(() => {
        settled = true
      })
      await observed
      expect(settled).toBe(false)
      expect(runtime.c.has('subject')).toBe(false)
      complete()
      await waiting
      expect(settled).toBe(true)
    } finally {
      owner.dispose()
      tracker.dispose()
    }
  })

  it('cancels settling of an evicted pending evaluation on real tracker disposal', async () => {
    const runtime = context()
    Object.setPrototypeOf(runtime, {})
    const pending = new Promise(() => {})
    const getter = () => pending
    runtime.c.set(
      'subject',
      Object.defineProperties(
        {},
        { exports: { get: getter }, namespaceObject: { get: getter } }
      )
    )
    const tracker = createModuleImportTracker(runtime)
    const owner = initializeModuleCache(
      runtime,
      manifest,
      tracker.retireModules
    )
    try {
      resetModules()
      const waiting = tracker.waitForImports()
      tracker.dispose()
      await expect(waiting).rejects.toThrow('cancelled during file cleanup')
    } finally {
      owner.dispose()
      tracker.dispose()
    }
  })
})

it('records supplied tasks across completion with resolved artifact identity and retained files', async () => {
  const fs = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const {
    recordArtifact,
  } = require('next/dist/experimental/testing/runner/artifacts')
  const directory = await fs.mkdtemp(join(tmpdir(), 'next-artifact-data-'))
  const c = createCollector('artifacts')
  const published: any[] = []
  let held: any
  try {
    await fs.writeFile(join(directory, 'source.txt'), 'artifact bytes')
    c.api.test('first', async ({ task }) => {
      held = task
      const input = {
        type: 'probe:data',
        data: { value: 7 },
        attachments: [
          { body: new Uint8Array([0, 255, 65]) },
          { body: '', path: 'source.txt' },
        ],
      }
      const pending = recordArtifact(task, input)
      expect((input as any).location).toEqual({
        file: '/project/artifacts.test.ts',
        line: 4,
        column: 2,
      })
      expect(input.attachments[0].body).toBe('AP9B')
      expect(task.artifacts).toHaveLength(0)
      const value = await pending
      expect(value).not.toBe(input)
      expect(value.data).not.toBe(input.data)
      expect(value).toBe(task.artifacts[0])
      expect(input.attachments[1].path).toBe('source.txt')
      expect(await fs.readFile(value.attachments[1].path, 'utf8')).toBe(
        'artifact bytes'
      )
      expect(value.attachments[1]).toMatchObject({
        body: '',
        bodyEncoding: 'base64',
        contentType: 'text/plain',
      })
      const annotation = {
        type: 'internal:annotation',
        annotation: { message: 'raw', type: 'notice' },
      }
      expect(await recordArtifact(task, annotation)).toBe(annotation)
      expect((annotation as any).location).toBe(
        (annotation.annotation as any).location
      )
      expect(task.annotations).toEqual([])
      expect(task.artifacts).toHaveLength(1)
    })
    c.api.test('second', async ({ task }) => {
      const value = await recordArtifact(held, {
        type: 'probe:late',
        data: 'from second',
      })
      expect(held.result.state).toBe('pass')
      expect(held.artifacts[1]).toBe(value)
      expect(task.artifacts).toEqual([])
    })
    c.api.afterAll(async () => {
      await recordArtifact(held, { type: 'probe:teardown', data: true })
    })
    const result = await runCollected(
      c.close(),
      {
        ...options(),
        projectDir: directory,
        getAnnotationLocation: () => ({
          file: '/project/artifacts.test.ts',
          line: 4,
          column: 2,
        }),
        onArtifact(context, artifact) {
          published.push({ testId: context.testId, artifact })
        },
      },
      () => {}
    )
    expect(result.cases.map((test) => test.status)).toEqual([
      'passed',
      'passed',
    ])
    expect(result.errors).toEqual([])
    expect(published.map((row) => row.testId)).toEqual(
      Array(3).fill('artifacts/0')
    )
    expect(published.map((row) => row.artifact)).toEqual(held.artifacts)
    await expect(
      recordArtifact(held, { type: 'probe:closed' })
    ).rejects.toThrow("doesn't support test artifacts")
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

it('preserves recording rejection identity without appending or failing a handled test', async () => {
  const {
    recordArtifact,
  } = require('next/dist/experimental/testing/runner/artifacts')
  const c = createCollector('artifact-rejection')
  const failure = new Error('artifact sink failed')
  c.api.test('handles rejection', async ({ task }) => {
    await expect(recordArtifact(task, { type: 'probe:reject' })).rejects.toBe(
      failure
    )
    expect(task.artifacts).toEqual([])
    for (const attachment of [
      {},
      { body: 'body', path: 'path' },
      { path: 'path', bodyEncoding: 'utf-8' },
    ])
      await expect(
        recordArtifact(task, {
          type: 'probe:invalid',
          attachments: [attachment],
        })
      ).rejects.toBeInstanceOf(TypeError)
  })
  const result = await runCollected(
    c.close(),
    {
      ...options(),
      onArtifact() {
        throw failure
      },
    },
    () => {}
  )
  expect(result.cases.map((test) => test.status)).toEqual(['passed'])
  expect(result.errors).toEqual([])
})

it('resolves Node artifact attachment paths from cwd without an explicit project directory', async () => {
  const fs = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { relative } = await import('node:path')
  const {
    recordArtifact,
  } = require('next/dist/experimental/testing/runner/artifacts')
  const directory = await fs.mkdtemp(join(tmpdir(), 'next-artifact-cwd-'))
  const source = join(directory, 'source.txt')
  const c = createCollector('artifact-cwd')
  try {
    await fs.writeFile(source, 'cwd artifact bytes')
    c.api.test('uses the ordinary cwd path fallback', async ({ task }) => {
      const artifact = await recordArtifact(task, {
        type: 'probe:cwd',
        attachments: [{ path: relative(process.cwd(), source) }],
      })
      expect(await fs.readFile(artifact.attachments[0].path, 'utf8')).toBe(
        'cwd artifact bytes'
      )
      expect(
        artifact.attachments[0].path.startsWith(join(directory, 'retained'))
      ).toBe(true)
      expect(task.artifacts[0]).toBe(artifact)
    })
    const result = await runCollected(
      c.close(),
      {
        ...options(),
        attachmentsDir: join(directory, 'retained'),
      },
      () => {}
    )
    expect(result.cases.map((test) => test.status)).toEqual(['passed'])
    expect(result.errors).toEqual([])
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

it('preserves the pinned zero-argument public next-timer surface', async () => {
  type PublicVi = typeof import('next/dist/experimental/testing/vitest').vi
  const zeroArgumentSurface: [
    Parameters<PublicVi['advanceTimersToNextTimer']> extends [] ? true : false,
    Parameters<PublicVi['advanceTimersToNextTimerAsync']> extends []
      ? true
      : false,
  ] = [true, true]
  expect(zeroArgumentSurface).toEqual([true, true])
  await runFreshProcessTest(
    ['--test-reporter=tap', join(__dirname, 'timer-next-step-api.cjs')],
    {
      evidenceEnv: 'NEXT_TESTING_NEXT_TIMER_EVIDENCE',
      prefix: 'next-public-next-timer-',
      tests: 1,
      saveErrorMessage: 'Could not retain next-timer child output',
    }
  )
}, 30000)

it('injects fixture values at registration with nullish fallback and lazy cleanup', async () => {
  const data = { label: 'provided' }
  const provided: Record<string, unknown> = {
    value: 'provided',
    zero: 0,
    disabled: false,
    empty: '',
    nullable: null,
    data,
    factory: data,
  }
  const reads: string[] = []
  const trace: string[] = []
  const c = createCollector('injected', {
    injectValue(name) {
      reads.push(name)
      return provided[name]
    },
  })
  const test = c.api.test.extend<{
    value: string
    zero: number
    disabled: boolean
    empty: string
    nullable: string
    missing: string
    data: typeof data
    factory: typeof data
    fallback: string
    derived: string
  }>({
    value: ['default', { injected: true }],
    zero: [99, { injected: true }],
    disabled: [true, { injected: true }],
    empty: ['default', { injected: true }],
    nullable: ['null-default', { injected: true }],
    missing: ['missing-default', { injected: true }],
    data: [{ label: 'default' }, { injected: true }],
    factory: [
      async ({}, provide) => {
        trace.push('provided factory ran')
        await provide(data)
      },
      { injected: true },
    ],
    fallback: [
      async ({}, provide) => {
        trace.push('setup')
        await provide('fallback')
        trace.push('cleanup')
      },
      { injected: true },
    ],
    derived: async ({ value, fallback }, provide) => {
      await provide(value + '/' + fallback)
    },
  })
  provided.value = 'changed after registration'
  test('consumer', ({
    value,
    zero,
    disabled,
    empty,
    nullable,
    missing,
    data: actual,
    factory,
    derived,
  }) => {
    expect({
      value,
      zero,
      disabled,
      empty,
      nullable,
      missing,
      derived,
    }).toEqual({
      value: 'provided',
      zero: 0,
      disabled: false,
      empty: '',
      nullable: 'null-default',
      missing: 'missing-default',
      derived: 'provided/fallback',
    })
    expect(actual).toBe(data)
    expect(factory).toBe(data)
    expect(trace).toEqual(['setup'])
  })
  c.api.afterAll(() => {
    expect(trace).toEqual(['setup', 'cleanup'])
  })
  const result = await run(c)
  expect(result.cases.map(({ status }) => status)).toEqual(['passed'])
  expect(result.errors).toEqual([])
  expect(reads).toEqual([
    'value',
    'zero',
    'disabled',
    'empty',
    'nullable',
    'missing',
    'data',
    'factory',
    'fallback',
  ])
})

it('preserves plain and explicit fixture overrides and typed injected builder options', async () => {
  const c = createCollector('injected-overrides', {
    injectValue: () => 'provided',
  })
  const base = c.api.test.extend<{ value: string }>({
    value: ['default', { injected: true }],
  })
  const plain = base.extend({ value: 'plain' })
  const enabled = base.extend({
    value: ['enabled-default', { injected: true }],
  })
  const disabled = base.extend({
    value: ['disabled-default', { injected: false }],
  })
  plain('plain', ({ value }) => {
    const exact: string = value
    expect(exact).toBe('plain')
  })
  enabled('enabled', ({ value }) => expect(value).toBe('provided'))
  disabled('disabled', ({ value }) => expect(value).toBe('disabled-default'))
  c.api.describe('override', () => {
    base.override('value', { injected: true }, 'override-default')
    base('explicit override', ({ value }) => expect(value).toBe('provided'))
  })
  c.api.describe('plain override', () => {
    base.override('value', 'plain-override')
    base('plain override', ({ value }) => expect(value).toBe('plain-override'))
  })
  const file = c.api.test.extend(
    'file',
    { scope: 'file', injected: true },
    'file-default'
  )
  file('file options', ({ file }) => {
    const exact: string = file
    expect(exact).toBe('provided')
  })
  if (false) {
    // @ts-expect-error injected is a boolean in the public fixture options.
    c.api.test.extend('invalid', { injected: 'yes' }, 1)
  }
  await c.settle()
  const result = await run(c)
  expect(result.cases.map(({ status }) => status)).toEqual(
    Array(6).fill('passed')
  )
  expect(result.errors).toEqual([])
})

it('collects tagged each and for tables with fixture context and stable public names', async () => {
  const collector = createCollector('tagged')
  const rows: unknown[] = []
  const { test, describe } = collector.api
  test.each`
    left | right | total
    ${1} | ${2}  | ${3}
    ${2} | ${5}  | ${7}
  `('adds $left and $right', ({ left, right, total }) => {
    expect(left + right).toBe(total)
    rows.push({ api: 'test.each', left, right, total })
  })
  const fixtureTest = test.extend<{ tone: string }>({ tone: 'fixture' })
  fixtureTest.for`label | value
    ${'alpha'} | ${3}
    ${'beta'} | ${6}
  `('$label is $value', { retry: 0 }, ({ label, value }, { tone, signal }) => {
    expect(signal.aborted).toBe(false)
    rows.push({ api: 'test.for', label, value, tone })
  })
  describe.each`
    label           | value
    ${'each-suite'} | ${9}
  `('$label', ({ label, value }) => {
    test('records the suite table row', () => {
      rows.push({ api: 'describe.each', label, value })
    })
  })
  describe.for`label | value
    ${'for-suite'} | ${12}
  `('$label', { retry: 0 }, ({ label, value }) => {
    test('records the for suite table row', () => {
      rows.push({ api: 'describe.for', label, value })
    })
  })
  await collector.settle()
  const result = await run(collector)
  expect(result.cases.map(({ name, status }) => [name, status])).toEqual([
    ['adds 1 and 2', 'passed'],
    ['adds 2 and 5', 'passed'],
    ['alpha is 3', 'passed'],
    ['beta is 6', 'passed'],
    ['each-suite > records the suite table row', 'passed'],
    ['for-suite > records the for suite table row', 'passed'],
  ])
  expect(rows).toEqual([
    { api: 'test.each', left: 1, right: 2, total: 3 },
    { api: 'test.each', left: 2, right: 5, total: 7 },
    { api: 'test.for', label: 'alpha', value: 3, tone: 'fixture' },
    { api: 'test.for', label: 'beta', value: 6, tone: 'fixture' },
    { api: 'describe.each', label: 'each-suite', value: 9 },
    { api: 'describe.for', label: 'for-suite', value: 12 },
  ])
})

it('preserves object-prototype fixture names across extensions and dependencies', async () => {
  const c = createCollector('file')
  const events: unknown[] = []
  const named = c.api.test.extend<{
    toString: string
    constructor: { tag: string }
    hasOwnProperty: number
    __proto__: { count: number }
  }>({
    toString: 'text',
    constructor: { tag: 'base' },
    hasOwnProperty: 3,
    ['__proto__']: { count: 5 },
  })
  named(
    'static fixture names',
    ({ toString, constructor, hasOwnProperty, __proto__ }) => {
      expect([
        toString,
        constructor.tag,
        hasOwnProperty,
        __proto__.count,
      ]).toEqual(['text', 'base', 3, 5])
      events.push([
        'static',
        toString,
        constructor.tag,
        hasOwnProperty,
        __proto__.count,
      ])
    }
  )
  const factories = named
    .extend<{ toString: string }>({
      toString: async ({ toString, constructor }, provide) => {
        events.push(['factory+', toString, constructor.tag])
        await provide(`${toString}:${constructor.tag}`)
        events.push(['factory-'])
      },
    })
    .extend(
      'hasOwnProperty',
      async ({ __proto__, hasOwnProperty }, { onCleanup }) => {
        events.push(['builder+', __proto__.count, hasOwnProperty])
        onCleanup(() => {
          events.push(['builder-'])
        })
        return __proto__.count + hasOwnProperty
      }
    )
  factories('factory dependencies', ({ toString, hasOwnProperty }) => {
    expect([toString, hasOwnProperty]).toEqual(['text:base', 8])
    events.push(['factory body', toString, hasOwnProperty])
  })
  c.api.describe('suite override', () => {
    factories.override('constructor', { tag: 'nested' })
    factories.override('__proto__', { count: 7 })
    factories('overridden dependencies', ({ toString, hasOwnProperty }) => {
      expect([toString, hasOwnProperty]).toEqual(['text:nested', 10])
      events.push(['override body', toString, hasOwnProperty])
    })
  })
  factories('sibling dependencies', ({ toString, hasOwnProperty }) => {
    expect([toString, hasOwnProperty]).toEqual(['text:base', 8])
    events.push(['sibling body', toString, hasOwnProperty])
  })

  await c.settle()
  const result = await run(c)
  expect(result.errors).toEqual([])
  expect(result.cases.map((test) => test.status)).toEqual(
    Array(4).fill('passed')
  )
  expect(events).toEqual([
    ['static', 'text', 'base', 3, 5],
    ['factory+', 'text', 'base'],
    ['builder+', 5, 3],
    ['factory body', 'text:base', 8],
    ['builder-'],
    ['factory-'],
    ['factory+', 'text', 'nested'],
    ['builder+', 7, 3],
    ['override body', 'text:nested', 10],
    ['builder-'],
    ['factory-'],
    ['factory+', 'text', 'base'],
    ['builder+', 5, 3],
    ['sibling body', 'text:base', 8],
    ['builder-'],
    ['factory-'],
  ])
})

it.each(['case', 'suite'])(
  'retains enqueue-time asynchronous ancestry and FIFO slots for queued %s work',
  async (kind) => {
    const { getOriginatingHook, getOriginatingScopeAncestors } = await import(
      'next/dist/experimental/testing/runner/async-context'
    )
    const deferred = () => {
      let resolve!: () => void
      const promise = new Promise<void>((done) => {
        resolve = done
      })
      return { promise, resolve }
    }
    const leftEntered = deferred()
    const rightSetup = deferred()
    const rightEntered = deferred()
    const releaseLeft = deferred()
    const releaseRight = deferred()
    const c = createCollector('queued-owners')
    const hookIds = new Map<string, string>()
    const entries: string[] = []
    const origins: {
      name: string
      owner: string
      ancestors: readonly string[]
    }[] = []
    let leftCount = 0
    let rightCount = 0
    let active = 0
    let maximum = 0
    c.api.aroundAll(async (execute) => {
      hookIds.set('parent', getOriginatingHook()!.id)
      await execute()
    })
    const body = (name: string, owner: string) => async () => {
      entries.push(name)
      origins.push({ name, owner, ancestors: getOriginatingScopeAncestors() })
      active++
      maximum = Math.max(maximum, active)
      try {
        if (name.startsWith('left')) {
          if (++leftCount === 2) leftEntered.resolve()
          await releaseLeft.promise
        } else {
          if (++rightCount === 2) rightEntered.resolve()
          await releaseRight.promise
        }
      } finally {
        active--
      }
    }
    const suite = (name: string, cases: string[]) => {
      c.api.describe.concurrent(name, () => {
        c.api.aroundAll(async (execute) => {
          hookIds.set(name, getOriginatingHook()!.id)
          await execute()
        })
        if (kind === 'case' && name === 'right')
          c.api.beforeAll(async () => {
            await leftEntered.promise
            rightSetup.resolve()
          })
        for (const nameOfCase of cases)
          c.api.test.concurrent(nameOfCase, body(nameOfCase, name))
      })
    }
    if (kind === 'case') {
      suite('left', ['left first', 'left second'])
      suite('right', ['right first', 'right second'])
    } else {
      for (const name of [
        'left first',
        'left second',
        'right first',
        'right second',
      ])
        suite(name, [name])
    }
    await c.settle()
    const running = runCollected(
      c.close(),
      { ...options(), maxConcurrency: 2 },
      () => {}
    )
    try {
      await leftEntered.promise
      if (kind === 'case') await rightSetup.promise
      // Let the right declarations reach their occupied FIFO queue, rather
      // than relying on a wall-clock delay or on the release callback's owner.
      await new Promise<void>(setImmediate)
      expect(entries).toEqual(['left first', 'left second'])
      releaseLeft.resolve()
      await rightEntered.promise
      expect(entries).toEqual([
        'left first',
        'left second',
        'right first',
        'right second',
      ])
      expect(maximum).toBe(2)
      for (const origin of origins.filter(({ name }) =>
        name.startsWith('right')
      )) {
        expect(origin.ancestors).toContain(hookIds.get(origin.owner))
        expect(origin.ancestors).toContain(hookIds.get('parent'))
        for (const [name, id] of hookIds)
          if (name.startsWith('left'))
            expect(origin.ancestors).not.toContain(id)
      }
    } finally {
      releaseLeft.resolve()
      releaseRight.resolve()
      await running
    }
    const result = await running
    expect(result.errors).toEqual([])
    expect(result.cases.map(({ status }) => status)).toEqual([
      'passed',
      'passed',
      'passed',
      'passed',
    ])
    expect(active).toBe(0)
  }
)

it.each(['body', 'setup'])(
  'aborts only the attempt owning a %s deadline while retaining sibling cleanup and unopened-work fences',
  async (phase) => {
    const c = createCollector('timeout-owners')
    let releaseSibling!: () => void
    const timeoutObserved = new Promise<void>((resolve) => {
      releaseSibling = resolve
    })
    const healthySignals: boolean[] = []
    const ownSignals: boolean[] = []
    const fixtures: string[] = []
    const owned = c.api.test.extend({
      token: async ({ task }, provide) => {
        fixtures.push('start ' + task.name)
        await provide(task.id)
        fixtures.push('finish ' + task.name)
      },
    })
    const waitForAbort = (signal: AbortSignal) =>
      new Promise<void>((resolve) => {
        signal.addEventListener(
          'abort',
          () => {
            releaseSibling()
            resolve()
          },
          { once: true }
        )
      })
    const observed = (name: string, signal: AbortSignal) => {
      if (name === 'healthy') healthySignals.push(signal.aborted)
      if (name === 'timeout') ownSignals.push(signal.aborted)
    }
    owned.aroundEach(async (execute, { task, token, signal }) => {
      expect(token).toBe(task.id)
      await execute()
      observed(task.name, signal)
    })
    owned.beforeEach(({ task, signal, onTestFinished }) => {
      onTestFinished(({ signal }) => observed(task.name, signal))
      if (phase === 'setup' && task.name === 'timeout')
        return waitForAbort(signal)
    }, 100)
    owned.afterEach(({ task, signal }) => observed(task.name, signal))
    owned.concurrent('timeout', { timeout: 100 }, async ({ signal }) => {
      if (phase !== 'body')
        throw new Error('a timed-out setup must not enter its body')
      await waitForAbort(signal)
    })
    owned.concurrent('healthy', async ({ signal }) => {
      await timeoutObserved
      healthySignals.push(signal.aborted)
    })
    owned('unopened tail', () => {})
    const result = await runCollected(
      c.close(),
      { ...options(), maxConcurrency: 2 },
      () => {}
    )
    expect(healthySignals).toEqual([false, false, false, false])
    expect(ownSignals).toEqual([true, true, true])
    expect(
      Object.fromEntries(result.cases.map(({ name, status }) => [name, status]))
    ).toEqual({
      timeout: 'failed',
      healthy: 'passed',
      'unopened tail': phase === 'body' ? 'passed' : 'cancelled',
    })
    expect(
      result.cases
        .find(({ name }) => name === 'timeout')!
        .errors.map(({ phase }) => phase)
    ).toEqual([phase === 'body' ? 'test' : 'beforeEach'])
    expect(result.cases.find(({ name }) => name === 'healthy')!.errors).toEqual(
      []
    )
    expect(
      fixtures.filter((event) => event.startsWith('start ')).sort()
    ).toEqual(
      fixtures
        .filter((event) => event.startsWith('finish '))
        .map((event) => event.replace('finish ', 'start '))
        .sort()
    )
    expect(result.interrupted).toBe(true)
  }
)

it.each(['explicit', 'runner', 'collection'] as const)(
  'reports the effective %s body timeout at its captured declaration while retaining settlement fences',
  async (source) => {
    const duration = { explicit: 5, runner: 7, collection: 9 }[source]
    const c = createCollector('body-timeout-origin', {
      getRuntimeConfig: () =>
        source === 'collection' ? { testTimeout: duration } : {},
    })
    const cleanup: string[] = []
    let taskKeys: string[] = []
    function registerTimedCase() {
      c.api.test(
        'deadline',
        source === 'explicit' ? { timeout: duration } : {},
        async ({ signal, task, onTestFinished }) => {
          taskKeys = Object.keys(task)
          onTestFinished(() => {
            cleanup.push('finished')
          })
          await new Promise<void>((resolve) =>
            signal.addEventListener(
              'abort',
              () => {
                cleanup.push('settled')
                resolve()
              },
              { once: true }
            )
          )
        }
      )
    }
    registerTimedCase()
    c.api.test('following', () => {
      cleanup.push('following')
    })
    const declaration = c.root.children[0]
    const descriptor = Object.getOwnPropertyDescriptor(
      declaration,
      'registrationError'
    )
    expect(descriptor).toMatchObject({ enumerable: false, writable: false })
    const result = await runCollected(
      c.close(),
      { ...options(), testTimeout: source === 'runner' ? duration : 100 },
      () => {}
    )
    expect(result.cases.map(({ status }) => status)).toEqual([
      'failed',
      'passed',
    ])
    expect(cleanup).toEqual(['settled', 'finished', 'following'])
    expect(result.interrupted).toBe(true)
    const error = result.cases[0].errors[0].error as Error
    const message = `Test timed out in ${duration}ms.\nIf this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".`
    expect(error.name).toBe('Error')
    expect(error.message).toBe(message)
    expect(error.stack).toContain(`Error: ${message}\n`)
    expect(error.stack).toContain('registerTimedCase')
    expect(error.stack).not.toContain('Timeout.<anonymous>')
    expect(error).not.toHaveProperty('cause')
    expect(taskKeys).not.toContain('registrationError')
  }
)

it('preserves a non-body hook deadline diagnostic and unopened-work poisoning', async () => {
  const c = createCollector('hook-timeout-origin')
  const cleanup: string[] = []
  c.api.beforeEach(({ signal }) => {
    return new Promise<void>((resolve) =>
      signal.addEventListener(
        'abort',
        () => {
          cleanup.push('settled')
          resolve()
        },
        { once: true }
      )
    )
  }, 5)
  c.api.test('blocked', () => {
    throw new Error('a timed-out hook must not enter its body')
  })
  c.api.test('unopened', () => {})
  const result = await run(c)
  expect(result.cases.map(({ status }) => status)).toEqual([
    'failed',
    'cancelled',
  ])
  expect(cleanup).toEqual(['settled'])
  expect(result.interrupted).toBe(true)
  expect(result.cases[0].errors).toHaveLength(1)
  expect(result.cases[0].errors[0].phase).toBe('beforeEach')
  const error = result.cases[0].errors[0].error as Error
  expect(error.message).toBe(
    'Hook timed out in 5ms.\nIf this is a long-running hook, pass a timeout value as the last argument or configure it globally with "hookTimeout".'
  )
  expect(error.stack).toContain('next-testing-lifecycle.test.ts')
  expect(error.stack).not.toContain('Timeout.<anonymous>')
  expect(error).not.toHaveProperty('cause')
})

it('continues after real setup and teardown wrapper settlement with separate phase origins', async () => {
  const c = createCollector('around-phase-origins')
  const trace: string[] = []
  function registerWrapper() {
    c.api.aroundEach(async (execute, { task, signal }) => {
      if (task.name === 'following') {
        await execute()
        return
      }
      const expired = new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true })
      )
      if (task.name === 'teardown') await execute()
      await expired
      trace.push('settled ' + task.name)
    }, 5)
  }
  registerWrapper()
  c.api.test('setup', () => {
    throw new Error('timed-out setup must not invoke body')
  })
  c.api.test('teardown', () => {
    trace.push('body teardown')
  })
  c.api.test('following', () => {
    trace.push('following')
  })
  const result = await run(c)
  expect(result.cases.map(({ status }) => status)).toEqual([
    'failed',
    'failed',
    'passed',
  ])
  expect(trace).toEqual([
    'settled setup',
    'body teardown',
    'settled teardown',
    'following',
  ])
  expect(result.interrupted).toBe(true)
  for (const [index, phase] of ['setup', 'teardown'].entries()) {
    const error = result.cases[index].errors[0].error as Error
    const message = `The ${phase} phase of "aroundEach" hook timed out after 5ms.`
    expect(error.name).toBe(
      phase === 'setup' ? 'AroundHookSetupError' : 'AroundHookTeardownError'
    )
    expect(error.message).toBe(message)
    expect(error.stack).toContain(`Error: ${message}\n`)
    expect(error.stack).toContain('registerWrapper')
    expect(error.stack).not.toContain('Timeout.<anonymous>')
  }
})

it('preserves a healthy concurrent sibling and following work after wrapper cleanup', async () => {
  const c = createCollector('around-concurrent-settlement')
  let releaseSibling!: () => void
  const expired = new Promise<void>((resolve) => {
    releaseSibling = resolve
  })
  const trace: string[] = []
  const signals: boolean[] = []
  c.api.aroundEach(async (execute, { task, signal }) => {
    if (task.name === 'timeout') {
      signal.addEventListener('abort', releaseSibling, { once: true })
      await execute()
      await expired
      trace.push('wrapper settled')
    } else {
      await execute()
      signals.push(signal.aborted)
    }
  }, 10)
  c.api.test.concurrent('timeout', ({ onTestFinished }) => {
    onTestFinished(() => {
      trace.push('finished before timeout')
    })
  })
  c.api.test.concurrent('healthy', async ({ signal }) => {
    await expired
    signals.push(signal.aborted)
  })
  c.api.test('following', () => {
    trace.push('following')
  })
  const result = await runCollected(
    c.close(),
    { ...options(), maxConcurrency: 2 },
    () => {}
  )
  expect(result.cases.map(({ name, status }) => [name, status]).sort()).toEqual(
    [
      ['timeout', 'failed'],
      ['healthy', 'passed'],
      ['following', 'passed'],
    ].sort()
  )
  expect(trace).toEqual([
    'finished before timeout',
    'wrapper settled',
    'following',
  ])
  expect(signals).toEqual([false, false, false])
  expect(result.interrupted).toBe(true)
})

it.each(['setup', 'teardown'] as const)(
  'retains unopened-work poisoning until the actual %s wrapper settles',
  async (phase) => {
    const c = createCollector('around-pending-settlement')
    let release!: () => void
    let completed!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const finished = new Promise<void>((resolve) => {
      completed = resolve
    })
    c.api.aroundEach(async (execute) => {
      try {
        if (phase === 'teardown') await execute()
        await pending
      } finally {
        completed()
      }
    }, 5)
    c.api.test('timeout', () => {
      if (phase === 'setup') throw new Error('must not enter setup body')
    })
    c.api.test('following', () => {
      throw new Error('must not start before wrapper settlement')
    })
    try {
      const result = await run(c)
      expect(result.cases.map(({ status }) => status)).toEqual([
        'failed',
        'cancelled',
      ])
      expect(result.interrupted).toBe(true)
    } finally {
      release()
      await finished
    }
  }
)

it.each(['retry', 'repeat'] as const)(
  'admits a %s only after its own timed-out body, teardown and onCaseEnd close',
  async (kind) => {
    const c = createCollector('body-deadline-continuation')
    const trace: string[] = []
    const contexts: unknown[] = []
    const signals: AbortSignal[] = []
    let firstEnded!: () => void
    const ended = new Promise<void>((resolve) => {
      firstEnded = resolve
    })
    let releaseEnd!: () => void
    const closed = new Promise<void>((resolve) => {
      releaseEnd = resolve
    })
    c.api.test(
      'same case',
      { timeout: 5, ...(kind === 'retry' ? { retry: 1 } : { repeats: 1 }) },
      async (context) => {
        const { task, signal, onTestFailed, onTestFinished } = context
        contexts.push(context)
        signals.push(signal)
        const attempt =
          kind === 'retry' ? task.result!.retryCount : task.result!.repeatCount
        trace.push('body ' + attempt)
        onTestFinished(() => {
          trace.push('finished ' + attempt)
        })
        if (attempt === 0) {
          await new Promise<void>((resolve) => {
            onTestFailed(() => {
              trace.push('failed 0')
              resolve()
            })
          })
          trace.push('settled 0')
        } else {
          expect(signal.aborted).toBe(true)
          context.onTestFinished(() => {
            trace.push('shared context finished 1')
          })
        }
      }
    )
    c.api.test('following', () => {
      trace.push('following')
    })
    let first = true
    const running = runCollected(
      c.close(),
      {
        ...options(),
        async onCaseEnd(result) {
          if (result.name !== 'same case' || !first) return
          first = false
          trace.push('onCaseEnd 0')
          firstEnded()
          await closed
          trace.push('closed onCaseEnd 0')
        },
      },
      () => {}
    )
    try {
      await ended
      expect(trace).toEqual([
        'body 0',
        'finished 0',
        'failed 0',
        'settled 0',
        'onCaseEnd 0',
      ])
    } finally {
      releaseEnd()
    }
    const result = await running
    expect(result.cases.map(({ status }) => status)).toEqual([
      'failed',
      'passed',
      'passed',
    ])
    expect(trace).toEqual([
      'body 0',
      'finished 0',
      'failed 0',
      'settled 0',
      'onCaseEnd 0',
      'closed onCaseEnd 0',
      'body 1',
      'shared context finished 1',
      'finished 1',
      'following',
    ])
    expect(new Set(contexts).size).toBe(1)
    expect(new Set(signals).size).toBe(1)
    expect(result.interrupted).toBe(kind === 'repeat')
  }
)

it('retains each new body deadline and its actual settlement across repeated timeouts', async () => {
  const c = createCollector('repeated-body-deadlines')
  const trace: string[] = []
  c.api.test('twice', { timeout: 5, repeats: 1 }, async (context) => {
    const attempt = context.task.result!.repeatCount
    trace.push('body ' + attempt)
    await new Promise<void>((resolve) => {
      context.onTestFailed(() => {
        trace.push('failed ' + attempt)
        resolve()
      })
    })
    trace.push('settled ' + attempt)
  })
  c.api.test('following', () => {
    trace.push('following')
  })
  const result = await run(c)
  expect(result.cases.map(({ status }) => status)).toEqual([
    'failed',
    'failed',
    'passed',
  ])
  expect(trace).toEqual([
    'body 0',
    'failed 0',
    'settled 0',
    'body 1',
    'failed 1',
    'settled 1',
    'following',
  ])
  for (const attempt of result.cases.slice(0, 2)) {
    expect(attempt.errors).toHaveLength(1)
    expect((attempt.errors[0].error as Error).message).toBe(
      'Test timed out in 5ms.\nIf this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".'
    )
  }
  expect(result.interrupted).toBe(true)
})

it('does not excuse a foreign unsettled deadline when admitting a retry', async () => {
  const c = createCollector('foreign-body-deadline')
  let releaseForeign!: () => void
  const pending = new Promise<void>((resolve) => {
    releaseForeign = resolve
  })
  let ownBodies = 0
  c.api.test.concurrent('foreign', { timeout: 5 }, async () => {
    await pending
  })
  c.api.test.concurrent(
    'own',
    { timeout: 10, retry: 1 },
    async ({ onTestFailed }) => {
      ownBodies++
      await new Promise<void>((resolve) => {
        onTestFailed(() => resolve())
      })
    }
  )
  c.api.test('following', () => {
    throw new Error('foreign pending work must retain the poison')
  })
  try {
    const result = await runCollected(
      c.close(),
      { ...options(), maxConcurrency: 2 },
      () => {}
    )
    expect(ownBodies).toBe(1)
    expect(
      result.cases.map(({ name, status }) => [name, status]).sort()
    ).toEqual(
      [
        ['foreign', 'failed'],
        ['own', 'failed'],
        ['following', 'cancelled'],
      ].sort()
    )
    expect(result.interrupted).toBe(true)
  } finally {
    releaseForeign()
    await pending
  }
})

it('keeps run cancellation dominant after an otherwise settled body deadline', async () => {
  const c = createCollector('cancel-body-retry')
  const controller = new AbortController()
  let bodies = 0
  c.api.test('timeout', { timeout: 5, retry: 1 }, async ({ onTestFailed }) => {
    bodies++
    await new Promise<void>((resolve) => {
      onTestFailed(() => resolve())
    })
  })
  c.api.test('following', () => {
    throw new Error('cancelled work must not execute')
  })
  const result = await runCollected(
    c.close(),
    {
      ...options(),
      signal: controller.signal,
      onCaseEnd(result) {
        if (result.name === 'timeout') controller.abort(new Error('cancel'))
      },
    },
    () => {}
  )
  expect(bodies).toBe(1)
  expect(result.cases.map(({ status }) => status)).toEqual([
    'failed',
    'cancelled',
  ])
  expect(result.interrupted).toBe(true)
})

it('does not admit a retry through the foreign around-timer capture window', async () => {
  const c = createCollector('foreign-around-admission')
  let releaseForeign!: () => void
  const pending = new Promise<void>((resolve) => {
    releaseForeign = resolve
  })
  let aroundExpired!: () => void
  const expired = new Promise<void>((resolve) => {
    aroundExpired = resolve
  })
  let ownBodies = 0
  c.api.aroundEach(async (execute, { task, signal }) => {
    if (task.name === 'foreign')
      signal.addEventListener('abort', aroundExpired, { once: true })
    await execute()
    if (task.name === 'foreign') await pending
  }, 10)
  c.api.test.concurrent('foreign', () => {})
  c.api.test.concurrent(
    'own',
    { timeout: 5, retry: 1 },
    async ({ onTestFailed }) => {
      ownBodies++
      await new Promise<void>((resolve) => {
        onTestFailed(() => resolve())
      })
    }
  )
  c.api.test('following', () => {
    throw new Error('a foreign around deadline must block unopened work')
  })
  try {
    const result = await runCollected(
      c.close(),
      {
        ...options(),
        maxConcurrency: 2,
        async onCaseEnd(result) {
          if (result.name === 'own') await expired
        },
      },
      () => {}
    )
    expect(ownBodies).toBe(1)
    expect(result.cases.filter(({ name }) => name === 'own')).toHaveLength(1)
    expect(result.cases.find(({ name }) => name === 'following')!.status).toBe(
      'cancelled'
    )
    expect(result.interrupted).toBe(true)
  } finally {
    releaseForeign()
    await pending
  }
})

it('keeps a settled expected-failure timeout from borrowing another case retry recovery', async () => {
  const c = createCollector('foreign-expected-deadline')
  c.api.test.fails(
    'expected timeout',
    { timeout: 5 },
    async ({ onTestFailed }) => {
      await new Promise<void>((resolve) => onTestFailed(() => resolve()))
    }
  )
  let bodies = 0
  c.api.test(
    'recovered retry',
    { timeout: 5, retry: 1 },
    async ({ onTestFailed }) => {
      if (bodies++ === 0)
        await new Promise<void>((resolve) => onTestFailed(() => resolve()))
    }
  )
  const result = await run(c)
  expect(result.cases.map(({ status }) => status)).toEqual([
    'passed',
    'failed',
    'passed',
  ])
  expect(result.interrupted).toBe(false)
})

it('does not release a non-body historical deadline after another successful body retry', async () => {
  const c = createCollector('foreign-around-expected-deadline')
  c.api.aroundEach(async (execute, { signal, task }) => {
    await execute()
    if (task.name === 'expected wrapper timeout') {
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true })
      )
    }
  }, 5)
  c.api.test.fails('expected wrapper timeout', () => {})
  let bodies = 0
  c.api.test(
    'recovered retry',
    { timeout: 5, retry: 1 },
    async ({ onTestFailed }) => {
      if (bodies++ === 0)
        await new Promise<void>((resolve) => onTestFailed(() => resolve()))
    }
  )
  const result = await run(c)
  expect(result.cases.map(({ status }) => status)).toEqual([
    'passed',
    'failed',
    'passed',
  ])
  expect(result.interrupted).toBe(true)
})

it('keeps file cleanup errors dominant after successful body retry recovery', async () => {
  const c = createCollector('body-retry-file-cleanup')
  let bodies = 0
  c.api.afterAll(() => {
    throw new Error('file cleanup failure')
  })
  c.api.test(
    'recovered',
    { timeout: 5, retry: 1 },
    async ({ onTestFailed }) => {
      if (bodies++ === 0)
        await new Promise<void>((resolve) => onTestFailed(() => resolve()))
    }
  )
  const result = await run(c)
  expect(result.cases.map(({ status }) => status)).toEqual(['failed', 'passed'])
  expect(result.errors.map(({ error }) => (error as Error).message)).toEqual([
    'file cleanup failure',
  ])
  expect(result.interrupted).toBe(true)
})

it('does not let an expected timeout borrow a successful retry of a later repeat of the same case', async () => {
  const c = createCollector('same-case-expected-body-deadline')
  let bodies = 0
  const events: unknown[] = []
  c.api.test.fails(
    'expected repeats',
    { timeout: 5, retry: 1, repeats: 1 },
    async ({ signal, task }) => {
      const current = bodies++
      events.push([
        'body',
        current,
        task.result!.retryCount,
        task.result!.repeatCount,
        signal.aborted,
      ])
      if (current === 0) {
        await new Promise<void>((resolve) =>
          signal.addEventListener(
            'abort',
            () => {
              events.push(['abort', current])
              resolve()
            },
            { once: true }
          )
        )
        events.push(['settled', current, signal.aborted])
      } else if (current === 2) throw new Error('expected final retry failure')
    }
  )
  const result = await run(c)
  expect(result.cases.map(({ status }) => status)).toEqual([
    'passed',
    'failed',
    'passed',
  ])
  expect(events).toEqual([
    ['body', 0, 0, 0, false],
    ['abort', 0],
    ['settled', 0, true],
    ['body', 1, 0, 1, true],
    ['body', 2, 1, 1, true],
  ])
  expect((result.cases[1].errors[0].error as Error).message).toBe(
    'Expect test to fail'
  )
  expect(result.interrupted).toBe(false)
})

it('carries only actual body deadline registrations privately without changing Error own fields', async () => {
  const c = createCollector('private-body-registration')
  c.api.test(
    'deadline',
    { timeout: 5 },
    ({ signal }) =>
      new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true })
      )
  )
  const declaration = c.root.children[0]
  const registration = Object.getOwnPropertyDescriptor(
    declaration,
    'registrationError'
  )!.value
  const result = await run(c)
  const failure = result.cases[0].errors[0]
  const error = failure.error as Error
  expect(failure.registrationError).toBe(registration)
  expect(
    Object.getOwnPropertyDescriptor(failure, 'registrationError')
  ).toMatchObject({ enumerable: false, writable: false })
  expect(Object.keys(failure)).toEqual(['phase', 'error'])
  expect({ ...failure }).not.toHaveProperty('registrationError')
  expect(error).not.toHaveProperty('registrationError')
  expect(Object.getOwnPropertyNames(error).sort()).toEqual(
    ['message', 'operation', 'stack'].sort()
  )
  expect(error.stack).toBe(registration.stack)

  const user = createCollector('user-error-registration')
  const actual = new Error('ordinary error')
  user.api.test('user', () => {
    throw actual
  })
  const before = Object.getOwnPropertyDescriptors(actual)
  const failed = (await run(user)).cases[0].errors[0]
  expect(failed.error).toBe(actual)
  expect(failed).not.toHaveProperty('registrationError')
  expect(Object.getOwnPropertyDescriptors(actual)).toEqual(before)
  const hook = createCollector('hook-registration')
  hook.api.beforeEach(
    ({ signal }) =>
      new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true })
      ),
    5
  )
  hook.api.test('blocked', () => {
    throw new Error('must not enter')
  })
  const hookFailure = (await run(hook)).cases[0].errors[0]
  expect(hookFailure.phase).toBe('beforeEach')
  expect(hookFailure.registrationError).toBe(hookFailure.error)
  expect(
    Object.getOwnPropertyDescriptor(hookFailure, 'registrationError')
  ).toMatchObject({ enumerable: false, writable: false })
  expect(hookFailure.error).not.toHaveProperty('registrationError')
})

it('uses actual fixture-builder receivers and fresh default modifiers while preserving override suite scope', async () => {
  const c = createCollector('fixture-receivers')
  const events: unknown[] = []
  const own = c.api.test.extend('base', 'own')
  const other = c.api.test.extend('base', 'other')
  const same = Reflect.apply(own.extend, own, ['value', 'same'])
  same('same', ({ base, value }) => events.push(['same', base, value]))
  const foreign = Reflect.apply(own.extend, other, ['value', 'foreign'])
  foreign('foreign', ({ base, value }) => events.push(['foreign', base, value]))
  own.skip.extend('value', 'fresh')('direct skip', ({ base, value }) =>
    events.push(['direct skip', base, value])
  )
  const borrowedSkip = Reflect.apply(own.skip.extend, other, [
    'value',
    'borrowed',
  ])
  borrowedSkip('borrowed skip', ({ base, value }) =>
    events.push(['borrowed skip', base, value])
  )
  own.concurrent.extend('value', 'serial')(
    'fresh concurrency',
    ({ base, task }) =>
      events.push(['fresh concurrency', base, task.concurrent])
  )
  c.api.describe('override', () => {
    const returned = Reflect.apply(own.override, other, ['base', 'changed'])
    expect(returned).toBe(other)
    own('unchanged own', ({ base }) => events.push(['own', base]))
    other('changed other', ({ base }) => events.push(['other', base]))
  })
  own('outside', ({ base }) => events.push(['outside', base]))
  await c.settle()
  const result = await run(c)
  expect(result.cases.map(({ status }) => status)).toEqual(
    Array(8).fill('passed')
  )
  expect(events).toEqual([
    ['same', 'own', 'same'],
    ['foreign', 'other', 'foreign'],
    ['direct skip', 'own', 'fresh'],
    ['borrowed skip', 'other', 'borrowed'],
    ['fresh concurrency', 'own', undefined],
    ['own', 'own'],
    ['other', 'changed'],
    ['outside', 'own'],
  ])
})

it('retains actual unbound fixture operation refusals without adding public API properties', () => {
  const c = createCollector('unbound-fixture-receivers')
  const api = c.api.test.extend('value', 1)
  const keys = Reflect.ownKeys(api)
  for (const operation of [api.extend, api.override]) {
    expect(() => Reflect.apply(operation, undefined, ['value', 2])).toThrow(
      "Cannot read properties of undefined (reading 'getFixtures')"
    )
  }
  expect(Reflect.ownKeys(api)).toEqual(keys)
  expect(Object.getOwnPropertySymbols(api)).toEqual([])
  c.close()
})

it('dispatches cached receiver fixtures to the current collector while rejecting a closed async origin first', async () => {
  let active: ReturnType<typeof createCollector> | undefined
  const first = createCollector('cached-fixtures', {
    getActiveCollector: () => active,
  })
  const original = first.api.test.extend('base', 'original')
  const receiver = first.api.test.extend('base', 'receiver')
  const extend = original.extend
  const override = original.override
  first.close()
  const next = createCollector('current-fixtures')
  active = next
  const events: unknown[] = []
  const fresh = Reflect.apply(extend, receiver, ['value', 'current'])
  fresh('redirected', ({ base, value }) => events.push([base, value]))
  expect(Reflect.apply(override, receiver, ['base', 'overridden'])).toBe(
    receiver
  )
  receiver('redirected override', ({ base }) => events.push([base]))

  const late: Error[] = []
  const scope = createAsyncScope(
    { kind: 'collection', context: { id: 'old', name: 'old' } },
    (error) => late.push(error)
  )
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const reads: PropertyKey[] = []
  const observedReceiver = new Proxy(receiver, {
    get(target, key, actualReceiver) {
      reads.push(key)
      return Reflect.get(target, key, actualReceiver)
    },
  })
  const pending = scope.run(() =>
    gate.then(() => Reflect.apply(extend, observedReceiver, ['late', true]))
  )
  scope.close()
  release()
  await expect(pending).rejects.toThrow('closed collection scope "old"')
  expect(reads).toEqual([])
  expect(late).toHaveLength(1)
  const result = await run(next)
  expect(result.cases.map(({ status }) => status)).toEqual(['passed', 'passed'])
  expect(events).toEqual([['receiver', 'current'], ['overridden']])
})

it('recognizes options-only fixture builders while retaining ordinary values and actual omitted arguments', async () => {
  const c = createCollector('options-only-builders')
  const events: unknown[] = []
  for (const [name, args] of [
    ['file', [{ scope: 'file' }]],
    ['worker', [{ scope: 'worker' }]],
    ['mixed', [{ auto: false, extra: 3 }]],
    ['explicit undefined', [{ scope: 'test' }, undefined]],
    ['empty undefined', [{}, undefined]],
    ['omitted', []],
    ['object', [{ port: 3 }]],
    ['array', [['one', 'two']]],
  ] as const) {
    const api = Reflect.apply(c.api.test.extend, c.api.test, ['value', ...args])
    api(name, ({ value }) => {
      events.push([
        name,
        value && typeof value === 'object' ? Object.keys(value) : value,
      ])
    })
  }
  const overridden = c.api.test.extend('value', () => ({ initial: true }))
  c.api.describe('override', () => {
    Reflect.apply(overridden.override, overridden, ['value', { auto: false }])
    overridden('options-only override', ({ value }) => {
      events.push(['override', Object.keys(value)])
    })
  })
  await c.settle()
  const result = await run(c)
  expect(result.cases.map(({ status }) => status)).toEqual(
    Array(9).fill('passed')
  )
  expect(events).toEqual([
    ['file', []],
    ['worker', []],
    ['mixed', []],
    ['explicit undefined', []],
    ['empty undefined', []],
    ['omitted', undefined],
    ['object', ['port']],
    ['array', ['0', '1']],
    ['override', []],
  ])
})

it('captures options-only proxy fields in the target registration order without consuming ordinary object values', () => {
  const c = createCollector('options-only-reads')
  const events: unknown[] = []
  const selected = new Proxy(
    { auto: false, scope: 'test', injected: false, ignored: true },
    {
      ownKeys(target) {
        events.push('keys')
        return Reflect.ownKeys(target)
      },
      getOwnPropertyDescriptor(target, key) {
        events.push(['descriptor', key])
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
      get(target, key, receiver) {
        events.push(['get', key])
        return Reflect.get(target, key, receiver)
      },
    }
  )
  c.api.test.extend('value', selected)
  expect(events).toEqual([
    'keys',
    ['descriptor', 'auto'],
    ['descriptor', 'scope'],
    ['descriptor', 'injected'],
    ['descriptor', 'ignored'],
    'keys',
    ['descriptor', 'auto'],
    ['descriptor', 'scope'],
    ['descriptor', 'injected'],
    ['descriptor', 'ignored'],
    ['get', 'auto'],
    ['get', 'scope'],
    ['get', 'injected'],
  ])
  events.length = 0
  const ordinary = new Proxy(
    { port: 3 },
    {
      ownKeys(target) {
        events.push('ordinary keys')
        return Reflect.ownKeys(target)
      },
    }
  )
  c.api.test.extend('value', ordinary)
  expect(events).toEqual(['ordinary keys'])
  c.close()
})

it('accounts for a settled expected body deadline only after its own cleanup and completion', async () => {
  const c = createCollector('expected-body-publication')
  const events: string[] = []
  const owned = c.api.test.extend<{ resource: string }>({
    resource: async ({}, provide) => {
      events.push('fixture setup')
      await provide('live')
      events.push('fixture cleanup')
    },
  })
  owned.fails(
    'expected settled deadline',
    { timeout: 5 },
    async ({ resource, signal, onTestFinished, onTestFailed }) => {
      events.push(resource)
      onTestFinished(() => {
        events.push('finished')
      })
      onTestFailed(() => {
        events.push('failed')
      })
      await new Promise<void>((resolve) =>
        signal.addEventListener(
          'abort',
          () => {
            events.push('abort')
            resolve()
          },
          { once: true }
        )
      )
      events.push('body settled')
    }
  )
  c.api.test('following', ({ signal }) => {
    events.push(signal.aborted ? 'following aborted' : 'following live')
  })
  const result = await runCollected(
    c.close(),
    {
      ...options(),
      onCaseEnd: (row) => {
        events.push(`case end ${row.name}`)
      },
    },
    () => {}
  )
  expect(result.cases.map(({ status }) => status)).toEqual(['passed', 'passed'])
  expect(events).toEqual([
    'fixture setup',
    'live',
    'abort',
    'body settled',
    'fixture cleanup',
    'finished',
    'failed',
    'case end expected settled deadline',
    'following live',
    'case end following',
  ])
  expect(result.errors).toEqual([])
  expect(result.interrupted).toBe(false)
})

it('retains cancellation from the completion callback after a settled expected body deadline', async () => {
  const c = createCollector('expected-body-completion-cancel')
  const controller = new AbortController()
  c.api.test.fails(
    'expected settled deadline',
    { timeout: 5 },
    async ({ signal }) => {
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true })
      )
    }
  )
  const result = await runCollected(
    c.close(),
    {
      ...options(),
      signal: controller.signal,
      onCaseEnd: () => {
        controller.abort(new Error('cancel at completion'))
      },
    },
    () => {}
  )
  expect(result.cases.map(({ status }) => status)).toEqual(['passed'])
  expect(result.errors).toEqual([])
  expect(result.interrupted).toBe(true)
})

it('publishes one actual logical-case result after retry/repeat cleanup and before later work', async () => {
  const c = createCollector('logical-case-results')
  const trace: string[] = []
  const seen: Task[] = []
  let tries = 0
  let repetitions = 0
  let actualTask: Task | undefined
  c.api.afterEach(({ task }) => {
    trace.push(`after:${task.name}`)
  })
  c.api.test('retry', { retry: 1 }, ({ task, onTestFinished }) => {
    actualTask ??= task
    expect(task).toBe(actualTask)
    onTestFinished(() => {
      Object.assign(task.meta, { closed: true })
      trace.push(`finished:${++tries}`)
    })
    if (tries === 0) throw new Error('first retry failure')
  })
  c.api.test('repeat failure', { repeats: 1 }, () => {
    if (repetitions++ === 0) throw new Error('first repeat failure')
  })
  c.api.test.skip('static skip', () => {
    throw new Error('must remain skipped')
  })
  c.api.test.todo('todo')
  c.api.test('runtime skip', { retry: 2, repeats: 2 }, ({ skip }) => {
    skip('actual skip')
  })
  c.api.test('following', () => {
    trace.push('following')
  })
  const observations: unknown[] = []
  const result = await runCollected(
    c.close(),
    {
      ...options(),
      onCaseEnd(value) {
        trace.push(
          `attempt:${value.name}:${value.attempt.retry}:${value.attempt.repeat}`
        )
      },
      async onCaseResult(task, value) {
        seen.push(task)
        observations.push([task.name, value.status, value.pending ?? false])
        if (task.name === 'retry') {
          expect(task).toBe(actualTask)
          expect(task.meta).toHaveProperty('closed', true)
          expect(task.file.tasks).toHaveLength(6)
          expect(task.file.tasks[5].name).toBe('following')
          expect(trace).not.toContain('following')
          expect(trace.slice(0, 6)).toEqual([
            'after:retry',
            'finished:1',
            'attempt:retry:0:0',
            'after:retry',
            'finished:2',
            'attempt:retry:1:0',
          ])
        }
        await Promise.resolve()
        trace.push(`logical:${task.name}`)
      },
    },
    () => {}
  )
  expect(observations).toEqual([
    ['retry', 'passed', false],
    ['repeat failure', 'failed', false],
    ['static skip', 'skipped', false],
    ['todo', 'skipped', false],
    ['runtime skip', 'skipped', true],
    ['following', 'passed', false],
  ])
  expect(new Set(seen).size).toBe(6)
  expect(result.cases).toHaveLength(8)
  expect(trace.indexOf('logical:runtime skip')).toBeLessThan(
    trace.indexOf('following')
  )
  expect(
    result.cases.find((value) => value.name === 'repeat failure')!.errors[0]
      .error
  ).toMatchObject({ message: 'first repeat failure' })
})

it('awaits the actual logical result producer before admitting the next case', async () => {
  const c = createCollector('logical-case-barrier')
  const trace: string[] = []
  let entered!: () => void
  const callbackEntered = new Promise<void>((resolve) => {
    entered = resolve
  })
  let release!: () => void
  const callbackReleased = new Promise<void>((resolve) => {
    release = resolve
  })
  c.api.test('first', () => {
    trace.push('first')
  })
  c.api.test('following', () => {
    trace.push('following')
  })
  const running = runCollected(
    c.close(),
    {
      ...options(),
      async onCaseResult(task) {
        trace.push(`result:${task.name}`)
        if (task.name === 'first') {
          entered()
          await callbackReleased
        }
      },
    },
    () => {}
  )
  await callbackEntered
  try {
    expect(trace).toEqual(['first', 'result:first'])
  } finally {
    release()
  }
  const result = await running
  expect(trace).toEqual([
    'first',
    'result:first',
    'following',
    'result:following',
  ])
  expect(result.cases.map((value) => value.status)).toEqual([
    'passed',
    'passed',
  ])
})

it('retains operation phase ancestry and the original closed-owner fence', async () => {
  const { runWithCasePhase, getOriginatingCasePhase, captureAsyncScope } =
    await import('next/dist/experimental/testing/runner/async-context')
  const failures: Error[] = []
  const owner = createAsyncScope(
    { kind: 'collection', context: { id: 'collection', name: 'collection' } },
    (error) => failures.push(error)
  )
  let captured: ReturnType<typeof captureAsyncScope> | undefined
  const c = createCollector('phase-ancestry')
  const phases: unknown[] = []
  c.api.test('body', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const setup = runWithCasePhase('beforeEach', async () => {
      await gate
      return getOriginatingCasePhase()
    })
    await runWithCasePhase('test', async () => {
      const actual = getOriginatingCasePhase()
      phases.push(actual?.phase)
      captured = captureAsyncScope()
      release()
      phases.push((await setup)?.phase)
      phases.push(getOriginatingCasePhase()?.phase)
    })
  })
  await owner.run(() =>
    runCollected(
      c.close(),
      { ...options(), onLateFailure: (error) => failures.push(error) },
      () => {}
    )
  )
  owner.close()
  expect(phases).toEqual(['test', 'beforeEach', 'test'])
  expect(() => captured!.run(() => {})).toThrow('closed attempt scope')
  expect(failures).toHaveLength(1)
})

it.each(['stack', 'list', 'parallel'] as const)(
  'calls actual returned beforeEach functions once with no receiver or supplied arguments: %s',
  async (sequence) => {
    const c = createCollector('returned-cleanup-call')
    const rows: unknown[] = []
    const roles: unknown[] = []
    const boundReceiver = { bound: true }
    const lexicalReceiver = { lexical: true }
    const record = (name: string, receiver: unknown, args: unknown[]) => {
      rows.push([name, receiver, args])
    }
    const makeArrow = function (this: unknown) {
      return (...args: unknown[]) => {
        record('arrow', this === lexicalReceiver, args)
      }
    }
    const factories: [string, () => Function][] = [
      [
        'normal',
        () =>
          function (this: unknown, ...args: unknown[]) {
            record('normal', this === undefined, args)
          },
      ],
      [
        'proxy',
        () =>
          new Proxy(
            function (this: unknown, ...args: unknown[]) {
              record('proxy', this === undefined, args)
            },
            {
              apply(target, receiver, args) {
                record('apply', receiver === undefined, args)
                return Reflect.apply(target, receiver, args)
              },
            }
          ),
      ],
      [
        'bound',
        () =>
          function (this: unknown, ...args: unknown[]) {
            record('bound', this === boundReceiver, args)
          }.bind(boundReceiver, 'bound argument'),
      ],
      ['arrow', () => makeArrow.call(lexicalReceiver)],
      [
        'async',
        () =>
          async function (this: unknown, ...args: unknown[]) {
            await Promise.resolve()
            record('async', this === undefined, args)
          },
      ],
      [
        'default',
        () =>
          function (this: unknown, value = 'default') {
            rows.push(['default', this === undefined, arguments.length, value])
          },
      ],
    ]
    for (const [name, make] of factories) {
      c.api.describe(name, () => {
        c.api.beforeEach(() => {
          rows.push(['before', name])
          return make()
        })
        c.api.test('body', () => {
          rows.push(['body', name])
        })
      })
    }
    await c.settle()
    const result = await runCollected(
      c.close(),
      {
        ...options(),
        sequence: { hooks: sequence },
        runWithCasePhase(phase, callback, authoredCallback) {
          if (phase === 'cleanup') roles.push([phase, authoredCallback])
          return callback()
        },
      },
      () => {}
    )
    expect(result.cases.map(({ status }) => status)).toEqual(
      Array(6).fill('passed')
    )
    expect(result.errors).toEqual([])
    expect(rows).toEqual([
      ['before', 'normal'],
      ['body', 'normal'],
      ['normal', true, []],
      ['before', 'proxy'],
      ['body', 'proxy'],
      ['apply', true, []],
      ['proxy', true, []],
      ['before', 'bound'],
      ['body', 'bound'],
      ['bound', true, ['bound argument']],
      ['before', 'arrow'],
      ['body', 'arrow'],
      ['arrow', true, []],
      ['before', 'async'],
      ['body', 'async'],
      ['async', true, []],
      ['before', 'default'],
      ['body', 'default'],
      ['default', true, 0, 'default'],
    ])
    expect(roles).toEqual(
      Array(6)
        .fill([
          ['cleanup', undefined],
          ['cleanup', true],
        ])
        .flat()
    )
  }
)

it.each(['stack', 'list', 'parallel'] as const)(
  'retains setup fixture closure and refuses injection into returned beforeEach functions: %s',
  async (sequence) => {
    const c = createCollector('returned-cleanup-fixtures')
    const rows: unknown[] = []
    const custom = c.api.test.extend<{
      setup: string
      cleanupOnly: string
    }>({
      setup: async ({}, provide) => {
        rows.push('setup')
        await provide('fixture value')
        rows.push('teardown')
      },
      cleanupOnly: async ({}, provide) => {
        rows.push('unexpected cleanup fixture')
        await provide('unused')
      },
    })
    c.api.describe('closure', () => {
      custom.beforeEach(
        ({ setup }) =>
          function (this: unknown, ...args: unknown[]) {
            rows.push(['closure', this === undefined, args, setup])
          }
      )
      custom('body', ({ setup }) => {
        rows.push(['body', setup])
      })
    })
    c.api.describe('returned callback parameters are not fixtures', () => {
      custom.beforeEach(({ setup }) => {
        rows.push(['before', setup])
        return function ({ cleanupOnly }: { cleanupOnly: string }) {
          rows.push(['unexpected cleanup body', cleanupOnly])
        }
      })
      custom('body', ({ setup }) => {
        rows.push(['body', setup])
      })
    })
    await c.settle()
    const result = await runCollected(
      c.close(),
      { ...options(), sequence: { hooks: sequence } },
      () => {}
    )
    expect(result.cases.map(({ status }) => status)).toEqual([
      'passed',
      'failed',
    ])
    expect(result.errors).toEqual([])
    expect(result.cases[1].errors).toHaveLength(1)
    expect(result.cases[1].errors[0].phase).toBe('cleanup')
    expect(result.cases[1].errors[0].error).toBeInstanceOf(TypeError)
    expect((result.cases[1].errors[0].error as Error).message).toContain(
      'cleanupOnly'
    )
    expect(rows).toEqual([
      'setup',
      ['body', 'fixture value'],
      ['closure', true, [], 'fixture value'],
      'teardown',
      'setup',
      ['before', 'fixture value'],
      ['body', 'fixture value'],
      'teardown',
    ])
  }
)

it.each(
  (['stack', 'list', 'parallel'] as const).flatMap((sequence) =>
    [
      {
        name: 'local budget',
        global: 1000,
        local: 10,
        delay: 40,
        passed: false,
      },
      {
        name: 'larger local budget',
        global: 10,
        local: 1000,
        delay: 40,
        passed: true,
      },
      {
        name: 'disabled local budget',
        global: 10,
        local: 0,
        delay: 40,
        passed: true,
      },
      {
        name: 'inherited budget',
        global: 10,
        local: undefined,
        delay: 40,
        passed: false,
      },
    ].map((setting) => [sequence, setting] as const)
  )
)(
  'keeps returned beforeEach cleanup budgets independent of the outer drain: %s %s',
  async (sequence, setting) => {
    const c = createCollector('returned-cleanup-budget')
    const events: string[] = []
    const receivers: unknown[] = []
    let settled = Promise.resolve()
    c.api.beforeEach(() => {
      events.push('setup')
      return async function (this: unknown, ...args: unknown[]) {
        receivers.push([this === undefined, args])
        events.push('cleanup-start')
        settled = new Promise<void>((resolve) => {
          setTimeout(() => {
            events.push('cleanup-end')
            resolve()
          }, setting.delay)
        })
        await settled
      }
    }, setting.local)
    c.api.test('body', () => {
      events.push('body')
    })
    c.api.afterAll(async () => {
      events.push('afterAll-start')
      await settled
      events.push('afterAll-end')
    }, 1000)
    const result = await runCollected(
      c.close(),
      {
        ...options(),
        hookTimeout: setting.global,
        sequence: { hooks: sequence },
      },
      () => {}
    )
    expect(receivers).toEqual([[true, []]])
    expect(result.cases).toHaveLength(1)
    expect(result.cases[0].status).toBe(setting.passed ? 'passed' : 'failed')
    expect(result.errors).toEqual([])
    expect(result.interrupted).toBe(!setting.passed)
    expect(
      result.cases[0].errors.map(({ phase, error }) => {
        if (!(error instanceof Error))
          throw new Error('Expected a cleanup deadline Error.')
        return [phase, error.message]
      })
    ).toEqual(
      setting.passed
        ? []
        : [
            [
              'cleanup',
              `Hook timed out in ${setting.local ?? setting.global}ms.\nIf this is a long-running hook, pass a timeout value as the last argument or configure it globally with "hookTimeout".`,
            ],
          ]
    )
    expect(events).toEqual(
      setting.passed
        ? [
            'setup',
            'body',
            'cleanup-start',
            'cleanup-end',
            'afterAll-start',
            'afterAll-end',
          ]
        : [
            'setup',
            'body',
            'cleanup-start',
            'afterAll-start',
            'cleanup-end',
            'afterAll-end',
          ]
    )
  }
)

it.each(
  (['stack', 'list', 'parallel'] as const).flatMap((sequence) =>
    (['beforeEach', 'afterEach', 'cleanup'] as const).map(
      (phase) => [sequence, phase] as const
    )
  )
)(
  'aborts actual case-hook deadlines before failure processing: %s %s',
  async (sequence, phase) => {
    const c = createCollector('hook-deadline-signal')
    const events: string[] = []
    const pending: Promise<void>[] = []
    const observed: { signal?: AbortSignal; state?: string } = {}
    const wait = (role: string) => {
      events.push(role + '-start')
      const work = new Promise<void>((resolve) => {
        setTimeout(() => {
          events.push(role + '-end')
          resolve()
        }, 40)
      })
      pending.push(work)
      return work
    }
    c.api.beforeEach(async (context) => {
      observed.signal = context.signal
      context.signal.addEventListener(
        'abort',
        () => {
          observed.state = context.task.result?.state
          events.push('abort')
        },
        { once: true }
      )
      context.onTestFinished(() => {
        events.push('finished')
      })
      if (phase === 'beforeEach') await wait(phase)
      if (phase === 'cleanup')
        return async function (this: unknown, ...args: unknown[]) {
          expect(this).toBeUndefined()
          expect(args).toEqual([])
          await wait(phase)
        }
    }, 10)
    c.api.afterEach(async () => {
      if (phase === 'afterEach') await wait(phase)
    }, 10)
    c.api.afterAll(async () => {
      await Promise.all(pending)
    }, 1000)
    c.api.test('body', () => {
      events.push('body')
    })
    const result = await runCollected(
      c.close(),
      {
        ...options(),
        sequence: { hooks: sequence },
        onCaseEnd: () => {
          events.push('case-end')
        },
      },
      () => {}
    )
    expect(result.cases[0].status).toBe('failed')
    expect(result.interrupted).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.cases[0].errors).toHaveLength(1)
    expect(result.cases[0].errors[0].phase).toBe(phase)
    expect(observed.signal?.aborted).toBe(true)
    expect(observed.signal?.reason).toBe(result.cases[0].errors[0].error)
    expect(observed.state).toBe(phase === 'beforeEach' ? 'run' : 'pass')
    expect(events.filter((event) => event === 'abort')).toHaveLength(1)
    expect(events.indexOf('abort')).toBeLessThan(events.indexOf('finished'))
    expect(events.indexOf('finished')).toBeLessThan(events.indexOf('case-end'))
    expect(events.includes('body')).toBe(phase !== 'beforeEach')
  }
)

it.each(
  (['stack', 'list', 'parallel'] as const).flatMap((sequence) =>
    (['beforeEach', 'afterEach', 'cleanup'] as const).map(
      (phase) => [sequence, phase] as const
    )
  )
)(
  'leaves ordinary case-hook failures un-aborted: %s %s',
  async (sequence, phase) => {
    const c = createCollector('ordinary-hook-failure-signal')
    const thrown = new Error('ordinary hook failure')
    let signal: AbortSignal | undefined
    let aborts = 0
    c.api.beforeEach((context) => {
      signal = context.signal
      context.signal.addEventListener('abort', () => {
        aborts++
      })
      if (phase === 'beforeEach') throw thrown
      if (phase === 'cleanup')
        return () => {
          throw thrown
        }
    }, 1000)
    c.api.afterEach(() => {
      if (phase === 'afterEach') throw thrown
    }, 1000)
    c.api.test('body', () => {})
    const result = await runCollected(
      c.close(),
      { ...options(), sequence: { hooks: sequence } },
      () => {}
    )
    expect(result.cases[0].status).toBe('failed')
    expect(result.cases[0].errors).toEqual([{ phase, error: thrown }])
    expect(result.interrupted).toBe(false)
    expect(signal?.aborted).toBe(false)
    expect(aborts).toBe(0)
  }
)

it.each(['stack', 'list', 'parallel'] as const)(
  'preserves external cancellation over a later returned-hook deadline: %s',
  async (sequence) => {
    const c = createCollector('cancelled-hook-deadline-signal')
    const external = new AbortController()
    const reason = new Error('external cancellation')
    let signal: AbortSignal | undefined
    let aborts = 0
    let pending = Promise.resolve()
    c.api.beforeEach((context) => {
      signal = context.signal
      context.signal.addEventListener('abort', () => {
        aborts++
      })
      return async () => {
        pending = new Promise<void>((resolve) => setTimeout(resolve, 40))
        queueMicrotask(() => external.abort(reason))
        await pending
      }
    }, 10)
    c.api.afterAll(async () => {
      await pending
    }, 1000)
    c.api.test('body', () => {})
    const result = await runCollected(
      c.close(),
      { runId: 'run', signal: external.signal, sequence: { hooks: sequence } },
      () => {}
    )
    await pending
    expect(signal?.reason).toBe(reason)
    expect(aborts).toBe(1)
    expect(result.interrupted).toBe(true)
  }
)

it.each(['stack', 'list', 'parallel'] as const)(
  'keeps disabled returned-hook deadlines and settled hooks un-aborted: %s',
  async (sequence) => {
    const c = createCollector('disabled-hook-deadline-signal')
    let signal: AbortSignal | undefined
    let aborts = 0
    c.api.beforeEach((context) => {
      signal = context.signal
      context.signal.addEventListener('abort', () => {
        aborts++
      })
      return async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 40))
      }
    }, 0)
    c.api.test('body', () => {})
    const result = await runCollected(
      c.close(),
      { ...options(), hookTimeout: 10, sequence: { hooks: sequence } },
      () => {}
    )
    expect(result.cases[0].status).toBe('passed')
    expect(result.interrupted).toBe(false)
    expect(signal?.aborted).toBe(false)
    expect(aborts).toBe(0)
  }
)

it.each(['stack', 'list', 'parallel'] as const)(
  'retains non-body publication veto after an expected BODY failure and returned-hook deadline: %s',
  async (sequence) => {
    const c = createCollector('expected-failure-hook-deadline-signal')
    let signal: AbortSignal | undefined
    let pending = Promise.resolve()
    c.api.beforeEach((context) => {
      signal = context.signal
      return async () => {
        pending = new Promise<void>((resolve) => setTimeout(resolve, 40))
        await pending
      }
    }, 10)
    c.api.afterAll(async () => {
      await pending
    }, 1000)
    c.api.test.fails('body', () => {
      throw new Error('expected body failure')
    })
    const result = await runCollected(
      c.close(),
      { ...options(), sequence: { hooks: sequence } },
      () => {}
    )
    expect(result.cases[0].status).toBe('passed')
    expect(result.cases[0].errors).toEqual([])
    expect(signal?.reason).toBeInstanceOf(Error)
    expect(signal?.reason).toMatchObject({
      message:
        'Hook timed out in 10ms.\nIf this is a long-running hook, pass a timeout value as the last argument or configure it globally with "hookTimeout".',
    })
    expect(result.interrupted).toBe(true)
  }
)

it.each(['stack', 'list', 'parallel'] as const)(
  'retains the registered hook deadline, source and abort identity in %s order',
  async (sequence) => {
    for (const role of ['beforeEach', 'afterEach', 'cleanup'] as const) {
      const c = createCollector('registered-hook-deadline-' + sequence + role)
      const aborted: unknown[] = []
      let signal: AbortSignal | undefined
      const pending = (context: { signal: AbortSignal }) => {
        signal = context.signal
        return new Promise<void>((resolve) => {
          context.signal.addEventListener(
            'abort',
            () => {
              const error = context.signal.reason as Error
              aborted.push(error, error.message, error.stack)
              resolve()
            },
            { once: true }
          )
        })
      }
      function registerDeadlineHook() {
        if (role === 'beforeEach') c.api.beforeEach(pending, 5)
        else if (role === 'afterEach') c.api.afterEach(pending, 5)
        else c.api.beforeEach((context) => () => pending(context), 5)
      }
      registerDeadlineHook()
      c.api.test('one', () => {})
      const result = await runCollected(
        c.close(),
        { ...options(), sequence: { hooks: sequence } },
        () => {}
      )
      expect(result.cases[0].status).toBe('failed')
      expect(result.interrupted).toBe(true)
      expect(result.cases[0].errors).toHaveLength(1)
      const failure = result.cases[0].errors[0]
      const error = failure.error as Error
      const message =
        'Hook timed out in 5ms.\nIf this is a long-running hook, pass a timeout value as the last argument or configure it globally with "hookTimeout".'
      expect(error.message).toBe(message)
      expect(error.stack).toContain('registerDeadlineHook')
      expect(error.stack).not.toContain('Timeout.<anonymous>')
      expect(signal?.reason).toBe(error)
      expect(aborted).toEqual([error, message, error.stack])
      expect(Reflect.ownKeys(error)).toEqual(['stack', 'message', 'operation'])
      expect(
        Object.getOwnPropertyDescriptor(failure, 'registrationError')
      ).toMatchObject({ value: error, enumerable: false })
      expect(Object.keys(failure)).toEqual(['phase', 'error'])
      expect(error).not.toHaveProperty('cause')
    }
  }
)

it('keeps generic listener resource deadlines separate from registered hook diagnostics', async () => {
  const c = createCollector('generic-listener-deadline')
  c.api.test('one', ({ onTestFinished }) => {
    onTestFinished(() => new Promise<void>(() => {}), 5)
  })
  const result = await run(c)
  expect(result.cases[0].status).toBe('failed')
  expect(result.cases[0].errors).toHaveLength(1)
  const error = result.cases[0].errors[0].error as Error
  expect(error.message).toBe('Next test timed out after 5ms.')
  expect(error.stack).toContain('Timeout.<anonymous>')
  expect(Reflect.ownKeys(error)).toEqual(['stack', 'message', 'operation'])
})

it('retains one hook registration and its captured budget across repeated executions', async () => {
  const c = createCollector('reused-hook-registration')
  function registerReusedDeadlineHook() {
    c.api.beforeEach(
      ({ signal }) =>
        new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => resolve(), { once: true })
        }),
      5
    )
  }
  registerReusedDeadlineHook()
  c.api.test('one', () => {})
  const suite = c.close()
  const hook = suite.hooks.beforeEach[0]
  const registration = hook.registrationError
  expect(registration).toBeInstanceOf(Error)
  expect(Object.keys(hook)).not.toContain('registrationError')
  let previous: Error | undefined
  for (const fallback of [15, 50]) {
    const result = await runCollected(
      suite,
      { ...options(), hookTimeout: fallback },
      () => {}
    )
    const error = result.cases[0].errors[0].error as Error
    expect(result.interrupted).toBe(true)
    expect(error.message).toBe(
      'Hook timed out in 5ms.\nIf this is a long-running hook, pass a timeout value as the last argument or configure it globally with "hookTimeout".'
    )
    expect(error.stack).toContain(`Error: ${error.message}\n`)
    expect(error.stack).toContain('registerReusedDeadlineHook')
    expect(error).not.toBe(previous)
    expect(hook.registrationError).toBe(registration)
    expect(hook.timeout).toBe(5)
    previous = error
  }
})

it.each(['stack', 'list', 'parallel'] as const)(
  'retains authored All-hook deadline identity and origin in %s order',
  async (sequence) => {
    for (const role of ['beforeAll', 'afterAll'] as const) {
      const c = createCollector('registered-all-hook-' + sequence + role)
      function registerAuthoredAllDeadline() {
        c.api[role](() => new Promise<void>(() => {}), 5)
      }
      registerAuthoredAllDeadline()
      c.api.test('one', () => {})
      const result = await runCollected(
        c.close(),
        { ...options(), sequence: { hooks: sequence } },
        () => {}
      )
      expect(result.cases[0].status).toBe(
        role === 'beforeAll' ? 'skipped' : 'passed'
      )
      expect(result.interrupted).toBe(true)
      expect(result.errors).toHaveLength(1)
      const failure = result.errors[0]
      const error = failure.error as Error
      expect(failure.phase).toBe(role)
      expect(error.message).toBe(
        'Hook timed out in 5ms.\nIf this is a long-running hook, pass a timeout value as the last argument or configure it globally with "hookTimeout".'
      )
      expect(error.stack).toContain('registerAuthoredAllDeadline')
      expect(error.stack).not.toContain('Timeout.<anonymous>')
      expect(Reflect.ownKeys(error)).toEqual(['stack', 'message', 'operation'])
      expect(
        Object.getOwnPropertyDescriptor(failure, 'registrationError')
      ).toMatchObject({ value: error, enumerable: false, writable: false })
      expect(Object.keys(failure)).toEqual(['phase', 'error'])
      expect(error).not.toHaveProperty('registrationError')
    }
  }
)

it.each(['stack', 'list', 'parallel'] as const)(
  'preserves disabled and inherited registered All-hook budgets in %s order',
  async (sequence) => {
    for (const role of ['beforeAll', 'afterAll'] as const) {
      const disabled = createCollector('disabled-all-hook-' + sequence + role)
      disabled.api[role](
        () => new Promise<void>((resolve) => setTimeout(resolve, 5)),
        0
      )
      disabled.api.test('one', () => {})
      const passed = await runCollected(
        disabled.close(),
        { ...options(), hookTimeout: 1, sequence: { hooks: sequence } },
        () => {}
      )
      expect(passed.cases[0].status).toBe('passed')
      expect(passed.errors).toEqual([])
      expect(passed.interrupted).toBe(false)

      const inherited = createCollector('inherited-all-hook-' + sequence + role)
      function registerInheritedAllDeadline() {
        inherited.api[role](() => new Promise<void>(() => {}))
      }
      registerInheritedAllDeadline()
      inherited.api.test('one', () => {})
      const failed = await runCollected(
        inherited.close(),
        { ...options(), hookTimeout: 5, sequence: { hooks: sequence } },
        () => {}
      )
      expect(failed.errors).toHaveLength(1)
      const failure = failed.errors[0]
      const error = failure.error as Error
      expect(error.message).toContain('Hook timed out in 5ms.\n')
      expect(error.stack).toContain('registerInheritedAllDeadline')
      expect(failure.registrationError).toBe(error)
    }
  }
)

it('associates the actual parallel All-hook failure with its own registration', async () => {
  for (const role of ['beforeAll', 'afterAll'] as const) {
    const c = createCollector('parallel-selected-all-hook-' + role)
    function registerHealthyAllHook() {
      c.api[role](() => {}, 20)
    }
    function registerFailingAllHook() {
      c.api[role](() => new Promise<void>(() => {}), 5)
    }
    registerHealthyAllHook()
    registerFailingAllHook()
    c.api.test('one', () => {})
    const result = await runCollected(
      c.close(),
      { ...options(), sequence: { hooks: 'parallel' } },
      () => {}
    )
    expect(result.errors).toHaveLength(1)
    const error = result.errors[0].error as Error
    expect(error.message).toContain('Hook timed out in 5ms.\n')
    expect(error.stack).toContain('registerFailingAllHook')
    expect(error.stack).not.toContain('registerHealthyAllHook')
    expect(result.errors[0].registrationError).toBe(error)
  }
})

it('preserves generic suite integration deadlines without an authored hook carrier', async () => {
  for (const stage of ['begin', 'finalize'] as const) {
    const c = createCollector('generic-suite-integration-' + stage)
    c.api.beforeAll(() => {}, 5)
    c.api.test('one', () => {})
    const result = await runCollected(c.close(), options(), () => {}, {
      beginHook: () =>
        stage === 'begin'
          ? new Promise<never>(() => {})
          : {
              finalize: () => new Promise<void>(() => {}),
              dispose: async () => {},
            },
      setActiveHook: () => {},
    })
    expect(result.errors).toHaveLength(1)
    const failure = result.errors[0]
    const error = failure.error as Error
    expect(error.message).toBe('Next test timed out after 5ms.')
    expect(error.stack).toContain('Timeout.<anonymous>')
    expect(failure).not.toHaveProperty('registrationError')
  }
})

it('retains the captured All-hook budget and stack header when its declaration is reused', async () => {
  for (const role of ['beforeAll', 'afterAll'] as const) {
    const c = createCollector('reused-all-registration-' + role)
    function registerReusedAllDeadline() {
      c.api[role](() => new Promise<void>(() => {}), 5)
    }
    registerReusedAllDeadline()
    c.api.test('one', () => {})
    const suite = c.close()
    const hook = suite.hooks[role][0]
    const registration = hook.registrationError
    let previous: Error | undefined
    for (const hookTimeout of [15, 50]) {
      const result = await runCollected(
        suite,
        { ...options(), hookTimeout },
        () => {}
      )
      const error = result.errors[0].error as Error
      expect(error.message).toContain('Hook timed out in 5ms.\n')
      expect(error.stack).toContain(`Error: ${error.message}\n`)
      expect(error.stack).toContain('registerReusedAllDeadline')
      expect(error).not.toBe(previous)
      expect(hook.registrationError).toBe(registration)
      expect(hook.timeout).toBe(5)
      previous = error
    }
  }
})

describe('raw test declaration fn', () => {
  const receiver = () => ({
    concurrent: false,
    only: false,
    skip: false,
    todo: false,
    fails: false,
  })

  it('publishes one readonly root callable and shares its actual helper members', () => {
    const c = createCollector('raw-declaration')
    const t = c.api.test
    expect(Object.getOwnPropertyDescriptor(t, 'fn')).toEqual({
      value: t.fn,
      enumerable: false,
      configurable: false,
      writable: false,
    })
    expect([t.fn.name, t.fn.length]).toEqual(['', 3])
    expect(t.fn).toBe(c.api.it.fn)
    expect((t.fn as any).each).toBe(t.each)
    expect((t.fn as any).for).toBe(t.for)
    expect((t.fn as any).extend).toBe(t.extend)
    expect((t.fn as any).describe).toBe(c.api.describe)
    for (const key of ['skip', 'only', 'todo', 'concurrent', 'fails'])
      expect(t[key].fn).toBeUndefined()
    expect(t.skipIf(false)).toBe(t)
    expect(t.runIf(true)).toBe(t)
    expect(t.extend({ value: 3 }).fn).not.toBe(t.fn)
  })

  it('retains receiver reads, authored option writes and raw public fails values', () => {
    const c = createCollector('raw-receiver')
    const reads: string[] = []
    const context: any = {}
    for (const key of [
      'concurrent',
      'only',
      'skip',
      'todo',
      'fails',
      'ignored',
    ])
      Object.defineProperty(context, key, {
        enumerable: true,
        get() {
          reads.push(`receiver:${key}`)
          return key === 'fails' ? 1 : false
        },
      })
    let concurrent = true
    const opts: any = {}
    Object.defineProperty(opts, 'concurrent', {
      enumerable: true,
      get() {
        reads.push('options:get-concurrent')
        return concurrent
      },
      set(value) {
        reads.push(`options:set-concurrent:${value}`)
        concurrent = value
      },
    })
    expect(c.api.test.fn.call(context, 'raw', opts, () => {})).toBeUndefined()
    expect(reads).toEqual([
      'receiver:concurrent',
      'options:set-concurrent:false',
      'receiver:concurrent',
      'receiver:only',
      'receiver:skip',
      'receiver:todo',
      'receiver:fails',
      'receiver:ignored',
      'options:get-concurrent',
    ])
    expect(c.root.children[0].options.fails).toBe(1)
    expect(concurrent).toBe(false)
    expect(() =>
      c.api.test('ordinary', { concurrent: 1 as any }, () => {})
    ).toThrow('Test concurrent must be a boolean.')
    expect(() =>
      c.api.test('ordinary fails', { fails: 1 as any }, () => {})
    ).toThrow('Test fails must be a boolean.')
    expect(c.root.children).toHaveLength(1)
  })

  it('does not implicitly bind the extended template to an explicit raw receiver', async () => {
    const c = createCollector('raw-fixtures')
    const observed: unknown[] = []
    const extended = c.api.test.extend({ value: 3 })
    extended.fn.call(receiver(), 'raw', {}, ({ value }) => {
      observed.push(value)
    })
    extended('ordinary', ({ value }) => {
      observed.push(value)
    })
    const result = await run(c)
    expect(result.cases.map((c) => c.status)).toEqual(['passed', 'passed'])
    expect(observed).toEqual([undefined, 3])
  })

  it('requires an actual chain receiver for the shared parameter and fixture helpers', () => {
    const c = createCollector('raw-members')
    const raw = c.api.test.fn as any
    for (const key of ['each', 'for'])
      expect(() => raw[key]([1])).toThrow(
        "Cannot read properties of undefined (reading 'withContext')"
      )
    for (const key of ['extend', 'override'])
      expect(() => raw[key]({ value: 1 })).toThrow(
        "Cannot read properties of undefined (reading 'getFixtures')"
      )
    raw.each.call(c.api.test.skip, [1])('skipped %i', () => {})
    expect(c.root.children.map((c) => [c.name, c.mode])).toEqual([
      ['skipped 1', 'skip'],
    ])
  })

  it('dispatches held raw declarations to the live collector without borrowing a closed scope', () => {
    let active: ReturnType<typeof createCollector> | undefined
    const first = createCollector('first', { getActiveCollector: () => active })
    const held = first.api.test.fn
    first.close()
    const second = createCollector('second')
    active = second
    held.call(receiver(), 'second declaration', {}, () => {})
    expect(first.root.children).toHaveLength(0)
    expect(second.root.children.map((c) => c.name)).toEqual([
      'second declaration',
    ])
    const late: Error[] = []
    const scope = createAsyncScope(
      { kind: 'collection', context: { id: 'old', name: 'old' } },
      (error) => late.push(error)
    )
    scope.close()
    let caught: unknown
    scope.run(() => {
      try {
        held.call(receiver(), 'late', {}, () => {})
      } catch (error) {
        caught = error
      }
    })
    expect(caught).toBe(late[0])
    expect(late[0].message).toContain('closed collection scope "old"')
    expect(second.root.children).toHaveLength(1)
  })

  it('keeps a cached raw suite alias subject to its originating collection scope', () => {
    let active: ReturnType<typeof createCollector> | undefined
    const first = createCollector('first alias', {
      getActiveCollector: () => active,
    })
    const heldAlias = (first.api.test.fn as any).describe
    first.close()
    const second = createCollector('second alias')
    active = second
    heldAlias('live suite', () => second.api.test('child', () => {}))
    expect(first.root.children).toHaveLength(0)
    expect(second.root.children.map((child) => child.name)).toEqual([
      'live suite',
    ])
    const late: Error[] = []
    const scope = createAsyncScope(
      { kind: 'collection', context: { id: 'old-alias', name: 'old alias' } },
      (error) => late.push(error)
    )
    scope.close()
    let caught: unknown
    scope.run(() => {
      try {
        heldAlias('late suite', () => second.api.test('late child', () => {}))
      } catch (error) {
        caught = error
      }
    })
    expect(caught).toBe(late[0])
    expect(late[0].message).toContain('closed collection scope "old alias"')
    expect(second.root.children).toHaveLength(1)
  })
})

describe('raw suite declaration collectors', () => {
  const flags = () => ({
    concurrent: false,
    only: false,
    skip: false,
    todo: false,
    shuffle: false,
  })

  it('defers its real factory and retains the public collector surface', async () => {
    const c = createCollector('raw-suite')
    const events: unknown[] = []
    const api = c.api.describe.fn.call(flags(), 'suite', {}, (provided) => {
      events.push(['factory', provided === api.test])
      provided('child', () => {
        events.push(['body'])
      })
    })
    expect(Object.keys(api)).toEqual([
      'type',
      'name',
      'mode',
      'suite',
      'options',
      'test',
      'file',
      'tasks',
      'collect',
      'task',
      'clear',
      'on',
    ])
    expect([c.api.describe.fn.name, c.api.describe.fn.length]).toEqual([
      'suiteFn',
      3,
    ])
    expect(c.api.describe.fn).toBe(c.api.suite.fn)
    expect(events).toEqual([])
    expect(api.tasks).toHaveLength(0)
    await c.settle()
    expect(events).toEqual([['factory', true]])
    expect(api.tasks.map((task) => task.name)).toEqual(['child'])
    const result = await run(c)
    expect(result.cases.map((test) => test.status)).toEqual(['passed'])
    expect(events).toEqual([['factory', true], ['body']])
  })

  it('reuses the actual task returned by a live factory and registers real hooks', async () => {
    const c = createCollector('raw-task')
    const events: unknown[] = []
    let handle: unknown
    const api = c.api.describe.fn.call(flags(), 'suite', {}, () => {
      handle = api.task('child', {
        handler(context) {
          expect(context.task).toBe(handle)
          expect((handle as any).context).toBe(context)
          events.push('body')
        },
      })
      expect(
        Object.getOwnPropertyDescriptor(handle, 'context')!.enumerable
      ).toBe(false)
      expect(api.tasks[0]).toBe(handle)
    })
    api.on('beforeAll', (suite) => {
      events.push(['beforeAll', suite.name])
    })
    api.on('beforeEach', (context, suite) => {
      events.push(['beforeEach', context.task.name, suite.name])
    })
    api.on('afterEach', (context, suite) => {
      events.push(['afterEach', context.task.name, suite.name])
    })
    api.on('afterAll', (suite) => {
      events.push(['afterAll', suite.name])
    })
    await c.settle()
    const result = await run(c)
    expect(result.cases.map((test) => test.status)).toEqual(['passed'])
    expect(events).toEqual([
      ['beforeAll', 'suite'],
      ['beforeEach', 'child', 'suite'],
      'body',
      ['afterEach', 'child', 'suite'],
      ['afterAll', 'suite'],
    ])
  })

  it('requires a file before collecting and does not let disposed methods borrow a new owner', async () => {
    const c = createCollector('raw-owner')
    let invoked = 0
    const api = c.api.describe.fn.call(flags(), 'suite', {}, (provided) => {
      invoked++
      provided('child', () => {})
    })
    await expect(api.collect(undefined as any)).rejects.toThrow(
      'File is required to collect tasks.'
    )
    expect(invoked).toBe(0)
    await c.settle()
    expect(invoked).toBe(1)
    c.close()
    expect(() => api.task('late', { handler() {} })).toThrow(
      'Test collection has already closed.'
    )
    expect(() => api.clear()).toThrow('Test collection has already closed.')
    expect(() => api.on('beforeEach', () => {})).toThrow(
      'Test collection has already closed.'
    )
    await expect(api.collect(api.file)).rejects.toThrow(
      'Test collection has already closed.'
    )
    expect(invoked).toBe(1)
  })
})

describe('retained body deadlines within one actual test', () => {
  it.each(['retry', 'afterAll'] as const)(
    'retains a handled predecessor rejection joined by %s without inventing an unhandled error',
    async (releasePhase) => {
      const c = createCollector(`handled-body-${releasePhase}`)
      const trace: string[] = []
      const rejection = new Error('observed original body rejection')
      let release!: () => void
      let joined!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const join = new Promise<void>((resolve) => {
        joined = resolve
      })
      let turns = 0
      c.api.test('own', { timeout: 15, retry: 1 }, async (context) => {
        const turn = turns++
        trace.push(`body ${turn}`)
        context.onTestFinished(() => {
          trace.push(`finished ${turn}`)
        })
        if (turn === 0) {
          try {
            await gate
            trace.push('old body rejected')
            throw rejection
          } finally {
            joined()
          }
        }
        if (releasePhase === 'retry') {
          release()
          await join
        }
      })
      c.api.afterAll(async () => {
        trace.push('afterAll')
        if (releasePhase === 'afterAll') {
          release()
          await join
          trace.push('afterAll joined')
        }
      })
      const result = await run(c)
      expect(result.cases.map(({ status }) => status)).toEqual([
        'failed',
        'passed',
      ])
      expect(result.cases[0].errors[0].error).toHaveProperty(
        'message',
        expect.stringMatching(/^Test timed out in 15ms\./)
      )
      expect(result.errors).toEqual([])
      expect(result.interrupted).toBe(false)
      expect(trace).toEqual(
        releasePhase === 'retry'
          ? [
              'body 0',
              'finished 0',
              'body 1',
              'old body rejected',
              'finished 1',
              'afterAll',
            ]
          : [
              'body 0',
              'finished 0',
              'body 1',
              'finished 1',
              'afterAll',
              'old body rejected',
              'afterAll joined',
            ]
      )
    }
  )

  it('joins its pending predecessor only after original teardown and onCaseEnd close', async () => {
    const c = createCollector('pending-body-retry')
    const trace: string[] = []
    const contexts: unknown[] = []
    const signals: AbortSignal[] = []
    let releaseBody!: () => void
    let bodyJoined!: () => void
    let firstEnded!: () => void
    let releaseEnd!: () => void
    const bodyGate = new Promise<void>((resolve) => {
      releaseBody = resolve
    })
    const bodyJoin = new Promise<void>((resolve) => {
      bodyJoined = resolve
    })
    const ended = new Promise<void>((resolve) => {
      firstEnded = resolve
    })
    const endGate = new Promise<void>((resolve) => {
      releaseEnd = resolve
    })
    let turns = 0
    c.api.test('own', { timeout: 15, retry: 1 }, async (context) => {
      const turn = turns++
      trace.push(`body ${turn}`)
      contexts.push(context)
      signals.push(context.signal)
      context.onTestFinished(() => {
        trace.push(`finished ${turn}`)
      })
      if (turn === 0) {
        await bodyGate
        trace.push('settled 0')
        bodyJoined()
      } else {
        releaseBody()
        await bodyJoin
      }
    })
    c.api.test('following', () => {
      trace.push('following')
    })
    let first = true
    const running = runCollected(
      c.close(),
      {
        ...options(),
        async onCaseEnd(result) {
          if (!first || result.name !== 'own') return
          first = false
          trace.push('onCaseEnd 0')
          firstEnded()
          await endGate
          trace.push('closed onCaseEnd 0')
        },
      },
      () => {}
    )
    try {
      await ended
      expect(trace).toEqual(['body 0', 'finished 0', 'onCaseEnd 0'])
      expect(turns).toBe(1)
    } finally {
      releaseEnd()
    }
    const result = await running
    expect(result.cases.map(({ status }) => status)).toEqual([
      'failed',
      'passed',
      'passed',
    ])
    expect(result.errors).toEqual([])
    expect(result.interrupted).toBe(false)
    expect(trace).toEqual([
      'body 0',
      'finished 0',
      'onCaseEnd 0',
      'closed onCaseEnd 0',
      'body 1',
      'settled 0',
      'finished 1',
      'following',
    ])
    expect(new Set(contexts).size).toBe(1)
    expect(new Set(signals).size).toBe(1)
    expect((signals[0].reason as Error).message).toBe(
      'Test timed out in 15ms.\nIf this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".'
    )
  })

  it.each([false, true])(
    'joins at actual afterAll close while preserving a cancelled following case: %s',
    async (following) => {
      const c = createCollector('pending-body-file-close')
      const trace: string[] = []
      let release!: () => void
      let joined!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const join = new Promise<void>((resolve) => {
        joined = resolve
      })
      let turns = 0
      c.api.test('own', { timeout: 15, retry: 1 }, async () => {
        const turn = turns++
        trace.push(`body ${turn}`)
        if (turn === 0) {
          await gate
          trace.push('settled 0')
          joined()
        }
      })
      if (following)
        c.api.test('following', () => {
          throw new Error('the old body is still pending')
        })
      c.api.afterAll(async () => {
        trace.push('afterAll')
        release()
        await join
        trace.push('afterAll joined')
      })
      const result = await run(c)
      expect(result.cases.map(({ status }) => status)).toEqual(
        following ? ['failed', 'passed', 'cancelled'] : ['failed', 'passed']
      )
      expect(result.errors).toEqual([])
      expect(result.interrupted).toBe(following)
      expect(trace).toEqual([
        'body 0',
        'body 1',
        'afterAll',
        'settled 0',
        'afterAll joined',
      ])
    }
  )

  it.each(['cleanup', 'cancellation'] as const)(
    'retains the %s veto over a pending same-test retry',
    async (kind) => {
      const c = createCollector(`pending-body-${kind}`)
      let releaseBody!: () => void
      let bodyJoined!: () => void
      let releaseCleanup!: () => void
      let cleanupJoined!: () => void
      const bodyGate = new Promise<void>((resolve) => {
        releaseBody = resolve
      })
      const bodyJoin = new Promise<void>((resolve) => {
        bodyJoined = resolve
      })
      const cleanupGate = new Promise<void>((resolve) => {
        releaseCleanup = resolve
      })
      const cleanupJoin = new Promise<void>((resolve) => {
        cleanupJoined = resolve
      })
      const controller = new AbortController()
      let turns = 0
      c.api.test(
        'own',
        { timeout: 15, retry: 1 },
        async ({ onTestFinished }) => {
          turns++
          onTestFinished(async () => {
            if (kind === 'cancellation') {
              controller.abort(new Error('explicit run cancellation'))
              cleanupJoined()
              return
            }
            try {
              await cleanupGate
            } finally {
              cleanupJoined()
            }
          }, 5)
          try {
            await bodyGate
          } finally {
            bodyJoined()
          }
        }
      )
      c.api.test('following', () => {
        throw new Error('the veto must stop following work')
      })
      try {
        const result = await runCollected(
          c.close(),
          { ...options(), signal: controller.signal },
          () => {}
        )
        expect(turns).toBe(1)
        expect(result.cases.map(({ status }) => status)).toEqual([
          'failed',
          'cancelled',
        ])
        expect(result.interrupted).toBe(true)
      } finally {
        releaseBody()
        releaseCleanup()
        await Promise.all([bodyJoin, cleanupJoin])
      }
    }
  )
})

it('closes public selectors at abrupt logical exits after existing owned cleanup', async () => {
  const c = createCollector('public-abrupt')
  const failure = new Error('actual case callback failure')
  const transitions: (string | undefined)[] = []
  let current: Task | undefined
  let cleanups = 0
  c.api.afterEach(() => {
    cleanups++
  })
  c.api.test('ordinary', () => {})
  const pending = runCollected(
    c.close(),
    {
      ...options(),
      setCurrentTest(task) {
        transitions.push(task?.name)
      },
      setCurrentTask(task) {
        current = task
      },
      onCaseEnd() {
        throw failure
      },
    },
    () => {}
  )
  await expect(pending).rejects.toBe(failure)
  expect(cleanups).toBe(1)
  expect(transitions).toEqual(['ordinary', undefined])
  expect(current?.id).toBe(c.root.id)
})

it('keeps statically skipped concurrent tasks from clearing a real public selection', async () => {
  const c = createCollector('public-unstarted')
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let current: Task | undefined
  const skipped: (string | undefined)[] = []
  c.api.test.concurrent('first', async () => {
    await gate
  })
  c.api.test.concurrent.skip('unstarted', () => {
    throw new Error('must skip')
  })
  c.api.test.concurrent('second', () => {
    release()
  })
  const result = await runCollected(
    c.close(),
    {
      ...options(),
      setCurrentTest(task) {
        current = task
      },
      onCaseResult(task) {
        if (task.name === 'unstarted') skipped.push(current?.name)
        else expect(current).toBeUndefined()
      },
    },
    () => {}
  )
  expect(skipped).toEqual(['second'])
  expect(result.errors).toEqual([])
})

it('runs the private try preparation after aroundEach and before setup on retries', async () => {
  const c = createCollector('private-try-order')
  const rows: string[] = []
  let attempts = 0
  c.api.aroundEach(async (runTest) => {
    rows.push('around-before')
    await runTest()
    rows.push('around-after')
  })
  c.api.beforeEach(() => {
    rows.push('beforeEach')
  })
  c.api.test('retries', { retry: 1 }, () => {
    rows.push('body')
    if (++attempts === 1) throw new Error('retry this case')
  })
  const result = await runCollected(
    c.close(),
    {
      ...options(),
      beginAttempt() {
        rows.push('scope')
        return {
          beforeTry() {
            rows.push('prepare')
          },
          async finalize() {},
          async dispose() {},
        }
      },
    },
    () => {}
  )
  expect(result.errors).toEqual([])
  expect(rows).toEqual(
    Array.from({ length: 2 }, () => [
      'scope',
      'around-before',
      'prepare',
      'beforeEach',
      'body',
      'around-after',
    ]).flat()
  )
})

it('keeps private try preparation failures inside actual cleanup and reporting', async () => {
  const c = createCollector('private-try-failure')
  const failure = new Error('actual private try preparation failure')
  const rows: unknown[] = []
  c.api.beforeEach(() => {
    rows.push('must not set up')
  })
  c.api.afterEach(() => {
    rows.push('afterEach')
  })
  c.api.test('not invoked', () => {
    rows.push('must not invoke body')
  })
  const result = await runCollected(
    c.close(),
    {
      ...options(),
      beginAttempt() {
        return {
          beforeTry() {
            throw failure
          },
          async finishTest(failed) {
            rows.push(['finished', failed])
          },
          async finalize() {
            rows.push('finalized')
          },
          async dispose() {
            rows.push('disposed')
          },
        }
      },
    },
    () => {}
  )
  expect(result.errors).toEqual([])
  expect(result.cases).toHaveLength(1)
  expect(result.cases[0].status).toBe('failed')
  expect(result.cases[0].errors).toEqual([{ phase: 'runtime', error: failure }])
  expect(rows).toEqual([
    ['finished', true],
    'afterEach',
    'finalized',
    'disposed',
  ])
})

it.each(['pass', 'failure', 'retry'] as const)(
  'admits compiler work only after the complete ordinary %s attempt settles',
  async (outcome) => {
    const scopes: typeof import('next/dist/experimental/testing/runner/async-context') = require('next/dist/experimental/testing/runner/async-context')
    const c = createCollector('compiler-completion')
    const origins: ReturnType<typeof scopes.captureCompilerAsyncScope>[] = []
    const contexts: unknown[] = []
    const events: string[] = []
    c.api.test('case', { retry: outcome === 'retry' ? 1 : 0 }, () => {
      origins.push(scopes.captureCompilerAsyncScope())
      events.push('body')
      if (
        outcome === 'failure' ||
        (outcome === 'retry' && origins.length === 1)
      )
        throw new Error('ordinary authored failure')
    })
    const result = await runCollected(
      c.close(),
      {
        ...options(),
        beginAttempt(context) {
          contexts.push(context)
          return {
            async finalize() {
              events.push('finalize')
            },
            async dispose() {
              events.push('dispose')
            },
          }
        },
      },
      () => {}
    )
    expect(result.cases.map((test) => test.status)).toEqual(
      outcome === 'retry'
        ? ['failed', 'passed']
        : [outcome === 'failure' ? 'failed' : 'passed']
    )
    expect(events).toEqual(
      origins.flatMap(() => ['body', 'finalize', 'dispose'])
    )
    origins.forEach((origin, index) => {
      origin.run(() => {
        expect(scopes.peekOriginatingScope()?.context).toBe(contexts[index])
        expect(scopes.peekOriginatingScope()?.closed).toBe(true)
        expect(() => scopes.assertScopeActive()).toThrow('closed attempt scope')
      })
    })
  }
)

it.each(['skip', 'user-cancel', 'setup-error', 'disposal-abort'] as const)(
  'does not mark a %s attempt as an ordinary compiler completion',
  async (outcome) => {
    const scopes: typeof import('next/dist/experimental/testing/runner/async-context') = require('next/dist/experimental/testing/runner/async-context')
    const {
      getTaskContext,
    }: typeof import('next/dist/experimental/testing/runner/tasks') = require('next/dist/experimental/testing/runner/tasks')
    const c = createCollector('compiler-incomplete')
    const cancellation = new AbortController()
    let origin: ReturnType<typeof scopes.captureCompilerAsyncScope> | undefined
    c.api.test('case', ({ skip }) => {
      origin = scopes.captureCompilerAsyncScope()
      if (outcome === 'skip') skip()
      if (outcome === 'user-cancel')
        cancellation.abort(new Error('user cancel'))
    })
    const result = await runCollected(
      c.close(),
      {
        ...options(),
        userCancelSignal: cancellation.signal,
        beginAttempt(context) {
          if (outcome === 'setup-error') {
            origin = scopes.captureCompilerAsyncScope()
            throw new Error('integration setup failure')
          }
          return {
            async finalize() {},
            async dispose() {
              if (outcome === 'disposal-abort')
                getTaskContext(context.task).controller.abort(
                  new Error('internal resource disposal')
                )
            },
          }
        },
      },
      () => {}
    )
    expect(origin).toBeDefined()
    expect(result.cases).toHaveLength(1)
    expect(() => origin!.run(() => {})).toThrow('closed attempt scope')
    expect(result.cases[0].status).toBe(
      outcome === 'setup-error'
        ? 'failed'
        : outcome === 'disposal-abort'
          ? 'cancelled'
          : 'skipped'
    )
  }
)

it('serializes native and receiver-sensitive stack getters without mutating the raw failure', async () => {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'task-error-stack-accessors.cjs')],
    { timeout: 15000 }
  )
  expect(stderr).toBe('')
  expect(JSON.parse(stdout)).toEqual({
    comparisons: 10,
    nativeEmptyNonemptyUndefined: true,
    originalGetterReceiverAndReadCounts: true,
    weakMapAndThrowingGetters: true,
    serializerWritesStayLocal: true,
    originalDescriptorsValuesAndCausePreserved: true,
    capturedAccessorInvocation: true,
  })
}, 20000)

it('preserves original error getter receivers and clone-local serializer writes', async () => {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'task-error-accessors.cjs')],
    { timeout: 15000 }
  )
  expect(stderr).toBe('')
  expect(JSON.parse(stdout)).toEqual({
    comparisons: 22,
    untouchedOwnAndInheritedGetterReceivers: true,
    exactReadCountOrderAndThrowUndefined: true,
    ordinaryMethodDataPrototypeAndKeyOrder: true,
    nativeStackAndDescriptorMutation: true,
    setterWritesStayLocal: true,
    directSelfAndCauseCycles: true,
    capturedNewIntrinsics: true,
    postSetterGetterReceiverParityNotClaimed: true,
  })
}, 20000)

it('preserves original error aliases through the private serializer cache', async () => {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'task-error-aliases.cjs')],
    { timeout: 15000 }
  )
  expect(stderr).toBe('')
  expect(JSON.parse(stdout)).toEqual({
    comparisons: 19,
    selfAndNestedAliases: 12,
    scalarReceiversAndExactGetterCounts: true,
    ordinaryAccessorReceiversRetained: true,
    primitivesNullCauseAndSharedArray: true,
    fallbackAndThrowUndefined: true,
    originalDescriptorsAndDataHeld: true,
    publicProcessErrorUnchanged: true,
  })
}, 20000)

describe('normal SuiteAPI collector ownership', () => {
  it('returns the real collector before starting nested asynchronous factories', async () => {
    const c = createCollector('normal-suite-return')
    const trace: unknown[] = []
    let nested: ReturnType<typeof c.api.describe> | undefined
    const outer = c.api.describe('outer', async (provided) => {
      trace.push(['outer', provided === outer.test])
      await Promise.resolve()
      provided('first', () => {})
      nested = c.api.describe('inner', (child) => {
        trace.push(['inner', child === nested!.test])
        child('second', () => {})
      })
    })
    expect(trace).toEqual([])
    expect(Object.keys(outer)).toEqual([
      'type',
      'name',
      'mode',
      'suite',
      'options',
      'test',
      'file',
      'tasks',
      'collect',
      'task',
      'clear',
      'on',
    ])
    expect(outer.tasks).toEqual([])
    await c.settle()
    expect(trace).toEqual([
      ['outer', true],
      ['inner', true],
    ])
    expect(outer.tasks[1]).toBe(nested)
    expect(nested!.suite!.suite).toBe(outer.suite)
    expect(nested!.file).toBe(outer.file)
    const result = await run(c)
    expect(result.cases.map(({ status }) => status)).toEqual([
      'passed',
      'passed',
    ])
  })

  it('retains manual repeated collect and the same actual suite and test identities', async () => {
    const c = createCollector('normal-suite-manual')
    let calls = 0
    const collector = c.api.describe('manual', (provided) => {
      expect(provided).toBe(collector.test)
      provided(`child ${++calls}`, () => {})
    })
    const first = await collector.collect(collector.file)
    const second = await collector.collect(collector.file)
    expect(second).toBe(first)
    expect(first).toBe(collector.suite)
    expect(collector.tasks.map(({ name }) => name)).toEqual([
      'child 1',
      'child 2',
    ])
    await c.settle()
    expect(calls).toBe(3)
    expect(collector.tasks.map(({ name }) => name)).toEqual([
      'child 1',
      'child 2',
      'child 3',
    ])
    expect((await run(c)).cases.map(({ status }) => status)).toEqual([
      'passed',
      'passed',
      'passed',
    ])
  })

  it.each([
    undefined,
    null,
    false,
    0,
    '',
    new Error('actual normal factory rejection'),
  ])(
    'stops starting later factories after an actual rejection: %p',
    async (failure) => {
      const c = createCollector('normal-suite-stop', {
        observeSettledDeclarationCoverage: true,
      })
      const trace: string[] = []
      const first = c.api.describe('first', async () => {
        trace.push('first entered')
        await Promise.resolve()
        trace.push('first rejected')
        throw failure
      })
      c.api.describe('second', async () => {
        trace.push('second entered')
        throw failure
      })
      const returned: unknown[] = []
      await c.settle().then(
        () => returned.push('fulfilled'),
        (error) => returned.push(error)
      )
      expect(returned).toEqual([failure])
      expect(trace).toEqual(['first entered', 'first rejected'])
      const observed = c.getCompletedDeclarationCoverageFailure!()
      expect(observed!.error).toBe(failure)
      expect(observed!.occurrences).toHaveLength(1)
      expect(observed!.occurrences[0].suite).toBe(c.root.children[0])
      expect(observed!.occurrences[0].reason).toBe(failure)
      expect(first.tasks).toEqual([])
      await c.settle().then(
        () => returned.push('fulfilled'),
        (error) => returned.push(error)
      )
      expect(returned).toEqual([failure, failure])
      expect(trace).toEqual(['first entered', 'first rejected'])
      expect(c.getCompletedDeclarationCoverageFailure!()).toBeUndefined()
      c.close()
    }
  )

  it('withholds declaration coverage certification after an actual manual collect invocation', async () => {
    const c = createCollector('normal-suite-manual-coverage', {
      observeSettledDeclarationCoverage: true,
    })
    const failure = new Error('manual and automatic actual rejection')
    let calls = 0
    const collector = c.api.describe('owned', async () => {
      calls++
      throw failure
    })
    await expect(collector.collect(collector.file)).rejects.toBe(failure)
    await expect(c.settle()).rejects.toBe(failure)
    expect(calls).toBe(2)
    expect(c.getCompletedDeclarationCoverageFailure!()).toBeUndefined()
    c.close()
  })
})

it('rejects a completed public annotation context with its actual finished task state', async () => {
  const c = createCollector('finished-annotation')
  let retained!: import('next/dist/experimental/testing/runner/collector').TestContext
  const lateFailures: unknown[] = []
  c.api.test('completed task', (context) => {
    retained = context
  })
  c.api.test('later caller', async () => {
    let rejection: unknown
    try {
      await retained.annotate('too late')
    } catch (error) {
      rejection = error
    }
    expect(rejection).toHaveProperty(
      'message',
      'Cannot annotate tests outside of the test run. The test "completed task" finished running with the "pass" state already.'
    )
  })
  const result = await runCollected(
    c.close(),
    { ...options(), onLateFailure: (error) => lateFailures.push(error) },
    () => {}
  )
  expect(result.cases.map((test) => test.status)).toEqual(['passed', 'passed'])
  expect(retained.task.annotations).toEqual([])
  expect(lateFailures).toEqual([])
})

describe('actual reporter suite and hook producers', () => {
  it('observes inherited hook groups once per retry with canonical task identity', async () => {
    const c = createCollector('reporter-hook-retry')
    let attempts = 0
    let returnedCleanups = 0
    const tasks = new Map<string, Task>()
    const hooks: [string, string, string][] = []
    const ready: string[] = []
    c.api.beforeEach(() => {})
    c.api.afterEach(() => {})
    c.api.describe('nested', () => {
      c.api.beforeAll(() => {})
      c.api.afterAll(() => {})
      c.api.beforeEach(() => () => {
        returnedCleanups++
      })
      c.api.beforeEach(() => {})
      c.api.afterEach(() => {})
      c.api.test('retry', { retry: 1 }, () => {
        if (++attempts === 1) throw new Error('retry once')
      })
    })
    await c.settle()
    const result = await runCollected(
      c.close(),
      {
        ...options(),
        onCollected(file) {
          function visit(task: Task) {
            tasks.set(task.id, task)
            if (task.type === 'suite') task.tasks.forEach(visit)
          }
          visit(file)
        },
        onSuiteReady(task) {
          expect(tasks.get(task.id)).toBe(task)
          ready.push(task.name)
        },
        onReporterHookOccurrence(task, hook, event) {
          expect(tasks.get(task.id)).toBe(task)
          hooks.push([event, task.name, hook])
        },
      },
      () => {}
    )
    expect(result.errors).toEqual([])
    expect(result.cases.map((item) => item.status)).toEqual([
      'failed',
      'passed',
    ])
    expect(ready).toEqual(['nested'])
    expect(returnedCleanups).toBe(2)
    expect(
      [...tasks.values()].find((task) => task.name === 'nested')!.result!.hooks
    ).toEqual({ beforeAll: 'pass', afterAll: 'pass' })
    expect(
      [...tasks.values()].find((task) => task.name === 'retry')!.result!.hooks
    ).toEqual({ beforeEach: 'pass', afterEach: 'pass' })
    expect(hooks.filter((row) => row[1] === 'nested')).toEqual([
      ['hook-start', 'nested', 'beforeAll'],
      ['hook-end', 'nested', 'beforeAll'],
      ['hook-start', 'nested', 'afterAll'],
      ['hook-end', 'nested', 'afterAll'],
    ])
    const attemptHooks = [
      ['hook-start', 'retry', 'beforeEach'],
      ['hook-end', 'retry', 'beforeEach'],
      ['hook-start', 'retry', 'beforeEach'],
      ['hook-end', 'retry', 'beforeEach'],
      ['hook-start', 'retry', 'afterEach'],
      ['hook-end', 'retry', 'afterEach'],
      ['hook-start', 'retry', 'afterEach'],
      ['hook-end', 'retry', 'afterEach'],
    ]
    expect(hooks.filter((row) => row[1] === 'retry')).toEqual([
      ...attemptHooks,
      ...attemptHooks,
    ])
  })

  it.each(['stack', 'list', 'parallel'] as const)(
    'retains an unmatched start when an actual %s hook group rejects',
    async (sequence) => {
      const c = createCollector(`reporter-hook-failure-${sequence}`)
      const hooks: [string, string][] = []
      let ranBody = false
      let actualTask: Task | undefined
      c.api.beforeEach(() => {})
      c.api.beforeEach(() => {
        throw new Error('setup rejected')
      })
      c.api.afterEach(() => {})
      c.api.test('blocked body', () => {
        ranBody = true
      })
      const result = await runCollected(
        c.close(),
        {
          ...options(),
          sequence: { hooks: sequence },
          onReporterHookOccurrence(task, hook, event) {
            actualTask = task
            hooks.push([event, hook])
          },
        },
        () => {}
      )
      expect(ranBody).toBe(false)
      expect(actualTask!.result!.hooks).toEqual({
        beforeEach: 'run',
        afterEach: 'pass',
      })
      expect(result.cases[0].status).toBe('failed')
      expect(hooks).toEqual([
        ['hook-start', 'beforeEach'],
        ['hook-start', 'afterEach'],
        ['hook-end', 'afterEach'],
      ])
    }
  )

  it('retains skipped suite preparation without inventing blocked descendant preparation', async () => {
    const c = createCollector('reporter-suite-preparation')
    const ready: string[] = []
    const hooks: [string, string, string][] = []
    c.api.describe.skip('skipped', () => {
      c.api.beforeAll(() => {
        throw new Error('must not run')
      })
      c.api.describe('skipped child', () => c.api.test('skip', () => {}))
    })
    c.api.describe('blocked', () => {
      c.api.beforeAll(() => {
        throw new Error('beforeAll rejected')
      })
      c.api.afterAll(() => {})
      c.api.describe('unprepared child', () => c.api.test('blocked', () => {}))
    })
    await c.settle()
    const result = await runCollected(
      c.close(),
      {
        ...options(),
        onSuiteReady(task) {
          ready.push(task.name)
        },
        onReporterHookOccurrence(task, hook, event) {
          hooks.push([event, task.name, hook])
        },
      },
      () => {}
    )
    expect(ready).toEqual(['skipped', 'skipped child', 'blocked'])
    expect(hooks).toEqual([
      ['hook-start', 'blocked', 'beforeAll'],
      ['hook-start', 'blocked', 'afterAll'],
      ['hook-end', 'blocked', 'afterAll'],
    ])
    expect(result.cases.map((item) => item.status)).toEqual([
      'skipped',
      'skipped',
    ])
  })

  it('keeps actual hook task state independent of reporter observation', async () => {
    const each = createCollector('unobserved-each-hooks')
    each.api.beforeEach(() => {
      throw new Error('beforeEach rejected')
    })
    each.api.afterEach(() => {})
    each.api.test('blocked', () => {
      throw new Error('must not run')
    })
    let eachTask!: Task
    await runCollected(
      each.close(),
      {
        ...options(),
        onCollected(file) {
          eachTask = file.tasks[0]
        },
      },
      () => {}
    )
    expect(eachTask.result!.hooks).toEqual({
      beforeEach: 'run',
      afterEach: 'pass',
    })
    const all = createCollector('unobserved-all-hooks')
    all.api.describe('blocked suite', () => {
      all.api.beforeAll(() => {
        throw new Error('beforeAll rejected')
      })
      all.api.afterAll(() => {})
      all.api.test('blocked', () => {})
    })
    await all.settle()
    let allTask!: Task
    await runCollected(
      all.close(),
      {
        ...options(),
        onCollected(file) {
          allTask = file.tasks[0]
        },
      },
      () => {}
    )
    expect(allTask.result!.hooks).toEqual({
      beforeAll: 'run',
      afterAll: 'pass',
    })
  })

  it('batches actual occurrences without blocking execution and joins pending sends at completion', async () => {
    type Updates =
      typeof import('next/dist/experimental/testing/reporting/task-updates')
    let createUpdates!: Updates['createReporterTaskUpdates']
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000)
    jest.isolateModules(() => {
      createUpdates =
        require('next/dist/experimental/testing/reporting/task-updates').createReporterTaskUpdates
    })
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const published: import('next/dist/experimental/testing/reporting/task-updates').ReporterTaskUpdate[] =
      []
    const updates = createUpdates({
      captureSuiteEvents: true,
      captureHookEvents: true,
      onUpdate(update) {
        published.push(update)
        return held
      },
    })
    const c = createCollector('reporter-batch-file')
    let ranBody = false
    c.api.describe('suite', () => {
      c.api.beforeEach(() => {})
      c.api.test('body', () => {
        ranBody = true
      })
    })
    await c.settle()
    let drain: Promise<void> | undefined
    try {
      const result = await runCollected(
        c.close(),
        {
          ...options(),
          onCollected: updates.collected,
          onSuiteReady: updates.suiteReady,
          onReporterHookOccurrence: updates.hookOccurrence,
          onCaseReady: updates.caseReady,
          onCaseResult: updates.caseResult,
          onSuiteEnd(_result, task) {
            updates.suiteEnd(task)
          },
        },
        () => {}
      )
      expect(ranBody).toBe(true)
      expect(result.cases[0].status).toBe('passed')
      expect(published).toHaveLength(1)
      let drained = false
      drain = updates.finish().then(() => {
        drained = true
      })
      await Promise.resolve()
      expect(drained).toBe(false)
      expect(published).toHaveLength(2)
      const last = published[1]
      if (last.kind) throw new Error('Expected actual collected task graph.')
      expect(last.taskTree.tasks![0].result?.state).toBe('pass')
      expect(last.taskEvents!.map((item) => item.event)).toEqual([
        'suite-ready',
        'case-ready',
        'hook-start',
        'hook-end',
        'case-result',
        'suite-result',
      ])
      expect(last.caseEvents!.map((item) => item.event)).toEqual([
        'ready',
        'result',
      ])
    } finally {
      release()
      await drain
      updates.dispose()
      now.mockRestore()
    }
  })
})
