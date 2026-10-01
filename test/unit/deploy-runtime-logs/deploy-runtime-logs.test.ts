import execa from 'execa'
import { DeployRuntimeLogs } from '../../lib/next-modes/deploy-runtime-logs'

jest.mock('execa', () => jest.fn())

function queryResult(stdout = '') {
  return Promise.resolve({ stdout }) as unknown as ReturnType<typeof execa>
}

function request(id: string, ...messages: string[]) {
  return {
    id,
    message: 'HTTP request summary',
    logs: messages.map((message) => ({ message, level: 'info' })),
  }
}

describe('deploy runtime logs', () => {
  let collector: DeployRuntimeLogs
  let append: jest.Mock
  let warn: jest.SpyInstance

  function start() {
    collector = new DeployRuntimeLogs(
      'https://fixture.vercel.app',
      { cwd: '/fixture', env: process.env, flags: ['--scope', 'test-team'] },
      append
    )
    return collector.waitForReady()
  }

  async function nextQuery(...records: unknown[]) {
    jest
      .mocked(execa)
      .mockReturnValueOnce(
        queryResult(records.map((record) => JSON.stringify(record)).join('\n'))
      )
    await jest.advanceTimersByTimeAsync(2_000)
  }

  beforeEach(() => {
    jest.useFakeTimers()
    jest.mocked(execa).mockReturnValue(queryResult())
    append = jest.fn()
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(async () => {
    await collector?.stop().catch(() => {})
    warn.mockRestore()
    jest.resetAllMocks()
    jest.useRealTimers()
  })

  it('confirms access to quiet deployments before making test requests', async () => {
    await start()
    expect(execa).toHaveBeenCalledWith(
      'vercel',
      [
        'logs',
        'https://fixture.vercel.app',
        '--json',
        '--since',
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        '--limit',
        '1000',
        '--scope',
        'test-team',
      ],
      expect.objectContaining({ cwd: '/fixture', timeout: 30_000 })
    )
    expect(append).not.toHaveBeenCalled()
  })

  it('collects every application log instead of the request summary', async () => {
    await start()
    await nextQuery({
      ...request('request-1'),
      logs: [
        { message: 'Error: route failed', level: 'error' },
        {
          message: '<request-error>hook output</request-error>',
          level: 'info',
        },
      ],
    })
    expect(append.mock.calls).toEqual([
      ['Error: route failed\n', 'stderr'],
      ['<request-error>hook output</request-error>\n', 'stdout'],
    ])
  })

  it('ignores request summaries with no application messages', async () => {
    await start()
    await nextQuery(request('static-asset'))
    expect(append).not.toHaveBeenCalled()
  })

  it('collects late messages and preserves repeated text within and across requests', async () => {
    await start()
    await nextQuery(request('request-1', 'second'))
    await nextQuery(request('request-1', 'first', 'second', 'second'))
    await nextQuery(
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

  it('keeps polling beyond the live stream time limit with the same lower bound', async () => {
    await start()
    const firstArgs = jest.mocked(execa).mock.calls[0][1]
    await jest.advanceTimersByTimeAsync(5 * 60_000)
    await nextQuery(request('late-request', 'after five minutes'))
    expect(append).toHaveBeenCalledWith('after five minutes\n', 'stdout')
    expect(jest.mocked(execa).mock.calls.at(-1)![1]).toEqual(firstArgs)
    expect(() => collector.assertHealthy()).not.toThrow()
  })

  it('preserves Unicode, multiline stacks, whitespace and ANSI', async () => {
    const message =
      '\u001b[31mError: 🌍\u001b[0m\n    at action (page.tsx:2:3)\n'
    await start()
    await nextQuery(request('request-1', message))
    expect(append).toHaveBeenCalledWith(message, 'stdout')
  })

  it.each(['warning', 'warn', 'error', 'fatal'])(
    'maps %s severity to stderr',
    async (level) => {
      await start()
      await nextQuery({
        id: 'request-1',
        logs: [{ message: 'warning', level }],
      })
      expect(append).toHaveBeenCalledWith('warning\n', 'stderr')
    }
  )

  it.each([
    'not json',
    'null',
    JSON.stringify({ logs: [] }),
    JSON.stringify({ id: 'request-1', message: 'summary' }),
    JSON.stringify({ id: 'request-1', logs: [null] }),
    JSON.stringify({ id: 'request-1', logs: [{ level: 'info' }] }),
    JSON.stringify({
      ...request('request-1', 'partial'),
      messageTruncated: true,
    }),
    JSON.stringify({
      id: 'request-1',
      logs: [{ message: 'partial', messageTruncated: true }],
    }),
  ])('rejects malformed or incomplete query output: %s', async (output) => {
    jest.mocked(execa).mockReturnValueOnce(queryResult(output))
    await expect(start()).rejects.toThrow('complete Vercel runtime logs')
    expect(append).not.toHaveBeenCalled()
    await expect(collector.stop()).rejects.toThrow(
      'complete Vercel runtime logs'
    )
  })

  it('fails instead of losing requests when the query limit is reached', async () => {
    jest
      .mocked(execa)
      .mockReturnValueOnce(
        queryResult(
          Array.from({ length: 1000 }, (_, i) =>
            JSON.stringify(request(`${i}`))
          ).join('\n')
        )
      )
    await expect(start()).rejects.toThrow('complete Vercel runtime logs')
  })

  it('reports a throwing consumer without including its private details', async () => {
    await start()
    append.mockImplementationOnce(() => {
      throw new Error('private consumer details')
    })
    await nextQuery(request('request-1', 'message'))
    expect(() => collector.assertHealthy()).toThrow(
      new Error('Failed to deliver Vercel runtime logs')
    )
    expect(jest.getTimerCount()).toBe(0)
  })

  it('waits for a successful startup query after a temporary CLI failure', async () => {
    jest
      .mocked(execa)
      .mockRejectedValueOnce(
        Object.assign(new Error('private CLI details'), { exitCode: 1 })
      )
    const ready = jest.fn()
    const starting = start().then(ready)
    await jest.advanceTimersByTimeAsync(1_999)
    expect(ready).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(1)
    await starting
    expect(ready).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      'Vercel runtime log collection failed (attempt 1/3: CLI exit code 1); retrying in 2000ms'
    )
    expect(append).not.toHaveBeenCalled()
  })

  it('retries the same window without consuming partial output or duplicating logs', async () => {
    await start()
    await nextQuery(request('request-1', 'first'))
    jest
      .mocked(execa)
      .mockRejectedValueOnce(
        Object.assign(new Error('private CLI details'), {
          exitCode: 1,
          stdout: JSON.stringify(request('partial', 'must not append')),
        })
      )
      .mockReturnValueOnce(
        queryResult(JSON.stringify(request('request-1', 'first', 'late')))
      )
    await jest.advanceTimersByTimeAsync(2_000)
    expect(() => collector.assertHealthy()).not.toThrow()
    await jest.advanceTimersByTimeAsync(2_000)
    expect(append.mock.calls).toEqual([
      ['first\n', 'stdout'],
      ['late\n', 'stdout'],
    ])
    const queries = jest.mocked(execa).mock.calls
    expect(queries.at(-1)![1]).toEqual(queries[0][1])
  })

  it('resets the retry budget after a successful query', async () => {
    await start()
    for (let i = 0; i < 4; i++) {
      jest.mocked(execa).mockRejectedValueOnce(new Error('temporary failure'))
      await jest.advanceTimersByTimeAsync(4_000)
    }
    await nextQuery(request('request-1', 'recovered'))
    expect(append).toHaveBeenCalledWith('recovered\n', 'stdout')
    expect(() => collector.assertHealthy()).not.toThrow()
  })

  it.each([
    [{ timedOut: true }, 'timed out after 30000ms'],
    [{ exitCode: 1 }, 'CLI exit code 1'],
    [{}, 'CLI could not complete the query'],
  ])(
    'surfaces persistent CLI failures with safe diagnostics: %j',
    async (details, reason) => {
      jest.mocked(execa).mockRejectedValue(
        Object.assign(new Error('private CLI details'), {
          ...details,
          stdout: 'private application output',
          stderr: 'private diagnostic output',
          command: 'vercel logs --token private-token',
        })
      )
      const failure = `Vercel runtime log collection failed (attempt 3/3: ${reason})`
      const starting = start().catch((error) => error)
      await jest.advanceTimersByTimeAsync(6_000)
      expect(await starting).toEqual(new Error(failure))
      expect(execa).toHaveBeenCalledTimes(3)
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
      await expect(collector.stop()).rejects.toThrow(failure)
      expect(jest.getTimerCount()).toBe(0)
    }
  )

  it('stops during retry backoff without issuing another query or hiding the failure', async () => {
    await start()
    jest.mocked(execa).mockRejectedValueOnce(new Error('temporary failure'))
    await jest.advanceTimersByTimeAsync(2_000)
    await expect(collector.stop()).rejects.toThrow('collection failed')
    expect(execa).toHaveBeenCalledTimes(2)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('does not retry a query that fails during shutdown', async () => {
    await start()
    let fail!: (error: Error) => void
    jest.mocked(execa).mockReturnValueOnce(
      new Promise((_, reject) => {
        fail = reject
      }) as unknown as ReturnType<typeof execa>
    )
    await jest.advanceTimersByTimeAsync(2_000)
    const stopping = collector.stop()
    fail(new Error('private CLI details'))
    await expect(stopping).rejects.toThrow('collection failed')
    expect(execa).toHaveBeenCalledTimes(2)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('finishes an in-flight query during cleanup without starting another', async () => {
    await start()
    let finish!: (value: { stdout: string }) => void
    jest.mocked(execa).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }) as unknown as ReturnType<typeof execa>
    )
    await jest.advanceTimersByTimeAsync(2_000)
    const stopped = jest.fn()
    const stopping = collector.stop().then(stopped)
    await Promise.resolve()
    expect(stopped).not.toHaveBeenCalled()
    finish({ stdout: JSON.stringify(request('late', 'must not append')) })
    await stopping
    expect(append).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  })
})

it('collects and shuts down a real one-shot subprocess', async () => {
  const realExeca = jest.requireActual<typeof execa>('execa')
  jest.mocked(execa).mockImplementationOnce(() => {
    return realExeca(process.execPath, [
      '-e',
      `console.log(${JSON.stringify(JSON.stringify(request('request-1', 'ready')))});
       console.error('CLI diagnostic');`,
    ]) as unknown as ReturnType<typeof execa>
  })
  const append = jest.fn()
  const collector = new DeployRuntimeLogs(
    'https://fixture.vercel.app',
    { cwd: process.cwd(), env: process.env, flags: [] },
    append
  )
  try {
    await collector.waitForReady()
    expect(append).toHaveBeenCalledWith('ready\n', 'stdout')
  } finally {
    await collector.stop()
    jest.resetAllMocks()
  }
})
