import type { NextTestRunnerOptions } from 'next/dist/cli/next-test-runner'
import { parseActualTestCommand } from './actual-bin-command'

function typecheckOptions(options: NextTestRunnerOptions) {
  return {
    ...(options.typecheck === undefined ? {} : { enabled: options.typecheck }),
    ...(options['typecheck.only'] === undefined
      ? {}
      : { only: options['typecheck.only'] }),
    ...(options['typecheck.spawnTimeout'] === undefined
      ? {}
      : { spawnTimeout: options['typecheck.spawnTimeout'] }),
  }
}

describe('actual test command typecheck registration', () => {
  it.each([
    ['omitted', [], {}],
    ['zero', ['--typecheck.spawnTimeout=0'], { spawnTimeout: 0 }],
    ['one', ['--typecheck.spawnTimeout=1'], { spawnTimeout: 1 }],
    ['bare', ['--typecheck.spawnTimeout'], { spawnTimeout: true }],
    ['negative equals', ['--typecheck.spawnTimeout=-1'], { spawnTimeout: -1 }],
    ['fraction', ['--typecheck.spawnTimeout=1.5'], { spawnTimeout: 1.5 }],
    ['NaN text', ['--typecheck.spawnTimeout=NaN'], { spawnTimeout: 'NaN' }],
    [
      'Infinity text',
      ['--typecheck.spawnTimeout=Infinity'],
      { spawnTimeout: 'Infinity' },
    ],
    [
      'false text',
      ['--typecheck.spawnTimeout=false'],
      { spawnTimeout: 'false' },
    ],
    ['negated', ['--no-typecheck.spawnTimeout'], { spawnTimeout: false }],
    [
      'literal quoted token',
      ['--typecheck.spawnTimeout', '"1"'],
      { spawnTimeout: '1' },
    ],
    [
      'shell-tokenized numeric argument',
      ['--typecheck.spawnTimeout', '1'],
      { spawnTimeout: 1 },
    ],
    [
      'enable before leaf',
      ['--typecheck', '--typecheck.spawnTimeout=1'],
      { enabled: true, spawnTimeout: 1 },
    ],
    [
      'enable after leaf',
      ['--typecheck.spawnTimeout=1', '--typecheck'],
      { enabled: true },
    ],
    [
      'disable before leaf',
      ['--no-typecheck', '--typecheck.spawnTimeout=1'],
      { enabled: false, spawnTimeout: 1 },
    ],
    [
      'disable after leaf',
      ['--typecheck.spawnTimeout=1', '--no-typecheck'],
      { enabled: false },
    ],
    [
      'only before leaf',
      ['--typecheck.only', '--typecheck.spawnTimeout=1'],
      { enabled: true, only: true, spawnTimeout: 1 },
    ],
    [
      'not-only before leaf',
      ['--no-typecheck.only', '--typecheck.spawnTimeout=1'],
      { enabled: true, only: false, spawnTimeout: 1 },
    ],
    [
      'explicit disabled and only',
      ['--no-typecheck', '--typecheck.only', '--typecheck.spawnTimeout=1'],
      { enabled: false, only: true, spawnTimeout: 1 },
    ],
    [
      'explicit disabled and not-only',
      ['--no-typecheck', '--no-typecheck.only', '--typecheck.spawnTimeout=1'],
      { enabled: false, only: false, spawnTimeout: 1 },
    ],
    [
      'value then negated',
      ['--typecheck.spawnTimeout=1', '--no-typecheck.spawnTimeout'],
      { spawnTimeout: false },
    ],
    // MRI keeps each option key at its first insertion position. Replacing the
    // leaf does not move it after the later parent key.
    [
      'first-seen key order',
      [
        '--typecheck.spawnTimeout=1',
        '--typecheck',
        '--no-typecheck.spawnTimeout',
      ],
      { enabled: true },
    ],
    [
      'empty equals argv rewrite',
      ['--typecheck.spawnTimeout='],
      { spawnTimeout: true },
    ],
    [
      'empty equals followed by value',
      ['--typecheck.spawnTimeout=', '1'],
      { spawnTimeout: 1 },
    ],
  ] as const)(
    'forwards %s through real Commander',
    async (_name, argv, expected) => {
      const result = await parseActualTestCommand(argv)
      expect(result.parserError).toBeUndefined()
      expect(result.exitCode).toBeUndefined()
      expect(result.messages).toEqual([])
      expect(result.nextTestRunner).toHaveBeenCalledTimes(1)
      const [directory, options] = result.nextTestRunner.mock.calls[0]
      expect(directory).toBe('/owned/project')
      expect(options.run).toBe(true)
      expect(typecheckOptions(options)).toEqual(expected)
      expect(result.rawArgs.slice(0, 5)).toEqual([
        'node',
        'next',
        'test',
        '/owned/project',
        '--run',
      ])
    }
  )

  it.each([
    [
      'two values',
      ['--typecheck.spawnTimeout=0', '--typecheck.spawnTimeout=1'],
      '[0, 1]',
    ],
    [
      'bare then value',
      ['--typecheck.spawnTimeout', '--typecheck.spawnTimeout=1'],
      '[true, 1]',
    ],
    [
      'negation then value',
      ['--no-typecheck.spawnTimeout', '--typecheck.spawnTimeout=1'],
      '[false, 1]',
    ],
  ] as const)(
    'rejects %s inside the actual action before dispatch',
    async (_name, argv, values) => {
      const result = await parseActualTestCommand(argv)
      expect(result.parserError).toBeUndefined()
      expect(result.exitCode).toBe(1)
      expect(result.nextTestRunner).not.toHaveBeenCalled()
      expect(result.messages).toEqual([
        `Expected a single value for option "--typecheck.spawnTimeout <time>", received ${values}`,
      ])
    }
  )

  it('rejects split negative syntax without dispatching a checker request', async () => {
    const result = await parseActualTestCommand([
      '--typecheck.spawnTimeout',
      '-1',
    ])
    expect(result.nextTestRunner).not.toHaveBeenCalled()
    const error = result.parserError as Error | undefined
    const diagnostic = [
      error?.message,
      ...result.messages,
      ...result.parserOutput,
    ]
      .filter(Boolean)
      .join('\n')
    expect(diagnostic).toMatch(/unknown option/i)
    expect(diagnostic).toContain('-1')
    expect(result.rawArgs).toContain('-1')
  })

  it('retains unrelated cache and worker option provenance', async () => {
    const result = await parseActualTestCommand([
      '--typecheck.spawnTimeout=0',
      '--cache=false',
      '--no-file-parallelism',
      '--testTimeout',
      '71',
      '--hookTimeout',
      '72',
    ])
    expect(result.parserError).toBeUndefined()
    expect(result.exitCode).toBeUndefined()
    expect(result.nextTestRunner).toHaveBeenCalledTimes(1)
    expect(result.nextTestRunner.mock.calls[0][1]).toMatchObject({
      'typecheck.spawnTimeout': 0,
      cache: false,
      fileParallelism: false,
      testTimeout: '71',
      hookTimeout: '72',
    })
  })

  it('creates independent argument owners for consecutive command parses', async () => {
    await parseActualTestCommand(['--typecheck', '--typecheck.spawnTimeout=1'])
    const result = await parseActualTestCommand([])
    expect(result.nextTestRunner).toHaveBeenCalledTimes(1)
    expect(typecheckOptions(result.nextTestRunner.mock.calls[0][1])).toEqual({})
  })
})

describe('actual test command runner failure rendering', () => {
  it.each([Error, TypeError])(
    'retains the original %p stack after runner dispatch',
    async (ErrorType) => {
      function reporterEndFailure() {
        return new ErrorType('empty end throw sentinel')
      }
      const failure = reporterEndFailure()
      const stack = failure.stack
      const descriptors = Object.getOwnPropertyDescriptors(failure)
      expect(stack).toContain('reporterEndFailure')
      const result = await parseActualTestCommand([], async () => {
        throw failure
      })
      expect(result.parserError).toBeUndefined()
      expect(result.nextTestRunner).toHaveBeenCalledTimes(1)
      expect(result.messages).toEqual([stack])
      expect(result.exitCode).toBe(1)
      expect(Object.getOwnPropertyDescriptors(failure)).toEqual(descriptors)
    }
  )

  it('retains a reporter-defined Error name and its actual captured stack', async () => {
    const failure = new Error('named reporter failure')
    failure.name = 'ReporterError'
    const stack = failure.stack
    const descriptors = Object.getOwnPropertyDescriptors(failure)
    expect(stack).toContain('ReporterError: named reporter failure')
    const result = await parseActualTestCommand([], async () => {
      throw failure
    })
    expect(result.parserError).toBeUndefined()
    expect(result.nextTestRunner).toHaveBeenCalledTimes(1)
    expect(result.messages).toEqual([stack])
    expect(result.exitCode).toBe(1)
    expect(Object.getOwnPropertyDescriptors(failure)).toEqual(descriptors)
  })

  it('retains the original message when a dispatched Error has no stack', async () => {
    const failure = new Error('stackless reporter failure')
    failure.stack = undefined
    const descriptors = Object.getOwnPropertyDescriptors(failure)
    const result = await parseActualTestCommand([], async () => {
      throw failure
    })
    expect(result.parserError).toBeUndefined()
    expect(result.nextTestRunner).toHaveBeenCalledTimes(1)
    expect(result.messages).toEqual([failure.message])
    expect(result.exitCode).toBe(1)
    expect(Object.getOwnPropertyDescriptors(failure)).toEqual(descriptors)
  })

  it('retains a non-Error rejection without inventing a stack or prefix', async () => {
    const result = await parseActualTestCommand([], async () => {
      return Promise.reject('raw reporter rejection')
    })
    expect(result.parserError).toBeUndefined()
    expect(result.nextTestRunner).toHaveBeenCalledTimes(1)
    expect(result.messages).toEqual(['raw reporter rejection'])
    expect(result.exitCode).toBe(1)
  })

  it('retains the observed final-exit receipt while printing the original stack', async () => {
    const failure = new Error('reporter failure after physical final exit')
    const stack = failure.stack
    const result = await parseActualTestCommand(
      [],
      async (_directory, options) => {
        options.onFinalProcessExit?.({ code: 7, signal: null, reason: 'exit' })
        throw failure
      }
    )
    expect(result.parserError).toBeUndefined()
    expect(result.nextTestRunner).toHaveBeenCalledTimes(1)
    expect(result.messages).toEqual([stack])
    expect(result.exitCode).toBeUndefined()
  })
})
