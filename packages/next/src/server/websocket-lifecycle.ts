import type { Duplex } from 'node:stream'

import { isRawHttpResponseCommitted } from './websocket-http'

const UPGRADE_HANDLER_CLOSE_GRACE_PERIOD_MS = 5_000

interface PendingUpgrade {
  socket: Duplex
  done: Promise<void>
  finish(): unknown[]
}

function throwFailures(failures: unknown[]): void {
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) {
    throw new AggregateError(
      failures,
      'Failed to close pending WebSocket upgrades',
      {
        cause: failures[0],
      }
    )
  }
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
    try {
      if (!socket.destroyed) socket.destroy()
    } catch (error) {
      if (!this.failures.includes(error)) this.failures.push(error)
    }
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
    let finished = false
    let installing = true
    let finishRequested = false
    let endRemovalRequested = false
    let endInstalled = false
    let closeInstalled = false
    let onEnd!: () => void
    let onClose!: () => void
    const removeListeners = (): unknown[] => {
      const failures: unknown[] = []
      if (endInstalled) {
        endInstalled = false
        try {
          socket.off('end', onEnd)
        } catch (error) {
          failures.push(error)
        }
      }
      if (closeInstalled) {
        closeInstalled = false
        try {
          socket.off('close', onClose)
        } catch (error) {
          failures.push(error)
        }
      }
      return failures
    }
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
          return removeListeners()
        } finally {
          this.pending.delete(pending)
          resolve()
        }
      },
    }
    this.pending.add(pending)
    onClose = () => {
      this.record(pending.finish())
    }
    onEnd = () => {
      let committed = false
      try {
        committed = isCommittedOrFlushing(socket)
      } catch (error) {
        if (!this.failures.includes(error)) this.failures.push(error)
      }
      if (committed) {
        if (installing) {
          endRemovalRequested = true
        } else if (endInstalled) {
          endInstalled = false
          try {
            socket.off('end', onEnd)
          } catch (error) {
            if (!this.failures.includes(error)) this.failures.push(error)
          }
        }
        return
      }
      this.destroy(socket)
      this.record(pending.finish())
    }

    try {
      socket.on('end', onEnd)
      endInstalled = true
      socket.on('close', onClose)
      closeInstalled = true
    } catch (error) {
      installing = false
      const failures = [error, ...removeListeners()]
      finished = true
      this.pending.delete(pending)
      resolve()
      this.record(failures)
      throwFailures(failures)
    }
    installing = false

    if (endRemovalRequested && endInstalled) {
      endInstalled = false
      try {
        socket.off('end', onEnd)
      } catch (error) {
        this.record([error])
      }
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

    throwFailures(this.failures)
  }
}
