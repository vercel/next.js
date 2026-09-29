type EscapeState = 'none' | 'escape' | 'csi' | 'string' | 'string-escape'

/**
 * Track ANSI sequences across PTY chunks. If dev has emitted only part of a
 * sequence, its remainder could affect the menu when it takes the screen.
 */
function createOutputBoundary() {
  let escape: EscapeState = 'none'

  function accept(data: string): void {
    for (let index = 0; index < data.length; index++) {
      const byte = data.charCodeAt(index)
      if (byte === 0x18 || byte === 0x1a) {
        escape = 'none'
      } else if (escape === 'string-escape') {
        escape = byte === 0x5c ? 'none' : 'string'
      } else if (escape === 'string') {
        if (byte === 0x07) {
          escape = 'none'
        } else if (byte === 0x1b) {
          escape = 'string-escape'
        }
      } else if (byte === 0x1b) {
        escape = 'escape'
      } else if (escape === 'escape') {
        if (byte === 0x5b) {
          escape = 'csi'
        } else if ([0x50, 0x58, 0x5d, 0x5e, 0x5f].includes(byte)) {
          escape = 'string'
        } else if (byte >= 0x30 && byte <= 0x7e) {
          escape = 'none'
        }
      } else if (escape === 'csi' && byte >= 0x40 && byte <= 0x7e) {
        escape = 'none'
      }
    }
  }

  return {
    get complete(): boolean {
      return escape === 'none'
    },
    accept,
  }
}

function write(terminal: NodeJS.WriteStream, data: string): Promise<void> {
  return new Promise((resolve, reject) => {
    terminal.write(data, (error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

/**
 * Keep dev logs off the menu while dev continues running. Queue PTY output
 * during the prompt, then replay it in order; abort the prompt if the queue
 * grows too large, and drain pending writes before the supervisor exits.
 */
export function createUpgradeTerminalOutput(
  terminal: NodeJS.WriteStream,
  onError: (error: Error) => void,
  limit = 1024 * 1024
) {
  const boundary = createOutputBoundary()
  const queue: string[] = []
  let queuedBytes = 0
  let held = false
  let flushing: Promise<void> | null = null
  let failure: Error | null = null
  let onLimit: (() => void) | null = null

  function accept(data: string): void {
    queue.push(data)
    queuedBytes += Buffer.byteLength(data)
    // Abort the menu at the buffer limit so dev output can resume.
    if (held && queuedBytes >= limit) {
      const callback = onLimit
      onLimit = null
      callback?.()
    }
    flush()
  }

  function flush(): void {
    if (held || flushing || failure) {
      return
    }
    // Serialize writes so replay cannot overtake output already in flight.
    flushing = (async () => {
      while (!held && queue.length > 0) {
        const data = queue.shift()!
        queuedBytes -= Buffer.byteLength(data)
        await write(terminal, data)
        boundary.accept(data)
      }
    })()
      .catch((error: Error) => {
        failure = error
        onError(error)
      })
      .finally(() => {
        flushing = null
        if (!held && queue.length > 0) {
          flush()
        }
      })
  }

  async function hold(onLimitReached: () => void): Promise<boolean> {
    held = true
    onLimit = onLimitReached
    // Finish an in-flight write before the menu draws on the same terminal.
    await flushing
    if (failure) {
      throw failure
    }
    // Reject a menu boundary if the last visible bytes started an ANSI sequence.
    return boundary.complete
  }

  async function resume(): Promise<void> {
    // The menu restores the normal screen immediately before replay begins.
    await write(terminal, '')
    onLimit = null
    held = false
    flush()
  }

  async function drain(): Promise<void> {
    // Finish queued terminal writes before the final exit or upgrade.
    while (flushing) {
      await flushing
    }
    if (failure) {
      throw failure
    }
  }

  return { accept, hold, resume, drain }
}
