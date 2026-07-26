// The destination is gone for good: every subsequent write fails the same way.
const FATAL_STDIO_ERROR_CODES = new Set([
  'EPIPE',
  'ECONNRESET',
  'EBADF',
  'ERR_STREAM_DESTROYED',
])

const silenced = new Set<'stdout' | 'stderr'>()
let initialized = false

function silence(stream: NodeJS.WriteStream, name: 'stdout' | 'stderr') {
  if (silenced.has(name)) {
    return
  }
  silenced.add(name)

  // Retrying the write per log line only burns CPU and produces more errors.
  stream.write = function noopWrite(
    _chunk: unknown,
    encoding?: unknown,
    callback?: unknown
  ) {
    const cb = typeof encoding === 'function' ? encoding : callback
    if (typeof cb === 'function') {
      process.nextTick(cb as () => void)
    }
    return true
  } as NodeJS.WriteStream['write']

  // If the other stream is still alive (`next dev | head -20` leaves stderr
  // attached to the terminal) say why the output stopped. If it shares the same
  // broken pipe, this write is a no-op or silences it too.
  const sibling = name === 'stdout' ? process.stderr : process.stdout
  if (sibling && typeof sibling.write === 'function') {
    sibling.write(
      `\n⚠ Next.js can no longer write to ${name} (broken pipe). Further ${name} output is dropped.\n`
    )
  }
}

/**
 * Makes the process tolerant of a broken stdout/stderr pipe.
 *
 * When output is piped into a reader that exits early (`next dev | head -20`, a
 * detached tmux pane, a CI log tailer), every later write fails with `EPIPE`.
 * Node.js emits that as an `error` event on the stream and, with no listener
 * attached, re-throws it as an `uncaughtException` — which the dev server logs
 * over the same broken pipe, raising another `EPIPE`. The loop pins a CPU core
 * and starves incoming requests, with no output left to explain the hang.
 *
 * Swallow the error and stop writing to the dead stream instead.
 */
export function setupBrokenPipeHandling() {
  // `next start` reaches this from both the CLI entrypoint and start-server.ts.
  if (initialized) {
    return
  }
  initialized = true

  for (const name of ['stdout', 'stderr'] as const) {
    const stream = process[name]
    // Not guaranteed to be real streams: closed fds, or plain objects in some
    // embedders.
    if (!stream || typeof stream.on !== 'function') {
      continue
    }

    stream.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== undefined && FATAL_STDIO_ERROR_CODES.has(err.code)) {
        silence(stream, name)
      }
      // Non-fatal errors are swallowed too: an unhandled `error` event here
      // would take the process down, and a failure of the reporting channel
      // cannot be reported reliably anyway.
    })
  }
}
