// Keep typing off the screen for as long as `task` runs, and hand it a
// function that reads one line, shown as one * per character. The line
// resolves to null when the user presses Esc or Ctrl+C. Anything typed or
// pasted while `task` is busy, for example a second paste during a slow
// request, is thrown away instead of being shown or left for the shell.
export async function withHiddenInput<T>({
  task,
  input,
  output,
}: {
  task: (read: (label: string) => Promise<string | null>) => Promise<T>
  input: NodeJS.ReadStream
  output: NodeJS.WriteStream
}): Promise<T> {
  const wasRaw = input.isRaw ?? false
  // Drop whatever is waiting, including input the terminal buffered before
  // echo went off: a flowing stream without a data listener loses its data.
  const drain = async () => {
    input.resume()
    await new Promise((resolve) => setTimeout(resolve, 50))
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
        if ((sequence === 'none' && text === '\x1b') || text.includes('\x03')) {
          finish(null)
          return
        }

        const characters = [...text]
        for (const [index, character] of characters.entries()) {
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
          } else if (character === '\x1b') {
            sequence = 'escape'
          } else if (character === '\r' || character === '\n') {
            // A line break inside one paste comes from a wrapped token.
            if (index < characters.length - 1) {
              continue
            }

            finish(value)
            return
          } else if (character === '\x7f' || character === '\b') {
            if (value) {
              value = [...value].slice(0, -1).join('')
              output.write('\b \b')
            }
          } else if (character >= ' ') {
            value += character
            output.write('*')
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
