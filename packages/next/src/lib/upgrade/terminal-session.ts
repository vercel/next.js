import type { IPty } from 'node-pty'
import { constants } from 'node:os'
import * as Log from '../../build/output/log'
import {
  createUpgradeTerminalServer,
  type UpgradeTerminalChildMessage,
} from './terminal-channel'
import { createUpgradeTerminalOutput } from './terminal-output'
import { promptUpgrade } from './prompt'
import {
  prepareUpgradeNudge,
  recordUpgradeNudgeChoice,
  runUpgrade,
} from './nudge'

/**
 * Keep dev serving or build compiling while an upgrade menu owns the visible
 * terminal. Run the ordinary CLI in a PTY, buffer its output during the menu,
 * and use a separate control channel for the nudge and shutdown handshake.
 * Return null if supervision cannot start so the caller can run dev normally.
 */
export async function runUpgradeTerminal(
  command: 'dev' | 'build' = 'dev'
): Promise<number | string | null> {
  let pty: typeof import('node-pty')
  try {
    // node-pty is optional: a failed native load leaves ordinary dev available.
    pty = require('node-pty') as typeof import('node-pty')
  } catch (error) {
    Log.warn(`Could not start the upgrade terminal: ${String(error)}`)
    return null
  }

  // Callbacks need the PTY handle; onExit marks it so the menu skips work and
  // final cleanup avoids killing an already exited child.
  let child: IPty | null = null
  let exited = false

  // Accept one nudge, then distinguish a requested stop from its acknowledgement.
  let nudgeStarted = false
  let stopping = false
  let stopAcknowledged = false

  // Signals and output failures supply the terminal result when no upgrade is selected.
  let interruption: NodeJS.Signals | null = null
  let failed = false

  // Start the handoff when selected, while dev shuts down in parallel.
  let upgradeTask: Promise<number | string> | null = null

  // The active menu can be aborted by PTY or socket events.
  let nudgeController: AbortController | null = null
  // Final exit waits for any in-progress menu to settle.
  let nudgeTask: Promise<void> | null = null
  // Bridge node-pty's exit callback to an awaitable childExit promise.
  let resolveExit: (event: { exitCode: number; signal?: number }) => void
  const childExit = new Promise<{ exitCode: number; signal?: number }>(
    (resolve) => {
      resolveExit = resolve
    }
  )

  // If the visible terminal rejects a write, we cannot reliably show dev's
  // remaining output. Stop the PTY child and report a failed session.
  const output = createUpgradeTerminalOutput(process.stdout, (error) => {
    console.error(error)
    failed = true
    child?.kill('SIGTERM')
  })

  // Forward stdin to the PTY except while the menu is open. Save its original
  // raw and flow state so callers get their terminal back on every exit.
  const input = process.stdin
  const wasRaw = input.isRaw ?? false
  const wasFlowing = input.readableFlowing
  let inputRestored = false

  // Outside the menu, forward keystrokes to the ordinary CLI inside the PTY.
  const forwardInput = (data: Buffer) => {
    child?.write(data.toString())
  }

  // Upgrade handoff and final cleanup can both reach here; restore stdin once.
  const restoreInput = () => {
    if (inputRestored) {
      return
    }
    inputRestored = true
    input.off('data', forwardInput)
    input.setRawMode(wasRaw)
    if (wasFlowing !== true) {
      input.pause()
    }
  }

  // The control socket carries nudge and stop messages independently of dev's
  // PTY output. Create it before spawning the child so it can connect at startup.
  let control: Awaited<ReturnType<typeof createUpgradeTerminalServer>>
  try {
    control = await createUpgradeTerminalServer(
      (message) => {
        if (message.type === 'stopped') {
          // The child has completed its worker and CLI shutdown handshake.
          stopAcknowledged = true
          if (!message.success) {
            failed = true
            console.error(message.error ?? 'Dev cleanup failed.')
          }
        } else if (!nudgeStarted) {
          // Handle at most one nudge for this terminal session.
          nudgeStarted = true
          // Track the menu task so final exit waits for it to settle.
          nudgeTask = handleNudge(message).catch(async (error) => {
            console.error(error)
            if (stopping) {
              // Do not leave dev running after an upgrade stop has begun.
              failed = true
              child?.kill('SIGTERM')
            } else if (command === 'build' && !exited) {
              // A failed menu must not strand a completed build waiting for a choice.
              await control.send({ type: 'continue' })
            }
          })
        }
      },
      () => {
        // An unexpected disconnect invalidates the menu; after a stop
        // acknowledgement, disconnect is part of the child's normal exit.
        if (!stopping || !stopAcknowledged) {
          nudgeController?.abort()
        }
      },
      (error) => {
        console.error(error)
        // A channel failure before shutdown completes also invalidates the menu.
        if (!stopping || !stopAcknowledged) {
          nudgeController?.abort()
        }
      }
    )
  } catch (error) {
    // The PTY child has not started, so the caller can fall back to direct dev.
    Log.warn(`Could not start the upgrade terminal: ${String(error)}`)
    return null
  }

  // Prepare the nudge without pausing dev startup or the build. Only the menu
  // needs the visible terminal; Skip returns it to the running command.
  async function handleNudge(
    message: Extract<UpgradeTerminalChildMessage, { type: 'nudge' }>
  ): Promise<void> {
    const controller = new AbortController()
    nudgeController = controller
    const nudge = await prepareUpgradeNudge(
      message.directory,
      message.context,
      controller.signal
    )
    if (!nudge || exited || controller.signal.aborted) {
      if (command === 'build' && !exited) {
        await control.send({ type: 'continue' })
      }
      return
    }

    // Hold child output only while the menu owns the screen; resume replays it.
    let overflow = false
    if (
      !(await output.hold(() => {
        overflow = true
        controller.abort()
      }))
    ) {
      await output.resume()
      Log.warn(
        'Upgrade menu skipped because command output ended in an incomplete terminal escape sequence.'
      )
      if (command === 'build') {
        await control.send({ type: 'continue' })
      }
      return
    }

    // The menu needs keystrokes itself; forwarding them would also type into the child.
    input.off('data', forwardInput)

    let action
    try {
      action = await promptUpgrade(nudge.message, controller.signal, true)
    } finally {
      // Restore child output and input even if the prompt throws or is aborted.
      await output.resume()
      if (!inputRestored) {
        input.on('data', forwardInput)
      }
    }

    if (overflow) {
      Log.warn('Upgrade menu closed because buffered dev output reached 1 MiB.')
    }
    if (exited || controller.signal.aborted) {
      return
    }
    await recordUpgradeNudgeChoice(message.directory, nudge, action)

    if (action === 'interrupt') {
      interruption = 'SIGINT'
      if (command === 'build') {
        stopping = true
        await control.send({ type: 'stop' })
      } else {
        child?.write('\x03')
      }
    } else if (action === 'update') {
      // Give the terminal back to the caller, then ask the child to stop before
      // starting the handoff; both operations can progress concurrently.
      stopping = true
      restoreInput()
      await control.send({ type: 'stop' })

      // TODO: If overlapping the handoff with child shutdown causes problems,
      // consider waiting for the child to exit before starting the handoff.
      upgradeTask = runUpgrade(message.directory, nudge.policy).catch(
        (error) => {
          console.error(error)
          return 1
        }
      )
    } else if (command === 'build') {
      // A completed build waits for this choice before its CLI exits.
      await control.send({ type: 'continue' })
    }
  }

  try {
    // node-pty requires string env values; add the private control endpoint
    // only to the child, which re-enters the ordinary dev CLI.
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value
      }
    }
    Object.assign(env, control.env)

    // Re-enter the same CLI with a PTY-backed stdio so dev and its descendants
    // still see a terminal, while this process can keep the menu separate.
    try {
      child = pty.spawn(
        process.execPath,
        [...process.execArgv, ...process.argv.slice(1)],
        {
          cwd: process.cwd(),
          env,
          name: process.env.TERM || 'xterm-256color',
          cols: process.stdout.columns || 80,
          rows: process.stdout.rows || 24,
        }
      )
    } catch (error) {
      Log.warn(`Could not start the upgrade terminal: ${String(error)}`)
      return null
    }

    // Send the child's terminal output through the menu-aware queue. Child
    // exit cancels an unfinished menu unless an acknowledged stop is underway.
    child.onData((data) => output.accept(data))
    child.onExit((event) => {
      exited = true
      if (!stopping || !stopAcknowledged) {
        nudgeController?.abort()
      }
      resolveExit(event)
    })

    // Raw mode lets us forward individual keys, including arrow keys and
    // Ctrl+C, to whichever side currently owns input.
    input.setRawMode(true)
    input.on('data', forwardInput)
    input.resume()

    // The child has its own terminal size; keep it aligned with the real one.
    const onResize = () => {
      child?.resize(process.stdout.columns || 80, process.stdout.rows || 24)
    }

    // Signals to the supervisor must also stop the PTY child and menu.
    const onSignal = (signal: NodeJS.Signals) => {
      interruption ??= signal
      nudgeController?.abort()
      // The nested dev CLI handles SIGTERM, but only handles SIGHUP while its
      // direct prompt is open. Let it clean up and retain SIGHUP as our status.
      child?.kill(signal === 'SIGHUP' ? 'SIGTERM' : signal)
    }
    const onInterrupt = () => onSignal('SIGINT')
    const onTerminate = () => onSignal('SIGTERM')
    const onHangup = () => onSignal('SIGHUP')

    // These listeners belong to this PTY session and are removed below.
    process.stdout.on('resize', onResize)
    process.on('SIGINT', onInterrupt)
    process.on('SIGTERM', onTerminate)
    process.on('SIGHUP', onHangup)
    try {
      const result = await childExit

      // The menu's finally block releases held output. Then flush the child's
      // last writes before returning its exit result or the upgrade result.
      await nudgeTask
      await output.drain()
      restoreInput()

      if (upgradeTask) {
        const upgradeResult = await upgradeTask
        if (interruption) {
          return 128 + constants.signals[interruption]
        }
        // The handoff starts before dev finishes stopping, but a failed stop
        // must still make the overall command fail even if the handoff succeeds.
        return failed || result.exitCode !== 0 || result.signal
          ? 1
          : upgradeResult
      }

      // A signal received by the supervisor may not appear in the PTY child's
      // exit event, so preserve its conventional shell exit status ourselves.
      if (interruption) {
        return 128 + constants.signals[interruption]
      }

      return failed
        ? 1
        : result.exitCode || (result.signal ? 128 + result.signal : 0)
    } finally {
      process.stdout.off('resize', onResize)
      process.off('SIGINT', onInterrupt)
      process.off('SIGTERM', onTerminate)
      process.off('SIGHUP', onHangup)
    }
  } finally {
    // All exits, including PTY startup failure, restore the caller's input
    // and close the control socket; terminate a child that has not exited.
    restoreInput()
    control.close()
    if (!exited) {
      child?.kill('SIGTERM')
    }
  }
}
