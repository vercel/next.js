import { Writable } from 'stream'
import type { ChildProcess } from 'child_process'
import { updateInitialEnv } from '@next/env'

// The CLI owns the menu. This process keeps its inherited terminal and holds
// its own stdout/stderr writes until the parent says the menu has closed.
let corked = false
let managed = false
let released = false
let outputLimitCheck: ReturnType<typeof setInterval> | null = null

// Repeated Skip messages must not duplicate input forwarding.
const forwardedInputs = new WeakSet<ChildProcess>()

export function forwardUpgradeInput(child: ChildProcess) {
  const input = child.stdin
  if (!input?.writable || forwardedInputs.has(child)) {
    return
  }
  forwardedInputs.add(child)

  // Call only after the choice ends. Its arrows and Enter must stay in the
  // parent while the menu is open; fatal shutdown does not hand input back.
  const disconnect = () => {
    process.stdin.unpipe(input)
  }
  child.once('close', disconnect)
  input.on('error', (error: NodeJS.ErrnoException) => {
    disconnect()
    // A worker can close stdin before its close event. Stop forwarding on
    // that expected race; report other failures through normal supervision.
    if (error.code !== 'EPIPE' && error.code !== 'ERR_STREAM_DESTROYED') {
      child.emit('error', error)
    }
  })

  // stdout/stderr still inherit the terminal. Only stdin is a pipe, including
  // after Skip: plugins cannot use stdin.isTTY or setRawMode() as before.
  process.stdin.pipe(input)
}

export function getUpgradeEnvironment(
  initialEnvironment: Record<string, string | undefined>
) {
  // Compare only around config loading or a user callback. Taking the snapshot
  // at worker startup would also forward server ports and other runtime state.
  // Null represents a deletion because IPC drops undefined object values.
  const environment: Record<string, string | null> = {}
  for (const key of new Set([
    ...Object.keys(initialEnvironment),
    ...Object.keys(process.env),
  ])) {
    // This flag belongs to @next/env's cache. The upgrade and its subprocesses
    // must still be able to load their own env files.
    if (
      key !== '__NEXT_PROCESSED_ENV' &&
      initialEnvironment[key] !== process.env[key]
    ) {
      environment[key] = process.env[key] ?? null
    }
  }
  return environment
}

export function restoreUpgradeEnvironment(
  environment: Record<string, string | null> | null
) {
  // Apply config and .env changes only at handoff, including deletions and
  // the cache used by future env loads in the upgrade process.
  const restoredEnvironment: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(environment ?? {})) {
    if (value === null) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
    restoredEnvironment[key] = value ?? undefined
  }
  updateInitialEnv(restoredEnvironment)
}

export async function corkUpgradeOutput() {
  // Own one cork level only. Repeated requests must not require extra uncorks,
  // and a process that has started releasing must keep its output visible.
  if (corked || released) {
    return
  }

  // Finish config output before holding later writes, so it cannot appear over
  // the menu. Exit paths only uncork and never wait for this write barrier.
  await Promise.all(
    [process.stdout, process.stderr].map(
      (stream) =>
        new Promise<void>((resolve, reject) => {
          stream.write('', (error) => {
            if (error) {
              reject(error)
              return
            }
            resolve()
          })
        })
    )
  )

  // Skip may arrive while config output finishes. Never hold a released process
  // again, or add another cork level if another caller already started holding.
  if (corked || released) {
    return
  }

  corked = true
  process.stdout.cork()
  process.stderr.cork()

  // Limit every hold to ten seconds, including normal work and completed
  // builds. This releases any write callbacks without guessing which hook or
  // plugin is waiting for them. The deadline starts at cork, before the menu.
  const releaseAt = Date.now() + 10_000

  // Reuse the memory check for the time limit. Ask the parent to close the
  // menu before releasing logs; never print over its choices.
  outputLimitCheck = setInterval(() => {
    if (
      Date.now() < releaseAt &&
      process.stdout.writableLength + process.stderr.writableLength <
        10 * 1024 * 1024
    ) {
      return
    }
    clearInterval(outputLimitCheck!)
    outputLimitCheck = null

    // Both safeguards permanently Skip. Let the parent restore the screen
    // first; if it cannot receive IPC, reveal the logs here instead.
    if (process.connected && process.send) {
      process.send({ nextUpgradeSkip: true }, (error: Error | null) => {
        if (error) {
          released = true
          uncorkUpgradeOutput()
          console.error('Could not skip the upgrade prompt:', error)
        }
      })
    } else {
      released = true
      uncorkUpgradeOutput()
    }
  }, 1000)
  // This is a coarse memory safeguard; it must not keep an otherwise idle
  // process alive. A burst can exceed the threshold between checks.
  outputLimitCheck.unref()
}

export function handleUpgradeOutputMessages() {
  managed = true
  // Listen before config loads, but leave its output live. router-server corks
  // only after config and custom routes finish, so their write callbacks work.
  process.on(
    'message',
    (message: { nextUpgradeContinue: boolean | undefined }) => {
      if (message?.nextUpgradeContinue) {
        released = true
        uncorkUpgradeOutput()
      }
    }
  )

  // A missing parent cannot grant permission to print. Release held logs before
  // exiting rather than leave a worker running without its supervising CLI.
  process.once('disconnect', () => {
    released = true
    uncorkUpgradeOutput()
    process.exit(1)
  })
}
export function pipeWorkerOutput(
  source: NodeJS.ReadableStream,
  destination: Writable
) {
  // Ordinary runs and new workers after Skip keep the existing pipe behavior.
  if (!managed || released) {
    source.pipe(destination, { end: false })
    return
  }

  // Acknowledge held writes immediately so the terminal cannot pause workers.
  // After Skip, wait for writes again to restore backpressure without changing
  // pipe listeners. Ending this forwarding stream never ends the terminal.
  // TODO: A worker may still be waiting for an earlier write when we cork.
  // Its work can pause until the ten-second limit skips the menu.
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (corked) {
        destination.write(chunk, encoding)
        callback()
        return
      }

      destination.write(chunk, encoding, (error) => {
        if (error) {
          // The destination emits this error itself. Stop forwarding without
          // emitting the same terminal error through a second stream.
          output.destroy()
          return
        }
        callback()
      })
    },
  })
  source.pipe(output)
}

function uncorkUpgradeOutput() {
  if (!corked) {
    return
  }

  // Release only our cork level; keep the inherited terminal streams open.
  corked = false
  if (outputLimitCheck) {
    clearInterval(outputLimitCheck)
    outputLimitCheck = null
  }

  // TODO: stdout and stderr have separate buffers. Releasing stdout first can
  // print a later log before an earlier error. Use one buffer if we need to
  // keep the order between the two streams.

  process.stdout.uncork()
  process.stderr.uncork()
}
