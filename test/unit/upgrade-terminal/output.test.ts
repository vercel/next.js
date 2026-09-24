import { Writable } from 'node:stream'
import { UpgradeOutput } from 'next/dist/lib/upgrade/output'

// In-memory destinations record what would reach stdout/stderr. A write callback
// means the destination finished writing; withholding it simulates a slow terminal.
function setup(limit = 1024 * 1024, captureStderr = true) {
  const writes: [string, Buffer][] = []
  const sink = (name: string) =>
    new Writable({
      write(chunk, _encoding, callback) {
        if (chunk.length > 0) {
          writes.push([name, Buffer.from(chunk)])
        }
        callback()
      },
    })
  const stdout = sink('stdout')
  const stderr = sink('stderr')
  const output = new UpgradeOutput(stdout, stderr, captureStderr, limit)
  const text = () => writes.map(([name, chunk]) => [name, chunk.toString()])
  return { output, writes, text }
}

describe('upgrade output', () => {
  it('keeps redirected stderr live during a menu', async () => {
    // stderr represents a file, so it must receive errors even while stdout is held.
    const { output, text } = setup(1024, false)
    await output.hold(jest.fn())
    output.stdout.write('held')
    output.stderr.write('file')
    expect(text()).toEqual([['stderr', 'file']])
    await output.resume()
    await output.whenDrained()
    expect(text()).toEqual([
      ['stderr', 'file'],
      ['stdout', 'held'],
    ])
  })

  it('cancels once at the limit and releases pending writers on replay', async () => {
    const { output, text } = setup(8)
    const cancel = jest.fn()
    const finished = jest.fn()
    await output.hold(cancel)
    output.stdout.write('123456')
    output.stderr.write('abcdef', finished)
    // Twelve bytes exceed the eight-byte limit. Cancel once and wait for replay
    // before accepting more output, keeping memory bounded.
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(finished).toHaveBeenCalledTimes(0)
    expect(text()).toEqual([])
    await output.resume()
    await output.whenDrained()
    expect(finished).toHaveBeenCalledTimes(1)
    expect(text()).toEqual([
      ['stdout', '123456'],
      ['stderr', 'abcdef'],
    ])
  })

  it('awaits prior destination writes before entering the menu', async () => {
    let finishWrite: (() => void) | null = null
    const slow = new Writable({
      write(_chunk, _encoding, callback) {
        finishWrite = callback
      },
    })
    const output = new UpgradeOutput(slow, slow, true)
    output.stdout.write('pending')
    const entered = jest.fn()
    const holding = output.hold(jest.fn()).then(entered)
    // Give hold() a chance to settle; it must wait for the pending log write.
    await Promise.resolve()
    expect(entered).toHaveBeenCalledTimes(0)
    finishWrite!()
    await holding
    expect(entered).toHaveBeenCalledWith(true)
  })

  it('waits for screen restoration before replaying stderr', async () => {
    const writes: string[] = []
    let finishRestoringScreen: (() => void) | null = null
    const terminal = new Writable({
      write(chunk, _encoding, callback) {
        if (chunk.toString() === 'restore') {
          finishRestoringScreen = callback
        } else {
          callback()
        }
      },
    })
    const stderr = new Writable({
      write(chunk, _encoding, callback) {
        writes.push(chunk.toString())
        callback()
      },
    })
    const output = new UpgradeOutput(terminal, stderr, true)
    await output.hold(jest.fn())
    output.stderr.write('retained')
    terminal.write('restore')
    const resuming = output.resume('fallback warning')
    // Neither the warning nor buffered logs may print before screen restoration.
    await Promise.resolve()
    expect(writes).toEqual([])
    finishRestoringScreen!()
    await resuming
    await output.whenDrained()
    expect(writes).toEqual(['fallback warning', 'retained'])
  })

  it.each([
    // Split a UTF-8 character, an ANSI color sequence, and a hyperlink sequence.
    [Buffer.from('😀').subarray(0, 2), Buffer.from('😀').subarray(2)],
    [Buffer.from('\x1b[3'), Buffer.from('1mred\x1b[0m')],
    [Buffer.from('\x1b]8;;https://nextjs.org'), Buffer.from('\x1b\\link')],
  ])(
    'declines a menu at an incomplete output boundary',
    async (first, last) => {
      const { output, writes } = setup()
      output.stdout.write(first)
      // Menu-control bytes or a warning here would interrupt the unfinished sequence.
      expect(await output.hold(jest.fn())).toBe(false)
      await output.resume('fallback warning\n')
      await output.whenDrained()
      expect(Buffer.concat(writes.map(([, chunk]) => chunk))).toEqual(first)
      // Once the sequence finishes, the warning should print exactly once.
      output.stdout.write(last)
      await output.whenDrained()
      expect(Buffer.concat(writes.map(([, chunk]) => chunk))).toEqual(
        Buffer.concat([first, last, Buffer.from('fallback warning\n')])
      )
      expect(writes.filter(([name]) => name === 'stderr')).toHaveLength(1)
      expect(await output.hold(jest.fn())).toBe(true)
      await output.resume()
    }
  )

  it('logs to redirected stderr without waiting for a terminal boundary', async () => {
    const { output, text } = setup(1024, false)
    output.stdout.write('\x1b[3')
    expect(await output.hold(jest.fn())).toBe(false)
    // stderr targets a separate file, so its warning needn't wait for stdout.
    await output.resume('fallback warning\n')
    await output.whenDrained()
    expect(text()).toEqual([
      ['stdout', '\x1b[3'],
      ['stderr', 'fallback warning\n'],
    ])
    expect(await output.hold(jest.fn())).toBe(false)
    await output.resume()
  })

  it('preserves split Unicode while holding output', async () => {
    const { output, writes } = setup()
    await output.hold(jest.fn())
    const text = Buffer.from('👩🏽‍💻\r\n')
    output.stdout.write(text.subarray(0, 3))
    output.stdout.write(text.subarray(3))
    // Replay must preserve the original bytes across chunk boundaries.
    await output.resume()
    await output.whenDrained()
    expect(Buffer.concat(writes.map(([, chunk]) => chunk))).toEqual(text)
  })

  it('reports failed writes instead of treating output as drained', async () => {
    const error = new Error('output failed')
    const terminal = new Writable({
      write(_chunk, _encoding, callback) {
        callback(error)
      },
    })
    terminal.on('error', () => {})
    const output = new UpgradeOutput(terminal, terminal, true)
    output.stdout.write('message')
    const cancel = jest.fn()
    // A broken destination must report failure without invoking buffer-limit cancellation.
    await expect(output.hold(cancel)).rejects.toBe(error)
    expect(cancel).toHaveBeenCalledTimes(0)
    await expect(output.whenDrained()).rejects.toBe(error)
  })

  it('reports a replay failure without waiting for another worker write', async () => {
    const error = new Error('replay failed')
    const terminal = new Writable({
      write(chunk, _encoding, callback) {
        callback(chunk.length > 0 ? error : null)
      },
    })
    terminal.on('error', () => {})
    const output = new UpgradeOutput(terminal, terminal, true)
    const failed = new Promise<Error>((resolve) => {
      output.stdout.once('error', resolve)
    })
    const cancel = jest.fn()
    await output.hold(cancel)
    output.stdout.write('retained')
    await output.resume()
    // Even after held writes were accepted, a replay failure must reach the caller.
    await expect(failed).resolves.toBe(error)
    await expect(output.whenDrained()).rejects.toBe(error)
    expect(cancel).toHaveBeenCalledTimes(0)
  })
})
