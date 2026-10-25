import { createAttemptUtilities } from 'next/dist/experimental/testing/assertions/utilities'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'

it('runs the assertion conformance cases in a fresh realm', async () => {
  // Jest owns a nonconfigurable matcher symbol in its realm. The actual Next
  // execution host likewise gives the compatibility API a fresh process.
  const { stdout } = await promisify(execFile)(process.execPath, [
    '--test-reporter=tap',
    '--import',
    require.resolve('tsx'),
    join(__dirname, 'cases.ts'),
  ]).catch((error) => {
    throw new Error([error.message, error.stdout, error.stderr].join('\n'))
  })
  expect(stdout).toContain('# tests 34')
  expect(stdout).toContain('# fail 0')
}, 30000)

it('owns and cancels waitUntil after repeated falsy callbacks', async () => {
  const utilities = createAttemptUtilities(() => {})
  let polled!: () => void
  const repeated = new Promise<void>((resolve) => {
    polled = resolve
  })
  let calls = 0
  const pending = utilities.waitUntil(
    () => {
      if (++calls === 2) polled()
      return false
    },
    { interval: 1, timeout: 5000 }
  )
  // eslint-disable-next-line jest/valid-expect -- Arm cancellation before disposal; the assertion is awaited below.
  const rejected = expect(pending).rejects.toThrow(
    'cancelled during file cleanup'
  )
  try {
    await repeated
  } finally {
    utilities.dispose()
  }
  await rejected
})

it('matches genuine unreachable errors, counts, lifetime and public never types', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [
    '--test-reporter=tap',
    '--import',
    require.resolve('tsx'),
    join(__dirname, 'unreachable-integration.ts'),
  ]).catch((error) => {
    throw new Error([error.message, error.stdout, error.stderr].join('\n'))
  })
  expect(stdout).toContain('# tests 4')
  expect(stdout).toContain('# pass 4')
  expect(stdout).toContain('# fail 0')
}, 30000)

it.each(['browser', 'node'])(
  'preserves %s assertion Promise payloads and present protocol guards',
  async (mode) => {
    const { mkdtemp, readFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const directory = await mkdtemp(
      join(tmpdir(), `next-assertion-then-${mode}-`)
    )
    const output = join(directory, 'observations.json')
    try {
      const { stdout, stderr } = await promisify(execFile)(process.execPath, [
        join(__dirname, 'assertion-then-integration.cjs'),
        process.cwd(),
        mode,
        '-',
        output,
      ]).catch(async (error) => {
        const observations = await readFile(output, 'utf8').catch(() => '')
        throw new Error(
          [error.message, error.stdout, error.stderr, observations].join('\n')
        )
      })
      expect(stderr).toBe('')
      const observations = JSON.parse(await readFile(output, 'utf8'))
      console.log(JSON.stringify({ assertionProtocol: observations, stdout }))
      expect(observations.failure).toBeUndefined()
      expect(observations.mode).toBe(mode)
      expect(observations.rows.length).toBeGreaterThan(0)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
  30000
)

it.each([
  'settled',
  'sync',
  'pending',
  'awaited',
  'returned',
  'caught',
  'fulfilled',
  'unknown',
  'same-error',
  'hook',
  'late',
  'cancel',
  'pending-timeout',
  'default',
])(
  'owns actual native assertion rejection records: %s',
  async (mode) => {
    const { stdout } = await promisify(execFile)(process.execPath, [
      join(__dirname, 'native-rejections.cjs'),
      join(
        require.resolve('next/dist/experimental/testing/runner'),
        '..',
        '..'
      ),
      mode,
    ])
    const value = JSON.parse(stdout)
    expect(value).toEqual({
      mode,
      nativeEvents:
        mode === 'same-error'
          ? 2
          : ['settled', 'unknown', 'late'].includes(mode)
            ? 1
            : 0,
      qualified: ![
        'same-error',
        'unknown',
        'late',
        'hook',
        'cancel',
        'pending-timeout',
      ].includes(mode),
      actualIdentityHeld: true,
      disposedAndReleased: true,
    })
  },
  15000
)

it.each(['hook', 'default', 'same-error', 'fixture', 'cleanup', 'cancel'])(
  'retains actual authored-beforeEach native observation and publication fences: %s',
  async (mode) => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'native-hooks.cjs'),
        join(
          require.resolve('next/dist/experimental/testing/runner'),
          '..',
          '..'
        ),
        mode,
      ],
      { timeout: 20000, encoding: 'utf8' }
    )
    expect(JSON.parse(stdout)).toEqual({
      mode,
      actualNativeEvents:
        mode === 'hook'
          ? 2
          : mode === 'same-error'
            ? 3
            : mode === 'cancel'
              ? 1
              : 0,
      originalPromiseIdentities: true,
      listenerOwnershipHeld: true,
      bodyPublicationRefused: true,
      closedScopeRefused: true,
      disposedAndReleased: true,
    })
  },
  25000
)

it.each([
  'hook',
  'pending',
  'released',
  'default',
  'same-error',
  'duplicate',
  'external',
  'nonhook',
  'cancel',
])(
  'retains native afterEach checkpoints and lifetime fences: %s',
  async (mode) => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'native-after-hooks.cjs'),
        join(
          require.resolve('next/dist/experimental/testing/runner'),
          '..',
          '..'
        ),
        mode,
      ],
      { timeout: 20000, encoding: 'utf8' }
    )
    expect(JSON.parse(stdout)).toEqual({
      mode,
      actualNativeEvents: ['default', 'duplicate', 'nonhook'].includes(mode)
        ? 0
        : mode === 'same-error'
          ? 3
          : mode === 'cancel'
            ? 1
            : 2,
      originalPromiseIdentities: true,
      checkpointForwardingStrict: true,
      pendingLifetimeHeld: true,
      listenerOwnershipHeld: true,
      bodyPublicationRefused: true,
      closedScopeRefused: true,
      disposedAndReleased: true,
    })
  },
  25000
)

it.each([
  'cleanup',
  'pending',
  'released',
  'default',
  'same-error',
  'duplicate',
  'external',
  'false',
  'fixture',
  'listener',
  'suite',
  'body-mixed',
  'cleanup-mixed',
  'cancel',
])(
  'retains returned beforeEach cleanup checkpoints and lifetime fences: %s',
  async (mode) => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'native-cleanup.cjs'),
        join(
          require.resolve('next/dist/experimental/testing/runner'),
          '..',
          '..'
        ),
        mode,
      ],
      { timeout: 20000, encoding: 'utf8' }
    )
    expect(JSON.parse(stdout)).toEqual({
      mode,
      actualNativeEvents: [
        'default',
        'false',
        'duplicate',
        'fixture',
        'listener',
        'suite',
      ].includes(mode)
        ? 0
        : mode === 'same-error'
          ? 3
          : mode === 'cancel'
            ? 1
            : 2,
      originalPromiseIdentities: true,
      checkpointForwardingStrict: true,
      pendingLifetimeHeld: true,
      listenerOwnershipHeld: true,
      bodyPublicationRefused: true,
      closedScopeRefused: true,
      disposedAndReleased: true,
    })
  },
  25000
)

it.each(['disposed', 'native', 'active', 'finalized'])(
  'resumes aroundAll only after actual child disposal with retained native records: %s',
  async (mode) => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'native-around-retained.cjs'),
        join(
          require.resolve('next/dist/experimental/testing/runner'),
          '..',
          '..'
        ),
        mode,
      ],
      { timeout: 20000, encoding: 'utf8' }
    )
    expect(JSON.parse(stdout)).toEqual(
      mode === 'active' || mode === 'finalized'
        ? { mode, actualUnclosedChildRefused: true }
        : {
            mode,
            disposedChildResumed: true,
            closedScopeRefused: true,
            actualNativeEvents: mode === 'native' ? 1 : 0,
            exactRetainedNativeOwner: mode === 'native',
            nativeAfterFileFinish: mode === 'native',
            bodyPublicationRefused: mode === 'native',
          }
    )
  },
  25000
)

it.each(['DEV', 'PROD', 'SSR'] as const)(
  'stubs Node boolean environment flag %s and restores its first value',
  (name) => {
    const previous = process.env[name]
    const utilities = createAttemptUtilities(() => {})
    try {
      process.env[name] = 'controlled original flag'
      for (const [value, expected] of [
        [true, '1'],
        [false, ''],
        [undefined, undefined],
      ] as const) {
        expect(utilities.stubEnv(name, value)).toBe(utilities)
        expect(process.env[name]).toBe(expected)
        expect(Object.hasOwn(process.env, name)).toBe(value !== undefined)
      }
      expect(utilities.unstubAllEnvs()).toBe(utilities)
      expect(process.env[name]).toBe('controlled original flag')
      delete process.env[name]
      utilities.stubEnv(name, true)
      utilities.dispose()
      expect(Object.hasOwn(process.env, name)).toBe(false)
    } finally {
      utilities.dispose()
      if (previous === undefined) delete process.env[name]
      else process.env[name] = previous
    }
  }
)

it('uses exact boolean flag names and preserves ordinary primitive coercion', () => {
  const utilities = createAttemptUtilities(() => {})
  const names = ['DEV', 'PROD', 'SSR', 'dev', 'Prod', 'ssr', 'WS1_ENV_COERCION']
  const originals = names.map((name) => [name, process.env[name]] as const)
  let coercions = 0
  const failure = new Error('controlled primitive coercion')
  const value = {
    [Symbol.toPrimitive]() {
      coercions++
      throw failure
    },
  }
  try {
    for (const name of ['DEV', 'PROD', 'SSR']) {
      expect(Reflect.apply(utilities.stubEnv, undefined, [name, value])).toBe(
        utilities
      )
      expect(process.env[name]).toBe('1')
    }
    expect(coercions).toBe(0)
    for (const name of ['dev', 'Prod', 'ssr']) {
      Reflect.apply(utilities.stubEnv, undefined, [name, true])
      expect(process.env[name]).toBe('true')
    }
    expect(() =>
      Reflect.apply(utilities.stubEnv, undefined, ['WS1_ENV_COERCION', value])
    ).toThrow(failure)
    expect(coercions).toBe(1)
  } finally {
    utilities.dispose()
    for (const [name, original] of originals) {
      if (original === undefined) delete process.env[name]
      else process.env[name] = original
    }
  }
})

it('retains closed utility guards while disposal restores Boolean flag stubs', () => {
  const name = 'DEV'
  const previous = process.env[name]
  const closed = new Error('original utility owner is closed')
  let active = true
  const utilities = createAttemptUtilities(() => {
    if (!active) throw closed
  })
  try {
    process.env[name] = 'controlled original flag'
    utilities.stubEnv(name, true)
    active = false
    expect(() => utilities.stubEnv(name, false)).toThrow(closed)
    expect(() => utilities.unstubAllEnvs()).toThrow(closed)
    expect(process.env[name]).toBe('1')
    utilities.dispose()
    expect(process.env[name]).toBe('controlled original flag')
  } finally {
    utilities.dispose()
    if (previous === undefined) delete process.env[name]
    else process.env[name] = previous
  }
})

it.each(['node', 'browser'])(
  'retains the original %s primitive attempt carrier across actual Test rebinding',
  async (mode) => {
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [
      join(__dirname, 'task-runtime-integration.cjs'),
      process.cwd(),
      mode,
    ])
    expect(stderr).toBe('')
    expect(JSON.parse(stdout)).toEqual({
      mode,
      capturedOutcomes: 3,
      manualUnchanged: true,
      lookupReads: 0,
    })
  },
  30000
)

it('publishes actual global Tasks across hooks, native and custom assertions, and concurrent bodies', async () => {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'global-task-flags.cjs')],
    { timeout: 50000, maxBuffer: 4 * 1024 * 1024 }
  )
  expect(stderr).toBe('')
  expect(JSON.parse(stdout)).toEqual({
    results: [
      { mode: 'development', group: 'flags', cases: 5, rows: 1 },
      { mode: 'development', group: 'attribution', cases: 4, rows: 1 },
      { mode: 'production', group: 'flags', cases: 5, rows: 1 },
      { mode: 'production', group: 'attribution', cases: 4, rows: 1 },
    ],
  })
}, 55000)

it.each(['node', 'browser'] as const)(
  'publishes genuine native public Promise queues through the %s primitive with captured private ownership',
  async (mode) => {
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'native-public-promises-primitive.cjs'),
        join(__dirname, '../../..'),
        mode,
      ],
      { timeout: 10000, maxBuffer: 4 * 1024 * 1024 }
    )
    expect(stderr).toBe('')
    const result = JSON.parse(stdout)
    expect(result.mode).toBe(mode)
    expect(result.controls).toBe(11)
  }
)

it('retains complete genuine native public Promise field rows through actual Node cases', async () => {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'native-public-promises-public.cjs')],
    { timeout: 50000, maxBuffer: 4 * 1024 * 1024 }
  )
  expect(stderr).toBe('')
  expect(JSON.parse(stdout)).toEqual({
    results: [
      { mode: 'development', group: 'fields', cases: 4, rows: 1 },
      { mode: 'production', group: 'fields', cases: 4, rows: 1 },
    ],
  })
}, 55000)

it.each([
  { batch: 'queue', groups: 10 },
  { batch: 'ownership', groups: 6 },
  { batch: 'rejections', groups: 3 },
])(
  'consumes actual public Promise queues with genuine iteration, retries and native ownership: $batch',
  async ({ batch, groups }) => {
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [join(__dirname, 'manual-public-promises-public.cjs'), batch],
      { timeout: 120000, maxBuffer: 4 * 1024 * 1024 }
    )
    expect(stderr).toBe('')
    expect(JSON.parse(stdout)).toEqual({
      profiles: groups * 2,
      groups,
      cases: groups * 2,
      rows: groups * 2,
    })
  },
  125000
)

it.each([
  { batch: 'finished-fields', groups: 5, cases: 12 },
  { batch: 'finished-runtime', groups: 3, cases: 6 },
  { batch: 'failed-fields', groups: 4, cases: 10 },
  { batch: 'failed-sequence', groups: 4, cases: 8 },
  { batch: 'empty', groups: 1, cases: 4 },
])(
  'shares real public completion arrays with genuine registration and consumption: $batch',
  async ({ batch, groups, cases }) => {
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [join(__dirname, 'public-task-listeners.cjs'), batch],
      { timeout: 120000, maxBuffer: 4 * 1024 * 1024 }
    )
    expect(stderr).toBe('')
    expect(JSON.parse(stdout)).toEqual({
      profiles: groups * 2,
      groups,
      cases,
      rows: groups * 2,
    })
  },
  125000
)

it.each(['node', 'browser'])(
  'captures the exact native finished callback without replacing its public array: %s',
  async (mode) => {
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'public-finished-producer.cjs'),
        mode,
        require.resolve(
          mode === 'browser'
            ? 'next/dist/compiled/next-test-primitives/browser'
            : 'next/dist/compiled/next-test-primitives'
        ),
      ],
      { timeout: 15000, maxBuffer: 4 * 1024 * 1024 }
    )
    expect(stderr).toBe('')
    const result = JSON.parse(stdout)
    expect(result.mode).toBe(mode)
    expect(result.controls).toBe(11)
    expect(result.failures).toBe(0)
  },
  20000
)

it('attributes only the captured native body completion check, preserving identical manual and foreign errors', async () => {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [
      join(__dirname, 'public-finished-body-guards.cjs'),
      require.resolve('next/dist/experimental/testing/runner'),
    ],
    { timeout: 15000, maxBuffer: 4 * 1024 * 1024 }
  )
  expect(stderr).toBe('')
  expect(JSON.parse(stdout)).toEqual({
    actualScopes: 3,
    actualLogicalCases: 3,
    nativeErrorTagged: true,
    sameExactErrorFromManualCallbackUntagged: true,
    foreignNativeCallbackUntagged: true,
    armingBeforeNativeRegistration: true,
    callbacksObservedWithoutChangingInvocationOrErrorIdentity: true,
    disposed: true,
  })
}, 20000)
