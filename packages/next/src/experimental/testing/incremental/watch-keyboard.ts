import { StringDecoder } from 'string_decoder'

export type WatchCommand =
  | {
      type:
        | 'rerun'
        | 'all'
        | 'failed'
        | 'quit'
        | 'interrupt'
        | 'cancel'
        | 'update'
    }
  | { type: 'files' | 'project' | 'name'; value: string }

/** Own raw input only for an actual interactive terminal. */
export function createWatchKeyboard(options: {
  input: NodeJS.ReadStream
  output: NodeJS.WriteStream
  onCommand(command: WatchCommand): void
  onError(error: unknown): void
  isRunning?(): boolean
  write?(text: string): void
  onPromptChange?(active: boolean): void
}) {
  const { input, output } = options
  if (
    !input.isTTY ||
    !output.isTTY ||
    process.env.CI ||
    process.env.TERM === 'dumb'
  ) {
    return { enabled: false, close() {} }
  }
  const write = options.write ?? ((text: string) => output.write(text))
  const wasRaw = input.isRaw
  const wasFlowing = input.readableFlowing
  const decoder = new StringDecoder('utf8')
  let closed = false
  let prompt: 'files' | 'project' | 'name' | undefined
  let value = ''
  let escape = ''
  let escapeTimer: ReturnType<typeof setTimeout> | undefined

  function endPrompt() {
    if (!prompt) return
    prompt = undefined
    write('\n')
    options.onPromptChange?.(false)
  }
  function close() {
    if (closed) return
    closed = true
    clearTimeout(escapeTimer)
    input.removeListener('data', onData)
    input.removeListener('error', onError)
    input.removeListener('end', onEnd)
    try {
      endPrompt()
    } finally {
      try {
        input.setRawMode(wasRaw)
      } finally {
        if (wasFlowing !== true) {
          input.pause()
          // Node exposes a setter although its public type is readonly.
          Reflect.set(input, 'readableFlowing', wasFlowing)
        }
      }
    }
  }
  function onError(error: unknown) {
    try {
      close()
    } finally {
      options.onError(error)
    }
  }
  function onEnd() {
    options.onCommand({ type: 'quit' })
  }
  function onEscape() {
    escape = ''
    try {
      if (prompt) endPrompt()
      else options.onCommand({ type: 'interrupt' })
    } catch (error) {
      onError(error)
    }
  }
  function onData(data: Buffer | string) {
    try {
      for (const character of typeof data === 'string'
        ? data
        : decoder.write(data)) {
        if (closed) break
        if (character === '\x03') {
          if (prompt) endPrompt()
          else options.onCommand({ type: 'interrupt' })
          continue
        }
        // Consume terminal escape sequences, including split arrow-key packets.
        if (escape) {
          clearTimeout(escapeTimer)
          escape += character
          if (escape.length === 2 && character !== '[' && character !== 'O')
            escape = ''
          else if (escape.length > 2 && /[\x40-\x7e]/.test(character))
            escape = ''
          continue
        }
        if (character === '\x1b') {
          escape = character
          escapeTimer = setTimeout(onEscape, 25)
          continue
        }
        if (prompt) {
          if (character === '\r' || character === '\n') {
            const type = prompt
            if (type === 'name' && value) {
              try {
                new RegExp(value)
              } catch {
                write('\nInvalid regular expression. Test name pattern: ')
                value = ''
                continue
              }
            }
            endPrompt()
            options.onCommand({ type, value: value.trim() })
          } else if (character === '\x7f' || character === '\b') {
            if (value) {
              value = Array.from(value).slice(0, -1).join('')
              write('\b \b')
            }
          } else if (character >= ' ' && character !== '\x7f') {
            value += character
            write(character)
          }
          continue
        }
        if (options.isRunning?.() && ' chrafutpwq\r\n'.includes(character)) {
          options.onCommand({ type: 'cancel' })
          continue
        }
        if (character === 'p' || character === 'w' || character === 't') {
          prompt =
            character === 'p' ? 'files' : character === 't' ? 'name' : 'project'
          value = ''
          options.onPromptChange?.(true)
          write(
            prompt === 'name'
              ? '\nTest name pattern (RegExp, empty clears): '
              : prompt === 'files'
                ? '\nFilename filter (empty clears): '
                : '\nProject name (empty selects all): '
          )
        } else if (character === 'h') {
          options.onPromptChange?.(true)
          try {
            write(
              '\n  Watch Usage\n  press a, enter to rerun all tests\n  press r to rerun current pattern tests\n  press f to rerun failed files\n  press u to update snapshots\n  press t to filter by test name regex\n  press p to filter by filename\n  press w to select a project\n  press q to quit\n  press Ctrl+C to cancel and quit\n\n'
            )
          } finally {
            options.onPromptChange?.(false)
          }
        } else {
          const type =
            character === 'u'
              ? 'update'
              : character === 'q'
                ? 'quit'
                : character === 'r'
                  ? 'rerun'
                  : character === 'f'
                    ? 'failed'
                    : character === 'a' ||
                        character === '\r' ||
                        character === '\n'
                      ? 'all'
                      : undefined
          if (type) options.onCommand({ type })
        }
      }
    } catch (error) {
      onError(error)
    }
  }
  try {
    input.setRawMode(true)
    input.on('data', onData)
    input.on('error', onError)
    input.on('end', onEnd)
    input.resume()
  } catch (error) {
    close()
    throw error
  }
  return { enabled: true, close }
}
