import { createAttemptUtilities } from 'next/dist/experimental/testing/assertions/utilities'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'

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
