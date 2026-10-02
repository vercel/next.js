import { Writable } from 'stream'
import { spawnSync, type ChildProcess } from 'child_process'
import { updateInitialEnv } from '@next/env'
import isError from './is-error'

// The parent owns the menu; the work process keeps its real output TTYs and
// buffers writes in stdout/stderr. IPC carries permission to print, not logs.
// Keep supervision after Skip, but never hold output again once the parent
// has released it. Config still loads with live output before the first cork.
let corked = false
let managed = false
let released = false
let outputLimitCheck: ReturnType<typeof setInterval> | null = null

// Every caller waits for the same release. A new cork creates one shared
// Promise; uncork resolves it after restoring the streams.
let outputReleased: Promise<void> = Promise.resolve()
let releaseOutput: (() => void) | null = null

// Keep retired children from receiving more signals through stale callbacks.
const killedWork = new WeakSet<ChildProcess>()

// Skip can arrive more than once. Connecting a worker twice would duplicate
// its input, so remember each connection without retaining retired workers.
const forwardedInputs = new WeakSet<ChildProcess>()

export function forwardUpgradeInput(child: ChildProcess) {
  const input = child.stdin
  if (!input?.writable || killedWork.has(child) || forwardedInputs.has(child)) {
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

export function signalUpgradeWork(child: ChildProcess, signal: NodeJS.Signals) {
  if (!child.pid || killedWork.has(child)) {
    return
  }

  // The detached POSIX group no longer receives terminal interrupts. Give
  // plugins and subprocesses the same cleanup opportunity as their owner.
  // Preserve the signal so SIGHUP handlers and SIGQUIT diagnostics still run.
  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
        throw error
      }
    }
  } else {
    // Keep Windows on its existing interrupt/termination path. OS signals
    // bypass JavaScript cleanup, so ask a connected owner to stop over IPC.
    const stopSignal = signal === 'SIGINT' ? 'SIGINT' : 'SIGTERM'
    if (child.connected) {
      child.send({ nextUpgradeStop: stopSignal })
    } else {
      child.kill(stopSignal)
    }
  }
}

export function forwardUpgradeResize(child: ChildProcess) {
  if (process.platform === 'win32' || !child.pid) {
    return
  }

  // Detached workloads inherit the TTY but do not receive its foreground
  // signals. Notify the whole group so workers also refresh their dimensions.
  const onResize = () => {
    signalUpgradeWork(child, 'SIGWINCH')
  }
  process.on('SIGWINCH', onResize)

  // Each replacement owns its listener; closure removes it before handoff or
  // restart, including when spawning the workload fails.
  child.once('close', () => process.off('SIGWINCH', onResize))
}

export function killUpgradeWork(child: ChildProcess) {
  if (!child.pid || killedWork.has(child)) {
    return
  }
  // Managed workloads get their own process group; never signal the caller's
  // shell. This also reaches descendants when their owner cannot run cleanup.
  if (process.platform === 'win32') {
    // TODO: On Windows, taskkill needs a live parent to find its children.
    // If dev/build has already exited, its children may keep running during
    // upgrade. Track them even after their parent exits.
    if (child.exitCode === null && child.signalCode === null) {
      const result = spawnSync(
        'taskkill',
        ['/pid', String(child.pid), '/T', '/F'],
        { stdio: 'ignore' }
      )
      if (result.error) {
        throw result.error
      }
      if (result.status !== 0) {
        throw new Error(
          `Could not stop workload tree (taskkill ${result.status}).`
        )
      }
    }
  } else {
    signalUpgradeWork(child, 'SIGKILL')
  }
  killedWork.add(child)
}

export function isUpgradeOutputManaged() {
  return managed
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
  outputReleased = new Promise<void>((resolve) => {
    releaseOutput = resolve
  })
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
  // Supervise config loading without holding its writes. Only the workload
  // entry point calls this; descendants must keep producing their own output.
  managed = true

  // Replacement dev workers keep supervision after Skip, but no longer have
  // a pending choice. Build workers use their own entry marker instead.
  released =
    process.env.NEXT_PRIVATE_UPGRADE_PROMPT !== '1' &&
    process.env.NEXT_PRIVATE_UPGRADE_BUILD_WORKER !== '1'
  process.on(
    'message',
    async (message: {
      nextUpgradeContinue: boolean | undefined
      nextUpgradeStop: 'SIGINT' | 'SIGTERM' | undefined
    }) => {
      if (message?.nextUpgradeContinue) {
        // Skip is permanent, whether chosen by the user or requested by a
        // safeguard. Later callbacks keep the normal terminal behavior.
        released = true
        uncorkUpgradeOutput()
      }
      if (message?.nextUpgradeStop) {
        // Windows signals terminate Node without running JS cleanup. IPC
        // invokes the same handlers on every platform, including before the
        // workload has installed its own signal listeners.
        const signal = message.nextUpgradeStop
        if (!process.emit(signal, signal)) {
          await uncork()
          process.exit(signal === 'SIGINT' ? 130 : 143)
        }
      }
    }
  )
  process.once('disconnect', () => {
    // Release even an exit already awaiting permission: the parent can no
    // longer acknowledge, so buffered errors must use the normal terminal.
    released = true
    uncorkUpgradeOutput()
    process.exit(1)
  })
}

export async function uncork() {
  // Exit waits only for the menu to close. Workers, native callbacks and final
  // stream writes are not drained; their last output may be lost on termination.
  if (!corked) {
    return
  }

  // The parent must leave the menu before this child writes to the terminal.
  // A disconnected parent cannot acknowledge; favor visibility in that case.
  if (process.connected && process.send) {
    process.send({ nextUpgradeOutput: true }, (error: Error | null) => {
      if (error) {
        uncorkUpgradeOutput()
        console.error(
          'Could not request the terminal for workload output:',
          error
        )
      }
    })
    await waitForUpgradeOutput()
  } else {
    uncorkUpgradeOutput()
  }
}

export function throwUpgradeError(message: string): never {
  if (!corked) {
    process.exit(1)
  }

  // The validator has already printed its diagnostic. Stop its synchronous
  // caller here; its async owner must consume this marker, uncork, and exit
  // before an ordinary recovery catch can continue or print another stack.
  throw Object.assign(new Error(message), { code: 'NEXT_UPGRADE_FATAL' })
}

export function isUpgradeFatal(error: unknown) {
  // Only the fatal validators use this marker. Other errors retain their
  // existing reporting and recovery behavior.
  return isError(error) && error.code === 'NEXT_UPGRADE_FATAL'
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

  // Release only the cork level owned by this feature.
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

  // Release promises only after changing stream state, so resumed callbacks
  // can safely write immediately instead of waiting on another corked write.
  releaseOutput?.()
  releaseOutput = null
}

export function waitForUpgradeOutput() {
  return outputReleased
}
