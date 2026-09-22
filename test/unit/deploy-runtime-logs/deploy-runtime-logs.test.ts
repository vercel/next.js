import execa from 'execa'
import { PassThrough } from 'stream'
import { DeployRuntimeLogs } from '../../lib/next-modes/deploy-runtime-logs'

jest.mock('execa', () => jest.fn())

it('shuts down a real subprocess after collecting output', async () => {
  const realExeca = jest.requireActual<typeof execa>('execa')
  let child: execa.ExecaChildProcess<string> | undefined
  jest.mocked(execa).mockImplementationOnce(() => {
    child = realExeca(
      process.execPath,
      [
        '-e',
        `console.log(JSON.stringify({ message: 'ready' }));
         console.error('CLI diagnostic');
         setInterval(() => {}, 1000)`,
      ],
      { buffer: false }
    )
    // Jest models the last execa overload (Buffer output), while this call
    // uses its default string encoding.
    return child as unknown as ReturnType<typeof execa>
  })
  let onMessage: (message: string) => void
  const message = new Promise<string>((resolve) => {
    onMessage = resolve
  })
  const collector = new DeployRuntimeLogs(
    'https://fixture.vercel.app',
    { cwd: process.cwd(), env: process.env, flags: [] },
    (value) => onMessage(value)
  )
  let timer: ReturnType<typeof setTimeout>
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Collector did not stop')), 3000)
  })
  try {
    await Promise.race([
      (async () => {
        expect(await message).toBe('ready\n')
        await collector.stop()
      })(),
      deadline,
    ])
  } finally {
    clearTimeout(timer!)
    // Release the real process even when the shutdown regression occurs.
    child?.all?.resume()
    child?.kill('SIGKILL')
    await child?.catch(() => {})
    jest.clearAllMocks()
  }
})

describe('deploy runtime logs', () => {
  let stdout: PassThrough
  let stderr: PassThrough
  let finish: () => void
  let fail: () => void
  let kill: jest.Mock
  let collector: DeployRuntimeLogs
  let output: string
  let append: jest.Mock

  beforeEach(() => {
    stdout = new PassThrough()
    stderr = new PassThrough()
    const completion = new Promise<void>((resolve, reject) => {
      finish = resolve
      fail = () => reject(new Error('CLI failed'))
    })
    kill = jest.fn(() => {
      finish()
      return true
    })
    jest.mocked(execa).mockReturnValue(
      Object.assign(completion, {
        stdout,
        stderr,
        kill,
      }) as unknown as ReturnType<typeof execa>
    )
    output = 'build output\n'
    append = jest.fn((message: string) => {
      output += message
    })
    collector = new DeployRuntimeLogs(
      'https://fixture.vercel.app',
      { cwd: '/fixture', env: process.env, flags: ['--scope', 'test-team'] },
      append
    )
  })

  afterEach(async () => {
    // Failure assertions are made by the tests before releasing the streams.
    await collector.stop().catch(() => {})
    stdout.destroy()
    stderr.destroy()
    jest.clearAllMocks()
  })

  it('preserves build output and decodes chunked Unicode JSON records', () => {
    const record = Buffer.from(
      JSON.stringify({ message: 'hello 🌍\nsecond line', level: 'info' }) + '\n'
    )
    const split = record.indexOf(Buffer.from('🌍')) + 1
    stdout.write(record.subarray(0, split))
    expect(output).toBe('build output\n')
    stdout.write(record.subarray(split))
    stdout.write(JSON.stringify({ message: 'error\n', level: 'error' }) + '\n')
    stderr.write('CLI status messages must not enter application output')
    expect(output).toBe('build output\nhello 🌍\nsecond line\nerror\n')
    expect(append).toHaveBeenLastCalledWith('error\n', 'stderr')
    expect(execa).toHaveBeenCalledWith(
      'vercel',
      [
        'logs',
        'https://fixture.vercel.app',
        '--follow',
        '--json',
        '--scope',
        'test-team',
      ],
      expect.objectContaining({ cwd: '/fixture', buffer: false })
    )
  })

  it.each([
    'not json\n',
    JSON.stringify({ level: 'error' }) + '\n',
    JSON.stringify({ message: 'partial', messageTruncated: true }) + '\n',
    JSON.stringify({ message: 'limit', source: 'delimiter' }) + '\n',
  ])('fails on malformed or incomplete runtime records: %s', (record) => {
    stdout.write(record)
    expect(() => collector.assertHealthy()).toThrow(
      'complete Vercel runtime logs'
    )
    expect(append).not.toHaveBeenCalled()
    expect(kill).toHaveBeenCalled()
  })

  it.each(['warning', 'warn', 'error', 'fatal'])(
    'includes %s messages in cliOutput and the stderr event',
    (level) => {
      const message = 'Request body exceeded 10MB for /api/echo'
      stdout.write(JSON.stringify({ message, level }) + '\n')
      expect(output).toContain(message)
      expect(append).toHaveBeenCalledWith(message + '\n', 'stderr')
    }
  )

  it('preserves multiline stack traces, whitespace and ANSI without CLI decorations', () => {
    const message =
      '\u001b[31mError: example\u001b[0m\n    at action (app/page.tsx:2:3)\n'
    stdout.write(
      JSON.stringify({ message, level: 'error', source: 'edge-function' }) +
        '\n'
    )
    expect(output.slice('build output\n'.length)).toBe(message)
  })

  it('deduplicates replayed rows without hiding repeated application messages', () => {
    const record = { rowId: 'row-1', message: 'register-log', level: 'info' }
    stdout.write(JSON.stringify(record) + '\n')
    stdout.write(JSON.stringify(record) + '\n')
    stdout.write(JSON.stringify({ ...record, rowId: 'row-2' }) + '\n')
    stdout.write(JSON.stringify({ message: 'register-log' }) + '\n')
    stdout.write(JSON.stringify({ message: 'register-log' }) + '\n')
    expect(append).toHaveBeenCalledTimes(4)
  })

  it('keeps append-only offsets stable as late logs arrive', () => {
    const offset = output.length
    stdout.write(JSON.stringify({ message: 'first' }) + '\n')
    expect(output.slice(offset)).toBe('first\n')
    stdout.write(JSON.stringify({ message: 'second' }) + '\n')
    expect(output.slice(offset)).toBe('first\nsecond\n')
  })

  it('does not hide an already-rejected collector during immediate cleanup', async () => {
    fail()
    await expect(collector.stop()).rejects.toThrow('collection failed')
  })

  it('surfaces collection failures when reading and during teardown', async () => {
    fail()
    await Promise.resolve()
    expect(() => collector.assertHealthy()).toThrow('collection failed')
    await expect(collector.stop()).rejects.toThrow('collection failed')
  })

  it('does not silently accept an expired or disconnected stream', async () => {
    finish()
    await Promise.resolve()
    expect(() => collector.assertHealthy()).toThrow('ended unexpectedly')
    await expect(collector.stop()).rejects.toThrow('ended unexpectedly')
  })

  it('terminates collection without reporting deliberate cleanup as failure', async () => {
    await expect(collector.stop()).resolves.toBeUndefined()
    expect(kill).toHaveBeenCalledWith('SIGTERM', {
      forceKillAfterTimeout: 1000,
    })
    stdout.write(JSON.stringify({ message: 'late' }) + '\n')
    expect(append).not.toHaveBeenCalled()
  })
})
