import {
  readVercelRuntimeLogs,
  type VercelCliResult,
} from 'vercel-runtime-logs'

const SINCE = new Date('2026-01-02T03:04:05.000Z')
const DEPLOYMENT = 'https://app-123.vercel.app'

const record = (message: string, truncated = false) =>
  JSON.stringify({ type: 'request', data: { message, truncated } })
const summary = (next: string | null = null, extra = {}) =>
  JSON.stringify({
    type: 'summary',
    recordsReturned: 1,
    pagination: { hasMore: next !== null, next },
    excludedIntervals: [],
    ...extra,
  })
const ok = (...lines: string[]): VercelCliResult => ({
  exitCode: 0,
  stdout: lines.join('\n'),
  stderr: '',
})

function runner(results: VercelCliResult[]) {
  const calls: { args: string[]; timeoutMs: number }[] = []
  const run = async (args: string[], timeoutMs: number) => {
    calls.push({ args, timeoutMs })
    const result = results.shift()
    if (!result) {
      throw new Error('unexpected call')
    }
    return result
  }
  return { run, calls }
}

const read = (
  run: (args: string[], timeoutMs: number) => Promise<VercelCliResult>,
  options: { deadline?: number; maxPages?: number } = {}
) =>
  readVercelRuntimeLogs(run, {
    deployment: DEPLOYMENT,
    since: SINCE,
    query: 'abc123',
    flags: ['--scope', 'team'],
    deadline: options.deadline ?? Date.now() + 60_000,
    maxPages: options.maxPages,
  })

describe('readVercelRuntimeLogs', () => {
  it('reads the messages of every page', async () => {
    const { run, calls } = runner([
      ok(record('one'), record('two'), summary('cursor-1')),
      ok(record('three'), summary()),
    ])
    expect(await read(run)).toEqual(['one', 'two', 'three'])
    expect(calls.map((call) => call.args)).toEqual([
      [
        'logs',
        '--deployment',
        DEPLOYMENT,
        '--since',
        SINCE.toISOString(),
        '--limit',
        '10000',
        '--query',
        'abc123',
        '--json',
        '--scope',
        'team',
      ],
      ['logs', '--next', 'cursor-1', '--json', '--scope', 'team'],
    ])
  })

  it('bounds every call by the overall deadline', async () => {
    const { run, calls } = runner([ok(summary())])
    await read(run, { deadline: Date.now() + 5_000 })
    expect(calls[0].timeoutMs).toBeGreaterThan(0)
    expect(calls[0].timeoutMs).toBeLessThanOrEqual(5_000)
    await expect(read(run, { deadline: Date.now() - 1 })).rejects.toThrow(
      /deadline/
    )
  })

  it.each([
    [
      'a failed command',
      { exitCode: 1, stdout: '', stderr: 'not authorized' },
      /exit code 1[\s\S]*not authorized/,
    ],
    [
      'a timed out command',
      { exitCode: 1, stdout: '', stderr: '', timedOut: true },
      /timed out/,
    ],
    ['non-JSON output', ok('Fetching logs...', summary()), /non-JSON/],
    [
      'an error result',
      ok(
        JSON.stringify({ status: 'error', reason: 'api_error', message: 'x' })
      ),
      /api_error/,
    ],
    [
      'a stream gap',
      ok(
        JSON.stringify({ type: 'warning', reason: 'stream_gap', message: 'x' }),
        summary()
      ),
      /stream gap/,
    ],
    [
      'excluded intervals',
      ok(summary(null, { excludedIntervals: [{ start: 1, end: 2 }] })),
      /excluded/,
    ],
    [
      'incomplete output',
      ok(summary(null, { outputIncomplete: true })),
      /incomplete/,
    ],
    ['a truncated message', ok(record('par', true), summary()), /truncated/],
    ['a missing summary', ok(record('one')), /summary/],
  ])('fails on %s', async (_, result, error) => {
    const { run } = runner([result as VercelCliResult])
    await expect(read(run)).rejects.toThrow(error)
  })

  it('fails when the pagination limit is reached', async () => {
    const { run } = runner([ok(summary('a')), ok(summary('b'))])
    await expect(read(run, { maxPages: 2 })).rejects.toThrow(/pagination/)
  })
})
