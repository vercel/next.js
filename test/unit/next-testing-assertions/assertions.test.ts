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
            ? 'next/dist/experimental/testing/primitives/browser'
            : 'next/dist/experimental/testing/primitives'
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

it('observes only actual settled afterAll assertion finalizers without changing error carriers', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [
    join(__dirname, 'coverage-afterall-finalization.cjs'),
    process.cwd(),
    '--source',
  ]).catch((error) => {
    throw new Error([error.message, error.stdout, error.stderr].join('\n'))
  })
  const result = JSON.parse(stdout)
  expect(result.actualAssertionRuntime).toBe(true)
  expect(result.rows).toHaveLength(4)
  expect(result.rows.map((row) => row.carrierMarks)).toEqual([
    [true],
    [false],
    [false],
    [true, false],
  ])
  expect(
    result.rows.every((row) => row.rawErrorUnchanged && row.completed)
  ).toBe(true)
}, 30000)

it('publishes the real snapshot state only at actual attempt start and preserves its lifetime', async () => {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'snapshot-state-exposure.cjs'), process.cwd(), '--source'],
    { timeout: 15000 }
  )
  expect(stderr).toBe('')
  expect(JSON.parse(stdout)).toEqual({
    controls: 7,
    actualSDKReadIdentity: true,
    noCollectionOrBeforeAllInjection: true,
    realCounterAndRetryBehavior: true,
    rawSetupFailureAndUndefined: true,
    cleanupGuardsAndGlobalRestoration: true,
  })
}, 20000)

it.each(['poll-ownership', 'poll-hook-admission'])(
  'owns actual lazy polling invocation and Test lifetime: %s',
  async (profile) => {
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [join(__dirname, 'poll-ownership.cjs'), process.cwd(), profile],
      { timeout: 15000 }
    )
    expect(stderr).toBe('')
    expect(JSON.parse(stdout)).toEqual({
      mode: profile,
      cases: profile === 'poll-ownership' ? 10 : 1,
      controls: profile === 'poll-ownership' ? 7 : 0,
      passed: profile === 'poll-ownership' ? 9 : 1,
      failed: profile === 'poll-ownership' ? 1 : 0,
      exactGenuineAuthorRows: true,
    })
  },
  20000
)

it('seeds assertion state from the actual resolved environment with owned getter and teardown effects', async () => {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'environment-state.cjs'), process.cwd()],
    { timeout: 15000 }
  )
  expect(stderr).toBe('')
  expect(JSON.parse(stdout)).toEqual({
    controls: 13,
    realFileCases: 3,
    rawUndefinedAndIndependentTeardownHeld: true,
    omittedAndNontrueGetterReadsHeld: true,
    allDisposalsJoined: true,
  })
}, 20000)

it('owns genuine polling deadlines, outputs and actual native timer cleanup', async () => {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'poll-deadline.cjs'), process.cwd()],
    { timeout: 20000 }
  )
  expect(stderr).toBe('')
  expect(JSON.parse(stdout)).toEqual({
    families: [
      { family: 'core', cases: 7, rows: 21, rawErrors: 4 },
      { family: 'takeover', cases: 2, rows: 2, rawErrors: 1 },
    ],
    rawErrors: 5,
    actualScopeResourceControls: 3,
    allNativeTimersCleared: true,
    noForcedSettlementOrPublicAbort: true,
    lateOwnerCannotReacquireTimers: true,
    noFabricatedCaseResults: true,
  })
}, 25000)

it('preserves actual takeover descriptors and retained readonly metadata without invoking getters', async () => {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'poll-takeover-descriptor.cjs'), process.cwd()],
    { timeout: 20000 }
  )
  expect(stderr).toBe('')
  expect(JSON.parse(stdout)).toEqual({
    cases: 3,
    completeGenuineRows: 4,
    afterDisposeControl: 1,
    realDescriptorsAndGetterIdentity: true,
    noAdditionalGetterCalls: true,
    retainedMetadataAfterDispose: true,
    invocationCodeUnchanged: true,
  })
}, 25000)

it.each([
  'prototype',
  'owners',
  'dispatch',
  'identity',
  'overwrite-static',
  'overwrite-utility',
  'native-alias',
  'super-this',
  'subject',
])(
  'preserves actual Chai prototype callable %s identity and receiver semantics',
  async (family) => {
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [join(__dirname, 'chai-prototype-callable.cjs'), process.cwd(), family],
      { timeout: 20000 }
    )
    expect(stderr).toBe('')
    expect(JSON.parse(stdout)).toMatchObject({
      family,
      cases:
        family === 'prototype'
          ? 4
          : family === 'identity'
            ? 7
            : family === 'native-alias'
              ? 1
              : 2,
      behaviorAssertions: true,
      actualFileDisposalJoined: true,
    })
  },
  25000
)

it.each(['dispatch', 'classes', 'null'])(
  'forwards actual Chai receivers through the file lifecycle in %s',
  async (family) => {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [join(__dirname, 'chai-receivers.cjs'), process.cwd(), '', family],
      { timeout: 20000 }
    )
    expect(stderr).toBe('')
    expect(JSON.parse(stdout)).toEqual({
      family,
      cases: family === 'dispatch' ? 28 : family === 'classes' ? 24 : 16,
      behaviorAssertions: true,
      actualFileDisposalJoined: true,
    })
  },
  25000
)
