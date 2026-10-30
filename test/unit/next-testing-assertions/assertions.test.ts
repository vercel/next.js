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

it.each(['object', 'fulfilled'])(
  'retains Istanbul completion for an unobserved shared afterAll %s payload',
  async (kind) => {
    const { mkdtemp, readFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const output = await mkdtemp(
      join(tmpdir(), 'next-istanbul-shared-payload-')
    )
    try {
      await promisify(execFile)(
        process.execPath,
        [
          join(
            __dirname,
            '../next-testing-coverage/istanbul-afterall-payloads.mjs'
          ),
          'source',
          process.cwd(),
          output,
          kind,
        ],
        {
          env: { ...process.env, TURBO_TASKS_AVAILABLE_PARALLELISM: '4' },
          timeout: 125000,
        }
      ).catch((error) => {
        throw new Error([error.message, error.stdout, error.stderr].join('\n'))
      })
      expect(
        JSON.parse(await readFile(join(output, 'VERIFIED.json'), 'utf8'))
      ).toMatchObject({
        kind,
        exit: 0,
        passedCases: 3,
        failedFiles: 0,
        completeCoverageReports: true,
        noNativeRejection: true,
      })
    } finally {
      await rm(output, { recursive: true, force: true })
    }
  },
  125000
)

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

it.each(['development', 'production'])(
  'exposes actual snapshot state across public %s lifecycle, failure and retry',
  async (mode) => {
    const { mkdtemp, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const directory = await mkdtemp(
      join(tmpdir(), 'next-snapshot-state-public-')
    )
    try {
      const { stdout, stderr } = await promisify(execFile)(
        process.execPath,
        [
          join(__dirname, 'snapshot-state-public.mjs'),
          'source',
          process.cwd(),
          join(directory, 'observed'),
          mode,
        ],
        { timeout: 180000, maxBuffer: 4 * 1024 * 1024 }
      ).catch((error) => {
        throw new Error([error.message, error.stdout, error.stderr].join('\n'))
      })
      expect(stderr).toBe('')
      expect(JSON.parse(stdout)).toEqual({
        profiles: 4,
        cases: 8,
        observations: 48,
        exactGenuineStateAndSnapshotCounters: true,
        sourceAndInlineSnapshotsUnchanged: true,
        allOwnersJoined: true,
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
  185000
)

it('matches genuine snapshot state and CounterMap public types', async () => {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'snapshot-state-types.cjs')],
    { timeout: 30000 }
  )
  expect(stderr).toBe('')
  expect(JSON.parse(stdout)).toEqual({
    programs: 18,
    accepted: 12,
    rejected: 6,
    rootConfigAndGlobalAugmentations: true,
    publishedFacadeTarget: true,
    globalContextCustomMatcherAndStateWrites: true,
    actualBundledSnapshotType: true,
  })
}, 35000)

it('matches genuine AssertType and snapshot root type exports', async () => {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'root-authoring-types.cjs')],
    { timeout: 30000 }
  )
  expect(stderr).toBe('')
  expect(JSON.parse(stdout)).toEqual({
    programs: 24,
    accepted: 6,
    rejected: 18,
    rootConfigAndGlobalAugmentations: true,
    publishedFacadeTarget: true,
    transitiveSnapshotTypeIdentity: true,
    typeOnlyExports: true,
  })
}, 35000)

it('matches genuine matcher authoring root type exports', async () => {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'matcher-authoring-types.cjs')],
    { timeout: 30000 }
  )
  expect(stderr).toBe('')
  expect(JSON.parse(stdout)).toEqual({
    programs: 44,
    accepted: 16,
    rejected: 28,
    rootConfigAndGlobalAugmentations: true,
    publishedFacadeTarget: true,
    directRealMatcherTypeIdentity: true,
    typeOnlyExports: true,
  })
}, 35000)

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

it.each([
  ['development', 'js', 'poll-ownership'],
  ['development', 'js', 'poll-hook-admission'],
  ['development', 'mjs', 'poll-ownership'],
  ['development', 'mjs', 'poll-hook-admission'],
  ['production', 'js', 'poll-ownership'],
  ['production', 'js', 'poll-hook-admission'],
  ['production', 'mjs', 'poll-ownership'],
  ['production', 'mjs', 'poll-hook-admission'],
])(
  'matches genuine public polling ownership in %s %s %s',
  async (mode, extension, profile) => {
    const { mkdtemp, readFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const directory = await mkdtemp(
      join(tmpdir(), 'next-poll-ownership-public-')
    )
    try {
      const output = join(directory, profile)
      await promisify(execFile)(
        process.execPath,
        [
          join(__dirname, 'poll-ownership-public.mjs'),
          'source',
          process.cwd(),
          output,
          mode,
          profile,
          extension,
        ],
        { timeout: 125000, maxBuffer: 4 * 1024 * 1024 }
      ).catch(async (error) => {
        const raw = await readFile(join(output, 'RESULT.json'), 'utf8').catch(
          () => ''
        )
        throw new Error(
          [error.message, error.stdout, error.stderr, raw].join('\n')
        )
      })
      expect(
        JSON.parse(await readFile(join(output, 'VERIFIED.json'), 'utf8'))
      ).toMatchObject({
        exactGenuineAuthorRows: true,
        exactCaseStatesAndErrorNamesMessages: true,
        noSyntheticResults: true,
        originalBoundsHeld: true,
        allOwnersJoined: true,
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
  130000
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

it.each([
  ['development', 'js', 'node'],
  ['development', 'mjs', 'node'],
  ['production', 'js', 'node'],
  ['production', 'mjs', 'node'],
  ['development', 'mjs', 'custom'],
  ['production', 'js', 'custom'],
  ['development', 'mjs', 'custom-getter'],
  ['production', 'js', 'custom-getter'],
  ['development', 'mjs', 'custom-undefined-second'],
  ['production', 'js', 'custom-undefined-second'],
  ['development', 'mjs', 'custom-throw-second'],
  ['production', 'js', 'custom-throw-second'],
  ['development', 'mjs', 'state-inheritance'],
  ['production', 'js', 'state-inheritance'],
  ['development', 'mjs', 'custom-throw-second-cleanup'],
  ['production', 'js', 'custom-throw-second-cleanup'],
  ['development', 'mjs', 'custom-throw-second-undefined'],
  ['production', 'js', 'custom-throw-second-undefined'],
  ['development', 'mjs', 'browser'],
])(
  'publishes actual environment state in %s %s %s',
  async (mode, extension, profile) => {
    const { mkdtemp, readFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const directory = await mkdtemp(
      join(tmpdir(), 'next-environment-state-public-')
    )
    let completed = false
    try {
      const output = join(directory, profile)
      await promisify(execFile)(
        process.execPath,
        [
          join(__dirname, 'environment-state-public.mjs'),
          'source',
          process.cwd(),
          output,
          mode,
          profile,
          extension,
        ],
        { timeout: 125000, maxBuffer: 4 * 1024 * 1024 }
      ).catch(async (error) => {
        const raw = await readFile(join(output, 'RESULT.json'), 'utf8').catch(
          () => ''
        )
        throw new Error(
          [error.message, error.stdout, error.stderr, raw, directory].join('\n')
        )
      })
      expect(
        JSON.parse(await readFile(join(output, 'VERIFIED.json'), 'utf8'))
      ).toMatchObject({
        exactGenuineAuthorRows: true,
        exactCaseStates: true,
        noSyntheticResults: true,
        originalBoundsHeld: true,
        allOwnersJoined: true,
      })
      completed = true
    } finally {
      if (completed) await rm(directory, { recursive: true, force: true })
      else
        console.error(
          'Retained failed environment state observations at ' + directory
        )
    }
  },
  130000
)

it('matches genuine complete expectation authoring types and the actual primitive matcher graph', async () => {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'expect-authoring-types.cjs')],
    { timeout: 120000 }
  )
  expect(stderr).toBe('')
  expect(JSON.parse(stdout)).toEqual({
    programs: 37,
    accepted: 20,
    rejected: 17,
    eachAugmentationIsolated: true,
    rootConfigAndGlobalAugmentations: true,
    publishedFacadeTarget: true,
    actualPrimitiveMatcherGraph: true,
    realUserAugmentationDeclarations: true,
    typeOnlyExports: true,
  })
}, 125000)

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

it.each([
  ['development', 'js', 'core'],
  ['production', 'mjs', 'core'],
  ['development', 'js', 'takeover'],
  ['production', 'mjs', 'takeover'],
])(
  'matches genuine polling deadline and settlement ownership in %s %s %s',
  async (mode, extension, family) => {
    const { mkdtemp, readFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const directory = await mkdtemp(
      join(tmpdir(), 'next-poll-deadline-public-')
    )
    const output = join(directory, 'output')
    let completed = false
    try {
      await promisify(execFile)(
        process.execPath,
        [
          join(__dirname, 'poll-deadline-public.mjs'),
          'source',
          process.cwd(),
          output,
          mode,
          extension,
          family,
        ],
        { timeout: 125000, maxBuffer: 4 * 1024 * 1024 }
      ).catch(async (error) => {
        const raw = await readFile(join(output, 'RESULT.json'), 'utf8').catch(
          () => ''
        )
        throw new Error(
          [error.message, error.stdout, error.stderr, raw, directory].join('\n')
        )
      })
      expect(
        JSON.parse(await readFile(join(output, 'VERIFIED.json'), 'utf8'))
      ).toMatchObject({
        exactGenuineAuthorRows: true,
        exactCaseStatesAndStandardCounts: true,
        originalBoundsHeld: true,
        allOwnersJoined: true,
      })
      completed = true
    } finally {
      if (completed) await rm(directory, { recursive: true, force: true })
      else
        console.error(
          'Retained failed poll deadline observations at ' + directory
        )
    }
  },
  130000
)

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
  ['development', 'js'],
  ['production', 'mjs'],
])(
  'matches actual callable tag descriptor effects in %s %s',
  async (mode, extension) => {
    const { mkdtemp, readFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const directory = await mkdtemp(join(tmpdir(), 'next-callable-tag-public-'))
    const output = join(directory, 'observed')
    let completed = false
    try {
      await promisify(execFile)(
        process.execPath,
        [
          join(__dirname, 'poll-takeover-descriptor-public.mjs'),
          'source',
          process.cwd(),
          output,
          mode,
          extension,
          'effects',
        ],
        { timeout: 125000, maxBuffer: 4 * 1024 * 1024 }
      ).catch(async (error) => {
        const raw = await readFile(join(output, 'RESULT.json'), 'utf8').catch(
          () => ''
        )
        throw new Error(
          [error.message, error.stdout, error.stderr, raw, directory].join('\n')
        )
      })
      expect(
        JSON.parse(await readFile(join(output, 'VERIFIED.json'), 'utf8'))
      ).toMatchObject({
        exactGenuineAuthorRows: true,
        exactCaseStatesAndStandardCounts: true,
        originalBoundsHeld: true,
        allOwnersJoined: true,
      })
      completed = true
    } finally {
      if (completed) await rm(directory, { recursive: true, force: true })
      else
        console.error(
          'Retained failed callable metadata observations at ' + directory
        )
    }
  },
  130000
)

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
      actualFileDisposalJoined: true,
    })
  },
  25000
)

it.each([
  ['development', 'js', 'prototype'],
  ['production', 'mjs', 'prototype'],
  ['development', 'js', 'owners'],
  ['production', 'mjs', 'owners'],
  ['development', 'js', 'dispatch'],
  ['production', 'mjs', 'dispatch'],
  ['development', 'js', 'identity'],
  ['production', 'mjs', 'identity'],
  ['development', 'js', 'overwrite-static'],
  ['production', 'mjs', 'overwrite-static'],
  ['development', 'js', 'overwrite-utility'],
  ['production', 'mjs', 'overwrite-utility'],
  ['development', 'js', 'native-alias'],
  ['production', 'mjs', 'native-alias'],
  ['development', 'js', 'super-this'],
  ['production', 'mjs', 'super-this'],
  ['development', 'js', 'subject'],
  ['production', 'mjs', 'subject'],
])(
  'matches complete Chai callable %s %s %s rows',
  async (mode, extension, family) => {
    const { mkdtemp, readFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const directory = await mkdtemp(
      join(tmpdir(), 'next-chai-callable-public-')
    )
    const output = join(directory, 'observed')
    let completed = false
    try {
      await promisify(execFile)(
        process.execPath,
        [
          join(__dirname, 'chai-prototype-callable-public.mjs'),
          'source',
          process.cwd(),
          output,
          mode,
          extension,
          family,
        ],
        { timeout: 125000, maxBuffer: 4 * 1024 * 1024 }
      ).catch(async (error) => {
        const raw = await readFile(join(output, 'RESULT.json'), 'utf8').catch(
          () => ''
        )
        throw new Error(
          [error.message, error.stdout, error.stderr, raw, directory].join('\n')
        )
      })
      expect(
        JSON.parse(await readFile(join(output, 'VERIFIED.json'), 'utf8'))
      ).toMatchObject({
        exactGenuineAuthorRows: true,
        exactCaseStatesAndStandardCounts: true,
        originalBoundsHeld: true,
        allOwnersJoined: true,
      })
      completed = true
    } finally {
      if (completed) await rm(directory, { recursive: true, force: true })
      else
        console.error(
          'Retained failed Chai callable observations at ' + directory
        )
    }
  },
  130000
)

it.each(['default', 'proxy-disabled', 'proxify', 'proxify-disabled'])(
  'retains actual callable name metadata after File disposal in %s',
  async (family) => {
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [join(__dirname, 'chai-callable-name.cjs'), process.cwd(), '', family],
      { timeout: 20000 }
    )
    expect(stderr).toBe('')
    expect(JSON.parse(stdout)).toMatchObject({
      cases: family.startsWith('proxify') ? 2 : 3,
      completeGenuineRows: 4,
      actualFileDisposalJoined: true,
      actualNameReadsAfterDispose: true,
    })
  },
  25000
)

it.each([
  ['development', 'js', 'default'],
  ['production', 'mjs', 'default'],
  ['development', 'js', 'proxy-disabled'],
  ['production', 'mjs', 'proxy-disabled'],
  ['development', 'js', 'proxify'],
  ['production', 'mjs', 'proxify'],
  ['development', 'js', 'proxify-disabled'],
  ['production', 'mjs', 'proxify-disabled'],
])(
  'matches genuine callable name metadata in %s %s %s',
  async (mode, extension, family) => {
    const { mkdtemp, readFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const directory = await mkdtemp(join(tmpdir(), 'next-chai-name-public-'))
    const output = join(directory, 'observed')
    let completed = false
    try {
      await promisify(execFile)(
        process.execPath,
        [
          join(__dirname, 'chai-callable-name-public.mjs'),
          'source',
          process.cwd(),
          output,
          mode,
          extension,
          family,
        ],
        { timeout: 125000, maxBuffer: 4 * 1024 * 1024 }
      )
      expect(
        JSON.parse(await readFile(join(output, 'VERIFIED.json'), 'utf8'))
      ).toMatchObject({
        exactGenuineAuthorRows: true,
        exactCaseStatesAndStandardCounts: true,
        originalBoundsHeld: true,
        allOwnersJoined: true,
      })
      completed = true
    } finally {
      if (completed) await rm(directory, { recursive: true, force: true })
      else
        console.error(
          'Retained failed callable name observations at ' + directory
        )
    }
  },
  130000
)
