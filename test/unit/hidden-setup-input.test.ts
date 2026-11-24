import { PassThrough } from 'node:stream'
import { withHiddenInput } from 'next/dist/lib/upgrade/secret-input'

type Read = (label: string) => Promise<string | null>

// A stand-in terminal that records what is written and when echo is off.
function terminal() {
  const written: string[] = []
  const rawModes: boolean[] = []
  const input = Object.assign(new PassThrough(), {
    isRaw: false,
    setRawMode(mode: boolean) {
      input.isRaw = mode
      rawModes.push(mode)
      return input
    },
  })
  const output = new PassThrough()
  output.on('data', (chunk) => written.push(chunk.toString()))
  return {
    written,
    rawModes,
    input,
    // The stand-ins implement only what the helper uses.
    streams: {
      input: input as unknown as NodeJS.ReadStream,
      output: output as unknown as NodeJS.WriteStream,
    },
  }
}

// Type after the helper has discarded what was waiting.
const typed = (input: PassThrough, ...chunks: string[]) =>
  setTimeout(() => chunks.forEach((chunk) => input.write(chunk)), 100)

describe('hidden setup input', () => {
  it('reads one line with echo off and never writes the value', async () => {
    const { input, written, rawModes, streams } = terminal()
    typed(input, 'secret-valuX\x7fe\r')
    const value = await withHiddenInput(async (read: Read) => {
      // Echo is already off before the line is requested.
      expect(input.isRaw).toBe(true)
      return read('Key')
    }, streams)
    expect(value).toBe('secret-value')
    expect(written.join('')).toBe('  Key: \n')
    // Echo comes back only after the task is done.
    expect(rawModes).toEqual([true, false])
  })

  it('drops key sequences, also when they arrive in pieces', async () => {
    const { input, streams } = terminal()
    typed(
      input,
      // Bracketed paste markers, an arrow key in both forms, and Alt+x.
      '\x1b[200~abc\x1b[20',
      '1~\x1b[A\x1bOAdef\x1bx',
      '\r'
    )
    await expect(
      withHiddenInput((read: Read) => read('Key'), streams)
    ).resolves.toBe('abcdef')
  })

  it.each([
    ['Escape', '\x1b'],
    ['Ctrl+C', 'abc\x03'],
  ])('resolves to null for %s and restores echo', async (_, keys) => {
    const { input, rawModes, streams } = terminal()
    typed(input, keys)
    await expect(
      withHiddenInput((read: Read) => read('Key'), streams)
    ).resolves.toBeNull()
    expect(rawModes).toEqual([true, false])
  })

  it('throws away what is typed before the line and while the task is busy', async () => {
    const { input, written, streams } = terminal()
    // A paste that arrives before the helper asks for the line.
    input.write('typed-ahead\r')
    typed(input, 'real\r')
    const value = await withHiddenInput(async (read: Read) => {
      const line = await read('Key')
      // A second paste during a slow request.
      input.write('second-paste\r')
      await new Promise((resolve) => setTimeout(resolve, 20))
      return line
    }, streams)
    expect(value).toBe('real')
    expect(written.join('')).not.toMatch(/typed-ahead|second-paste|real/)
    // Nothing is left for whoever reads the terminal next.
    expect(input.read()).toBeNull()
  })
})
