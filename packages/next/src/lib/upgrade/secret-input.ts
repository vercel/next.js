const escape = String.fromCharCode(27)

type Terminal = {
  input: NodeJS.ReadStream
  output: NodeJS.WriteStream
}

// Keep typing off the screen for as long as `task` runs, and hand it a
// function that reads one hidden line. The line resolves to null when the user
// presses Esc or Ctrl+C. Anything typed or pasted while `task` is busy, for
// example a second paste during a slow request, is thrown away instead of
// being shown or left for the shell.
export async function withHiddenInput<T>(
  task: (read: (label: string) => Promise<string | null>) => Promise<T>,
  { input, output }: Terminal = { input: process.stdin, output: process.stdout }
): Promise<T> {
  const wasRaw = input.isRaw ?? false
  const discard = () => {}
  // Read and drop whatever is waiting, including input the terminal buffered
  // before echo went off.
  const drain = async () => {
    input.on('data', discard)
    input.resume()
    await new Promise((resolve) => setTimeout(resolve, 50))
    input.removeListener('data', discard)
    input.pause()
  }
  const read = async (label: string) => {
    await drain()
    output.write(`  ${label}: `)
    return new Promise<string | null>((resolve) => {
      let value = ''
      // Where the next character falls in a key sequence such as an arrow key
      // or the markers a terminal puts around pasted text.
      let sequence: 'none' | 'escape' | 'parameters' | 'final' = 'none'
      const finish = (result: string | null) => {
        input.removeListener('data', onData)
        input.pause()
        output.write('\n')
        resolve(result)
      }
      const onData = (chunk: Buffer) => {
        const text = chunk.toString('utf8')
        if ((sequence === 'none' && text === escape) || text.includes('\x03')) {
          finish(null)
          return
        }
        for (const character of text) {
          if (sequence === 'escape') {
            // `ESC [` starts a longer sequence, `ESC O` takes one more
            // character, and anything else is Alt with that key.
            sequence =
              character === '['
                ? 'parameters'
                : character === 'O'
                  ? 'final'
                  : 'none'
          } else if (sequence === 'parameters') {
            if (character >= '@' && character <= '~') {
              sequence = 'none'
            }
          } else if (sequence === 'final') {
            sequence = 'none'
          } else if (character === escape) {
            sequence = 'escape'
          } else if (character === '\r' || character === '\n') {
            finish(value)
            return
          } else if (character === '\x7f' || character === '\b') {
            value = value.slice(0, -1)
          } else if (character >= ' ') {
            value += character
          }
        }
      }
      input.on('data', onData)
      input.resume()
    })
  }
  input.setRawMode(true)
  try {
    return await task(read)
  } finally {
    await drain()
    input.setRawMode(wasRaw)
  }
}
