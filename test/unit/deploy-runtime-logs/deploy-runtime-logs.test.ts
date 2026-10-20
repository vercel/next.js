import execa from 'execa'
import { DeployRuntimeLogs } from '../../lib/next-modes/deploy-runtime-logs'

jest.mock('execa', () => ({ sync: jest.fn() }))

function queryResult(stdout = '') {
  return { stdout } as unknown as ReturnType<typeof execa.sync>
}

type Log = {
  message?: string
  level?: string
  stream?: string
  truncated?: boolean
  isSystemLog?: boolean
}

function request(id: string, ...messages: string[]) {
  return {
    id,
    logs: messages.map((message): Log => ({ message, level: 'info' })),
  }
}

const summary = {
  type: 'summary',
  recordsReturned: 0,
  pagination: { hasMore: false, next: null },
  excludedIntervals: [],
}

// `vercel logs --json` lists entries newest first, then a summary. Requests
// are given newest first, and each request's logs oldest first.
function cliOutput(...requests: ReturnType<typeof request>[]) {
  return [
    ...requests.flatMap(({ id, logs }) =>
      [...logs].reverse().map((data) => ({
        type: 'log',
        data: { requestId: id, ...data },
      }))
    ),
    summary,
  ]
    .map((line) => JSON.stringify(line))
    .join('\n')
}

function lines(...records: unknown[]) {
  return records.map((record) => JSON.stringify(record)).join('\n')
}

describe('deploy runtime logs', () => {
  let collector: DeployRuntimeLogs
  let append: jest.Mock
  let warn: jest.SpyInstance
  let wait: jest.SpyInstance

  function start() {
    collector = new DeployRuntimeLogs(
      'https://fixture.vercel.app',
      { cwd: '/fixture', env: process.env, flags: ['--scope', 'test-team'] },
      append
    )
    return collector
  }

  function nextQuery(...requests: ReturnType<typeof request>[]) {
    jest
      .mocked(execa.sync)
      .mockReturnValueOnce(queryResult(cliOutput(...requests)))
    collector.refresh()
  }

  beforeEach(() => {
    jest.useFakeTimers()
    jest.mocked(execa.sync).mockReturnValue(queryResult(cliOutput()))
    append = jest.fn()
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    wait = jest.spyOn(Atomics, 'wait').mockReturnValue('timed-out')
  })

  afterEach(() => {
    try {
      collector?.stop()
    } catch {}
    warn.mockRestore()
    wait.mockRestore()
    jest.resetAllMocks()
    jest.useRealTimers()
  })

  it('fetches only on demand, including quiet deployments', () => {
    start()
    expect(execa.sync).not.toHaveBeenCalled()
    collector.refresh()
    expect(execa.sync).toHaveBeenCalledWith(
      'vercel',
      [
        'logs',
        '--deployment',
        'https://fixture.vercel.app',
        '--json',
        '--since',
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        '--limit',
        '1000',
        '--scope',
        'test-team',
      ],
      expect.objectContaining({
        cwd: '/fixture',
        timeout: 30_000,
        killSignal: 'SIGKILL',
      })
    )
    expect(append).not.toHaveBeenCalled()
  })

  it('collects every application log entry and skips system logs', () => {
    start()
    nextQuery({
      ...request('request-1'),
      logs: [
        { message: 'Error: route failed', level: 'error', stream: 'stderr' },
        { message: 'Function invoked', level: 'info', isSystemLog: true },
        {
          message: '<request-error>hook output</request-error>',
          level: 'info',
          stream: 'stdout',
        },
      ],
    })
    expect(append.mock.calls).toEqual([
      ['Error: route failed\n', 'stderr'],
      ['<request-error>hook output</request-error>\n', 'stdout'],
    ])
  })

  it('appends nothing for a window without application messages', () => {
    start()
    nextQuery(request('static-asset'))
    expect(append).not.toHaveBeenCalled()
  })

  it('appends interleaved requests in chronological order', () => {
    start()
    jest
      .mocked(execa.sync)
      .mockReturnValueOnce(
        queryResult(
          lines(
            { type: 'log', data: { requestId: 'b', message: 'b second' } },
            { type: 'log', data: { requestId: 'a', message: 'a second' } },
            { type: 'log', data: { requestId: 'b', message: 'b first' } },
            { type: 'log', data: { requestId: 'a', message: 'a first' } },
            summary
          )
        )
      )
    collector.refresh()
    expect(append.mock.calls.map(([message]) => message)).toEqual([
      'a first\n',
      'b first\n',
      'a second\n',
      'b second\n',
    ])
  })

  it('deduplicates entries outside a request as one group', () => {
    start()
    const output = lines(
      { type: 'log', data: { requestId: null, message: 'register' } },
      { type: 'log', data: { message: 'register' } },
      summary
    )
    jest.mocked(execa.sync).mockReturnValueOnce(queryResult(output))
    collector.refresh()
    jest.mocked(execa.sync).mockReturnValueOnce(queryResult(output))
    collector.refresh()
    expect(append.mock.calls).toEqual([
      ['register\n', 'stdout'],
      ['register\n', 'stdout'],
    ])
  })

  it('collects late messages and preserves repeated text within and across requests', () => {
    start()
    nextQuery(request('request-1', 'second'))
    nextQuery(request('request-1', 'first', 'second', 'second'))
    nextQuery(
      request('request-2', 'second'),
      request('request-1', 'first', 'second', 'second')
    )
    expect(append.mock.calls.map(([message]) => message)).toEqual([
      'second\n',
      'first\n',
      'second\n',
      'second\n',
    ])
  })

  it('keeps the same lower bound after long idle periods without background polling', async () => {
    start()
    collector.refresh()
    const firstArgs = jest.mocked(execa.sync).mock.calls[0][1]
    await jest.advanceTimersByTimeAsync(5 * 60_000)
    expect(execa.sync).toHaveBeenCalledTimes(1)
    nextQuery(request('late-request', 'after five minutes'))
    expect(append).toHaveBeenCalledWith('after five minutes\n', 'stdout')
    expect(jest.mocked(execa.sync).mock.calls.at(-1)![1]).toEqual(firstArgs)
    expect(() => collector.assertHealthy()).not.toThrow()
  })

  it('preserves Unicode, multiline stacks, whitespace and ANSI', () => {
    const message =
      '\u001b[31mError: 🌍\u001b[0m\n    at action (page.tsx:2:3)\n'
    start()
    nextQuery(request('request-1', message))
    expect(append).toHaveBeenCalledWith(message, 'stdout')
  })

  it.each(['warning', 'warn', 'error', 'fatal'])(
    'maps %s severity to stderr when the stream is unknown',
    (level) => {
      start()
      nextQuery({
        id: 'request-1',
        logs: [{ message: 'warning', level }],
      })
      expect(append).toHaveBeenCalledWith('warning\n', 'stderr')
    }
  )

  it('prefers the reported stream over severity', () => {
    start()
    nextQuery({
      id: 'request-1',
      logs: [
        { message: 'console.error', level: 'info', stream: 'stderr' },
        { message: 'structured error', level: 'error', stream: 'stdout' },
      ],
    })
    expect(append.mock.calls).toEqual([
      ['console.error\n', 'stderr'],
      ['structured error\n', 'stdout'],
    ])
  })

  it.each([
    ['not json', 'invalid JSON line'],
    ['null', 'unexpected record type'],
    [lines({ type: 'request', data: {} }, summary), 'unexpected record type'],
    [lines({ type: 'log' }, summary), 'invalid log entry'],
    [
      lines({ type: 'log', data: { level: 'info' } }, summary),
      'invalid log entry',
    ],
    [
      lines(
        { type: 'log', data: { message: 'partial', truncated: true } },
        summary
      ),
      'truncated log entry',
    ],
    [
      lines(
        { type: 'warning', reason: 'stream_gap', message: 'Results omit …' },
        summary
      ),
      'CLI warning: stream_gap',
    ],
    [
      lines({ ...summary, pagination: { hasMore: true, next: 'cursor' } }),
      'more than 1000 entries',
    ],
    [
      lines({
        ...summary,
        excludedIntervals: [{ start: '2026-10-20T00:00:00Z', end: 'now' }],
      }),
      'incomplete time range',
    ],
    [
      lines({ type: 'log', data: { message: 'no summary' } }),
      'missing summary',
    ],
    [
      lines(summary, { type: 'log', data: { message: 'late' } }),
      'output after the summary',
    ],
  ])('rejects malformed or incomplete query output: %s', (output, reason) => {
    jest.mocked(execa.sync).mockReturnValueOnce(queryResult(output))
    start()
    const failure = `Failed to read complete Vercel runtime logs (${reason})`
    expect(() => collector.refresh()).toThrow(new Error(failure))
    expect(append).not.toHaveBeenCalled()
    expect(() => collector.stop()).toThrow(failure)
  })

  it('never includes log contents in a failure reason', () => {
    jest
      .mocked(execa.sync)
      .mockReturnValueOnce(
        queryResult(
          lines(
            { type: 'warning', reason: 'private application data' },
            summary
          )
        )
      )
    start()
    expect(() => collector.refresh()).toThrow(
      new Error(
        'Failed to read complete Vercel runtime logs (CLI warning: unknown)'
      )
    )
  })

  it('reports a throwing consumer without including its private details', () => {
    start()
    append.mockImplementationOnce(() => {
      throw new Error('private consumer details')
    })
    expect(() => nextQuery(request('request-1', 'message'))).toThrow(
      new Error('Failed to deliver Vercel runtime logs')
    )
    expect(jest.getTimerCount()).toBe(0)
  })

  it('waits for a successful synchronous query after a temporary CLI failure', () => {
    jest.mocked(execa.sync).mockImplementationOnce(() => {
      throw Object.assign(new Error('private CLI details'), { exitCode: 1 })
    })
    start()
    collector.refresh()
    expect(execa.sync).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledWith(expect.any(Int32Array), 0, 0, 2_000)
    expect(warn).toHaveBeenCalledWith(
      'Vercel runtime log collection failed (attempt 1/3: CLI exit code 1); retrying in 2000ms'
    )
    expect(append).not.toHaveBeenCalled()
  })

  it('retries the same window without consuming partial output or duplicating logs', () => {
    start()
    nextQuery(request('request-1', 'first'))
    jest
      .mocked(execa.sync)
      .mockImplementationOnce(() => {
        throw Object.assign(new Error('private CLI details'), {
          exitCode: 1,
          stdout: cliOutput(request('partial', 'must not append')),
        })
      })
      .mockReturnValueOnce(
        queryResult(cliOutput(request('request-1', 'first', 'late')))
      )
    collector.refresh()
    expect(() => collector.assertHealthy()).not.toThrow()
    collector.refresh()
    expect(append.mock.calls).toEqual([
      ['first\n', 'stdout'],
      ['late\n', 'stdout'],
    ])
    const queries = jest.mocked(execa.sync).mock.calls
    expect(queries.at(-1)![1]).toEqual(queries[0][1])
  })

  it('resets the retry budget after a successful query', () => {
    start()
    for (let i = 0; i < 4; i++) {
      jest.mocked(execa.sync).mockImplementationOnce(() => {
        throw new Error('temporary failure')
      })
      collector.refresh()
    }
    nextQuery(request('request-1', 'recovered'))
    expect(append).toHaveBeenCalledWith('recovered\n', 'stdout')
    expect(() => collector.assertHealthy()).not.toThrow()
  })

  it.each([
    [{ timedOut: true }, 'timed out after 30000ms'],
    [{ exitCode: 1 }, 'CLI exit code 1'],
    [{}, 'CLI could not complete the query'],
  ])(
    'surfaces persistent CLI failures with safe diagnostics: %j',
    (details, reason) => {
      jest.mocked(execa.sync).mockImplementation(() => {
        throw Object.assign(new Error('private CLI details'), {
          ...details,
          stdout: 'private application output',
          stderr: 'private diagnostic output',
          command: 'vercel logs --token private-token',
        })
      })
      const failure = `Vercel runtime log collection failed (attempt 3/3: ${reason})`
      start()
      expect(() => collector.refresh()).toThrow(new Error(failure))
      expect(execa.sync).toHaveBeenCalledTimes(3)
      expect(warn.mock.calls).toEqual([
        [
          `Vercel runtime log collection failed (attempt 1/3: ${reason}); retrying in 2000ms`,
        ],
        [
          `Vercel runtime log collection failed (attempt 2/3: ${reason}); retrying in 4000ms`,
        ],
      ])
      expect(append).not.toHaveBeenCalled()
      expect(() => collector.assertHealthy()).toThrow('collection failed')
      expect(() => collector.stop()).toThrow(failure)
      expect(jest.getTimerCount()).toBe(0)
    }
  )

  it('prevents recursive queries when an output listener reads the logs', () => {
    start()
    append.mockImplementation(() => collector.refresh())
    nextQuery(request('request-1', 'message'))
    expect(execa.sync).toHaveBeenCalledTimes(1)
    expect(append).toHaveBeenCalledTimes(1)
  })

  it('bounds a real subprocess that ignores graceful termination', () => {
    jest.useRealTimers()
    const realExeca = jest.requireActual<typeof execa>('execa')
    jest.mocked(execa.sync).mockImplementation(() => {
      return realExeca.sync(
        process.execPath,
        ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
        { timeout: 100, killSignal: 'SIGKILL' }
      ) as unknown as ReturnType<typeof execa.sync>
    })
    start()
    const started = Date.now()
    expect(() => collector.refresh()).toThrow('collection failed')
    expect(Date.now() - started).toBeLessThan(5_000)
    expect(execa.sync).toHaveBeenCalledTimes(3)
    expect(append).not.toHaveBeenCalled()
  })

  it('stops without another query and leaves no background work', () => {
    start()
    nextQuery(request('request-1', 'message'))
    collector.stop()
    collector.refresh()
    expect(execa.sync).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })
})

it('waits for a real one-shot subprocess before returning its messages', () => {
  const realExeca = jest.requireActual<typeof execa>('execa')
  jest.mocked(execa.sync).mockImplementationOnce(() => {
    return realExeca.sync(process.execPath, [
      '-e',
      `console.log(${JSON.stringify(cliOutput(request('request-1', 'ready')))});
       console.error('CLI diagnostic');`,
    ]) as unknown as ReturnType<typeof execa.sync>
  })
  const append = jest.fn()
  const collector = new DeployRuntimeLogs(
    'https://fixture.vercel.app',
    { cwd: process.cwd(), env: process.env, flags: [] },
    append
  )
  try {
    collector.refresh()
    expect(append).toHaveBeenCalledWith('ready\n', 'stdout')
  } finally {
    collector.stop()
    jest.resetAllMocks()
  }
})
