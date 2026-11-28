/* eslint-disable import/no-extraneous-dependencies */
import type { ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import crossSpawn from 'cross-spawn'

// Child processes inherit our stdio. One still running after we exit is
// reparented to init and keeps drawing to a terminal the shell has already
// taken back, so every spawn is tracked here and stopped on the way out.
// A set rather than a single slot: removal is by identity, so it stays correct
// without caring how many are live or what order they finish in.
const childProcesses = new Set<ChildProcess>()

let terminating = false

export function spawn(
  ...args: Parameters<typeof crossSpawn>
): ReturnType<typeof crossSpawn> {
  const child = crossSpawn(...args)
  childProcesses.add(child)
  child.once('close', () => childProcesses.delete(child))
  return child
}

export function isTerminating(): boolean {
  return terminating
}

/**
 * Send SIGTERM to every tracked process, escalating to SIGKILL for any that has
 * not exited within `graceMs`.
 */
export async function terminateChildProcesses(graceMs: number): Promise<void> {
  // Set synchronously, before any await, so the re-raised signal that arrives
  // moments later sees it.
  terminating = true

  if (childProcesses.size === 0) {
    return
  }

  const allClosed = Promise.all(
    [...childProcesses].map((child) => once(child, 'close'))
  )

  signalChildProcesses('SIGTERM')
  await Promise.race([allClosed, delay(graceMs)])
  signalChildProcesses('SIGKILL')
}

function signalChildProcesses(signal: 'SIGTERM' | 'SIGKILL'): void {
  for (const child of childProcesses) {
    // Both are null only while the process is still running.
    if (child.exitCode === null && child.signalCode === null) {
      try {
        child.kill(signal)
      } catch {
        // Already exited.
      }
    }
  }
}
