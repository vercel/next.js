import type { Duplex } from 'node:stream'

import {
  createOwnedListeners,
  isRawHttpResponseCommitted,
  throwCombinedFailures,
  tryDestroySocket,
} from './websocket-http'
import {
  UPGRADE_HANDLER_CLOSE_GRACE_PERIOD_MS,
  PENDING_UPGRADE_IDLE_TIMEOUT_MS,
} from './websocket-shutdown-budget'

interface PendingUpgrade {
  socket: Duplex
  done: Promise<void>
  finish(): unknown[]
}

function isCommittedOrFlushing(socket: Duplex): boolean {
  return (
    isRawHttpResponseCommitted(socket) ||
    socket.writableEnded ||
    socket.writableFinished
  )
}

/**
 * Tracks raw Node.js upgrade handlers until ownership moves to either a
 * committed response or the WebSocket connection registry.
 */
export class PendingWebSocketUpgradeTracker {
  private admissionClosed = false
  private closePromise?: Promise<void>
  private readonly pending = new Set<PendingUpgrade>()
  private readonly failures: unknown[] = []

  private record(failures: unknown[]): void {
    for (const failure of failures) {
      if (!this.failures.includes(failure)) this.failures.push(failure)
    }
  }

  private destroy(socket: Duplex): void {
    tryDestroySocket(socket, (error) => {
      if (!this.failures.includes(error)) this.failures.push(error)
    })
  }

  track(socket: Duplex): () => void {
    if (this.admissionClosed) {
      this.destroy(socket)
      return () => {}
    }

    let resolve!: () => void
    const done = new Promise<void>((complete) => {
      resolve = complete
    })
    // Bound the pre-commit window: after Node emits `upgrade`, its HTTP
    // request timeouts no longer govern the socket. Destroy connections that
    // move no bytes for the whole budget so a client cannot pin a stalled
    // handler or a backpressured raw response write indefinitely. Cleared on
    // handoff to a committed response or the connection registry.
    const setSocketTimeout = (
      socket as { setTimeout?: (ms: number) => void }
    ).setTimeout?.bind(socket)
    setSocketTimeout?.(PENDING_UPGRADE_IDLE_TIMEOUT_MS)

    let finished = false
    let installing = true
    let finishRequested = false
    let endRemovalRequested = false
    const listeners = createOwnedListeners()
    const pending: PendingUpgrade = {
      socket,
      done,
      finish: () => {
        if (finished) return []
        if (installing) {
          finishRequested = true
          return []
        }
        finished = true
        try {
          setSocketTimeout?.(0)
          return listeners.remove()
        } finally {
          this.pending.delete(pending)
          resolve()
        }
      },
    }
    this.pending.add(pending)
    const onClose = () => {
      this.record(pending.finish())
    }
    const onEnd = () => {
      let committed = false
      try {
        committed = isCommittedOrFlushing(socket)
      } catch (error) {
        if (!this.failures.includes(error)) this.failures.push(error)
      }
      if (committed) {
        if (installing) {
          endRemovalRequested = true
        } else {
          this.record(listeners.remove(endEntry))
        }
        return
      }
      this.destroy(socket)
      this.record(pending.finish())
    }
    // Total inactivity for the whole budget destroys the pinned connection and
    // settles tracking through the ordinary finish path.
    const onIdleTimeout = () => {
      this.destroy(socket)
      this.record(pending.finish())
    }
    const endEntry = { target: socket, event: 'end', listener: onEnd }
    const closeEntry = { target: socket, event: 'close', listener: onClose }
    const timeoutEntry = {
      target: socket,
      event: 'timeout',
      listener: onIdleTimeout,
    }

    const installFailures = listeners.install([
      endEntry,
      closeEntry,
      timeoutEntry,
    ])
    installing = false
    if (installFailures.length > 0) {
      finished = true
      this.pending.delete(pending)
      resolve()
      this.record(installFailures)
      throwCombinedFailures(
        installFailures,
        'Failed to close pending WebSocket upgrades'
      )
    }

    if (endRemovalRequested) {
      this.record(listeners.remove(endEntry))
    }

    if (finishRequested || socket.destroyed || socket.closed) {
      this.record(pending.finish())
    } else if (socket.readableEnded) {
      onEnd()
    }

    return () => {
      this.record(pending.finish())
    }
  }

  closePending(): Promise<void> {
    if (this.closePromise) return this.closePromise

    // Close admission synchronously so a re-entrant upgrade cannot enter after
    // the shutdown snapshot but before the async drain starts.
    this.admissionClosed = true
    const pending = Array.from(this.pending)
    this.closePromise = this.drain(pending)
    return this.closePromise
  }

  private async drain(pending: PendingUpgrade[]): Promise<void> {
    if (pending.length > 0) {
      let timeout: NodeJS.Timeout | undefined
      try {
        const result = await Promise.race([
          Promise.allSettled(pending.map((upgrade) => upgrade.done)).then(
            () => 'settled' as const
          ),
          new Promise<'timeout'>((resolve) => {
            timeout = setTimeout(
              () => resolve('timeout'),
              UPGRADE_HANDLER_CLOSE_GRACE_PERIOD_MS
            )
          }),
        ])
        if (result === 'timeout') {
          for (const upgrade of pending) {
            if (this.pending.has(upgrade)) {
              this.destroy(upgrade.socket)
              this.record(upgrade.finish())
            }
          }
        }
      } finally {
        if (timeout) clearTimeout(timeout)
      }
    }

    throwCombinedFailures(
      this.failures,
      'Failed to close pending WebSocket upgrades'
    )
  }
}
