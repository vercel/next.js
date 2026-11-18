import path from 'path'
import * as Log from '../../build/output/log'
import { Telemetry } from '../../telemetry/storage'

import { once } from 'events'
import { setTimeout as sleep } from 'timers/promises'
import { isColorSupported } from '../picocolors'

import type { ChildProcess } from 'child_process'
import type { NudgeKind, UpgradeContext, UpgradeReminder } from './nudge'

type PromptOutput = ReturnType<typeof createPromptOutput>

export type UpgradeMenuResult =
  | { policy: NudgeKind; nudgeId: string | null }
  | 'interrupt'
  | null

// Keep at most this much while the menu is open, so a menu left open doesn't
// grow memory without bound.
const MAX_HELD_BYTES = 10 * 1024 * 1024

// All output of the child (and anything it starts) comes through here, so it
// can be held while the upgrade menu is on screen.
export function createPromptOutput() {
  // print: show now. hold: keep for later. drop: throw away.
  let mode: 'print' | 'hold' | 'drop' = 'print'
  // One list for stdout and stderr keeps their order.
  let held: Array<[NodeJS.WriteStream, Buffer]> = []
  let heldBytes = 0
  let droppedBytes = 0

  function forward(destination: NodeJS.WriteStream) {
    return (chunk: Buffer) => {
      if (mode === 'print') {
        destination.write(chunk)
      } else if (mode === 'hold') {
        held.push([destination, chunk])
        heldBytes += chunk.length
        // Over the limit: drop the oldest output.
        while (heldBytes > MAX_HELD_BYTES && held.length > 1) {
          const [, oldest] = held.shift()!
          heldBytes -= oldest.length
          droppedBytes += oldest.length
        }
      }
    }
  }

  return {
    attach(child: ChildProcess) {
      child.stdout!.on('data', forward(process.stdout))
      child.stderr!.on('data', forward(process.stderr))
    },
    // The menu opened.
    hold() {
      mode = 'hold'
    },
    // The menu closed: show what was held.
    release() {
      mode = 'print'
      if (droppedBytes > 0) {
        Log.warn(
          `${droppedBytes} bytes of earlier output were dropped while the upgrade menu was open.`
        )
      }
      for (const [destination, chunk] of held) {
        destination.write(chunk)
      }
      held = []
    },
    // Upgrade was chosen and the child is stopping, so its output doesn't
    // matter.
    discard() {
      mode = 'drop'
      held = []
    },
  }
}

// Read what is left in the pipes after the child exits. Don't wait long, in
// case something the child started keeps them open.
export async function drainPromptOutput(child: ChildProcess) {
  // The pipes are often closed by the time 'exit' fires, and then 'close' has
  // already been sent.
  if (!child.stdout || (child.stdout.destroyed && child.stderr?.destroyed)) {
    return
  }
  await Promise.race([once(child, 'close'), sleep(500)])
}

// A pipe is not a terminal. Like other tools that pipe a child's output, pass
// FORCE_COLOR on. Tell Next's own output code that the output still ends up on
// a terminal, and how wide it is.
export function getPromptOutputEnv() {
  const { FORCE_COLOR, NODE_DISABLE_COLORS } = process.env
  return {
    FORCE_COLOR:
      // An empty FORCE_COLOR means "on" to Node but "unset" to picocolors.
      FORCE_COLOR ||
      (isColorSupported && !NODE_DISABLE_COLORS ? '1' : FORCE_COLOR),
    NEXT_PRIVATE_PROMPT_OUTPUT: '1',
    NEXT_PRIVATE_TERMINAL_COLUMNS: process.stdout.columns
      ? String(process.stdout.columns)
      : undefined,
  }
}

// A child on the terminal puts it back in normal mode when it exits, which
// stops the menu from reading keys. Put raw mode back.
export function reassertRawMode() {
  const stdin = process.stdin
  if (stdin.isTTY && stdin.isRaw) {
    // Node skips setting a mode it thinks is already set, so toggle.
    stdin.setRawMode(false)
    stdin.setRawMode(true)
  }
}

let pendingTelemetry: Promise<unknown> | undefined

// Shows the menu while the child keeps working. Returns what to do next:
// upgrade, interrupt, or carry on (null).
export async function showUpgradeMenu(
  output: PromptOutput,
  options: {
    dir: string
    context: UpgradeContext
    command: 'dev' | 'build'
    signal: AbortSignal
    initialAssessment: Promise<UpgradeReminder | null> | null
    // The child's NEXT_TELEMETRY_DISABLED. It loaded .env; this process did
    // not.
    telemetryDisabled: string | undefined
  }
): Promise<UpgradeMenuResult> {
  const { dir, context, command, signal, initialAssessment } = options
  const { nudgeUpgrade } = require('./nudge') as typeof import('./nudge')

  if (options.telemetryDisabled) {
    process.env.NEXT_TELEMETRY_DISABLED = options.telemetryDisabled
  }
  const telemetry = new Telemetry({
    distDir: path.join(dir, context.distDir),
    skipNotify: true,
  })
  let nudgeId: string | null = null

  // onNudgeId runs as the menu draws, so holding starts at exactly that point.
  const action = await nudgeUpgrade(
    dir,
    context,
    command,
    signal,
    initialAssessment,
    {
      telemetry,
      onNudgeId(id) {
        nudgeId = id
        output.hold()
      },
    }
  ).catch((error) => {
    Log.warn(`Could not offer the upgrade: ${String(error)}`)
  })

  // The answer is already being sent. Don't wait for it here, or Ctrl+C would
  // be ignored until it is done.
  pendingTelemetry = telemetry.flush()

  // Upgrade. The caller drops or shows what was held.
  const policy = context.experimental.agentUpgrade
  if (action === 'update' && policy && !signal.aborted) {
    return { policy, nudgeId }
  }

  // Skip, Ctrl+C, or closed: show what was held.
  output.release()
  return action === 'interrupt' && !signal.aborted ? 'interrupt' : null
}

// The menu closes right away when cancelled, but it may still be waiting on a
// network check before showing. Don't wait on that.
export async function closedUpgradeMenu(menu: Promise<unknown> | undefined) {
  await Promise.race([menu, sleep(1000, undefined, { ref: false })])
}

// Before exiting, give the menu's telemetry a moment to finish sending.
export async function flushUpgradeTelemetry() {
  await Promise.race([pendingTelemetry, sleep(1000, undefined, { ref: false })])
}
