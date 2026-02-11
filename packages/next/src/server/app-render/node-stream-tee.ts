import type { Readable as NodeReadable } from 'node:stream'

const MAX_NODE_TEE_PENDING_BYTES = 8 * 1024 * 1024

type NodeTeeChunk = Buffer | Uint8Array

type NodeTeeState = {
  closed: boolean
  pending: Array<NodeTeeChunk>
  pendingStartIndex: number
  pendingBytes: number
  waitingDrain: boolean
  stream: import('node:stream').PassThrough
}

function chunkByteLength(chunk: NodeTeeChunk): number {
  return Buffer.isBuffer(chunk) ? chunk.length : chunk.byteLength
}

function pendingChunkCount(state: NodeTeeState): number {
  return state.pending.length - state.pendingStartIndex
}

function dequeuePendingChunk(state: NodeTeeState): NodeTeeChunk | undefined {
  if (pendingChunkCount(state) === 0) return undefined

  const chunk = state.pending[state.pendingStartIndex]
  state.pendingStartIndex++

  // Compact occasionally so stale entries do not accumulate.
  if (
    state.pendingStartIndex > 1024 &&
    state.pendingStartIndex * 2 >= state.pending.length
  ) {
    state.pending = state.pending.slice(state.pendingStartIndex)
    state.pendingStartIndex = 0
  } else if (state.pendingStartIndex === state.pending.length) {
    state.pending.length = 0
    state.pendingStartIndex = 0
  }

  return chunk
}

/**
 * Tees a Node Readable into two Readables without coupling backpressure
 * across branches.
 */
export function teeNodeReadable(
  source: NodeReadable,
  runInContext: <T>(fn: () => T) => T = (fn) => fn()
): [NodeReadable, NodeReadable] {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new Error('teeNodeReadable is not supported in edge runtime')
  } else {
    const { PassThrough } =
      require('node:stream') as typeof import('node:stream')
    const left = new PassThrough()
    const right = new PassThrough()
    const states: [NodeTeeState, NodeTeeState] = [
      {
        stream: left,
        closed: false,
        pending: [],
        pendingStartIndex: 0,
        pendingBytes: 0,
        waitingDrain: false,
      },
      {
        stream: right,
        closed: false,
        pending: [],
        pendingStartIndex: 0,
        pendingBytes: 0,
        waitingDrain: false,
      },
    ]

    let sourceEnded = false
    let failed = false

    function totalPendingBytes(): number {
      return states[0].pendingBytes + states[1].pendingBytes
    }

    function areAllOpenBranchesBlocked(): boolean {
      for (const state of states) {
        if (state.closed) continue
        if (!state.waitingDrain && pendingChunkCount(state) === 0) {
          return false
        }
      }
      return true
    }

    function maybePauseSource() {
      if (
        !source.isPaused() &&
        areAllOpenBranchesBlocked() &&
        totalPendingBytes() >= MAX_NODE_TEE_PENDING_BYTES
      ) {
        source.pause()
      }
    }

    function maybeResumeSource() {
      if (
        source.isPaused() &&
        !sourceEnded &&
        (totalPendingBytes() < MAX_NODE_TEE_PENDING_BYTES / 2 ||
          !areAllOpenBranchesBlocked())
      ) {
        source.resume()
      }
    }

    function closeBranch(state: NodeTeeState) {
      if (state.closed) return
      state.closed = true
      state.pending.length = 0
      state.pendingStartIndex = 0
      state.pendingBytes = 0
      state.waitingDrain = false
      maybeResumeSource()
      if (states[0].closed && states[1].closed) {
        cleanup()
        if (!source.destroyed) {
          source.destroy()
        }
      }
    }

    function fail(error: Error) {
      if (failed) return
      failed = true
      cleanup()
      for (const state of states) {
        state.pending.length = 0
        state.pendingStartIndex = 0
        state.pendingBytes = 0
        if (!state.closed && !state.stream.destroyed) {
          state.stream.destroy(error)
        }
      }
      if (!source.destroyed) {
        source.destroy(error)
      }
    }

    function maybeCleanupAfterSourceEnd() {
      if (!sourceEnded || failed) return
      for (const state of states) {
        if (
          state.closed ||
          state.stream.destroyed ||
          state.stream.writableEnded
        ) {
          continue
        }
        return
      }
      cleanup()
    }

    function maybeEndBranch(state: NodeTeeState) {
      if (
        failed ||
        state.closed ||
        state.stream.destroyed ||
        state.stream.writableEnded
      ) {
        return
      }
      if (!sourceEnded) return
      if (pendingChunkCount(state) > 0) return
      // Do not wait for drain here. A write() that returned false has already
      // enqueued its chunk into the stream's internal buffer. Waiting for
      // drain before ending can deadlock when this branch is intentionally
      // consumed later than its sibling.
      state.stream.end()
      maybeCleanupAfterSourceEnd()
    }

    function enqueue(state: NodeTeeState, chunk: NodeTeeChunk) {
      if (state.closed) return
      if (
        state.pendingBytes + chunkByteLength(chunk) >
        MAX_NODE_TEE_PENDING_BYTES
      ) {
        fail(
          new Error(
            'Node stream tee buffered too much pending data while waiting for drain'
          )
        )
        return
      }
      state.pending.push(chunk)
      state.pendingBytes += chunkByteLength(chunk)
      maybePauseSource()
    }

    function writeOrQueue(state: NodeTeeState, chunk: NodeTeeChunk) {
      if (state.closed) return
      if (state.waitingDrain || pendingChunkCount(state) > 0) {
        enqueue(state, chunk)
        return
      }
      if (!state.stream.write(chunk)) {
        state.waitingDrain = true
      }
    }

    function flushPending(state: NodeTeeState) {
      if (state.closed || failed) return
      while (pendingChunkCount(state) > 0) {
        if (!sourceEnded && state.waitingDrain) {
          break
        }
        const chunk = dequeuePendingChunk(state)!
        state.pendingBytes -= chunkByteLength(chunk)
        if (!state.stream.write(chunk)) {
          state.waitingDrain = true
          if (!sourceEnded) {
            break
          }
        }
      }
      if (sourceEnded) {
        maybeEndBranch(state)
        return
      }
      maybeResumeSource()
    }

    const onSourceData = (chunk: NodeTeeChunk) => {
      runInContext(() => {
        if (failed) return
        writeOrQueue(states[0], chunk)
        writeOrQueue(states[1], chunk)
        maybePauseSource()
      })
    }
    const onSourceEnd = () => {
      runInContext(() => {
        sourceEnded = true
        flushPending(states[0])
        flushPending(states[1])
        maybeEndBranch(states[0])
        maybeEndBranch(states[1])
        maybeCleanupAfterSourceEnd()
      })
    }
    const onSourceError = (error: Error) => {
      runInContext(() => {
        fail(error)
      })
    }
    const onLeftDrain = () => {
      runInContext(() => {
        states[0].waitingDrain = false
        flushPending(states[0])
      })
    }
    const onRightDrain = () => {
      runInContext(() => {
        states[1].waitingDrain = false
        flushPending(states[1])
      })
    }
    const onLeftClose = () => {
      runInContext(() => {
        closeBranch(states[0])
      })
    }
    const onRightClose = () => {
      runInContext(() => {
        closeBranch(states[1])
      })
    }

    function cleanup() {
      source.off('data', onSourceData)
      source.off('end', onSourceEnd)
      source.off('error', onSourceError)
      states[0].stream.off('drain', onLeftDrain)
      states[1].stream.off('drain', onRightDrain)
      states[0].stream.off('close', onLeftClose)
      states[1].stream.off('close', onRightClose)
    }

    source.on('data', onSourceData)
    source.on('end', onSourceEnd)
    source.on('error', onSourceError)
    states[0].stream.on('drain', onLeftDrain)
    states[1].stream.on('drain', onRightDrain)
    states[0].stream.on('close', onLeftClose)
    states[1].stream.on('close', onRightClose)

    // Handle the case where source already ended before we attached listeners.
    // Node 'end' events fire once, so if the source ended before our listener
    // was attached (e.g. debug channel completed before tee setup), we'd never
    // get the event and the branches would hang.
    //
    // When readableEnded is true, any data pushed into the Readable sits in the
    // internal buffer. Adding a 'data' listener switches to flowing mode and
    // schedules async draining, but we need the data NOW before signaling end.
    // Manually pull buffered data with source.read() to ensure branches receive
    // all chunks before being ended.
    if (source.readableEnded) {
      let chunk: NodeTeeChunk | null
      while ((chunk = source.read() as NodeTeeChunk | null) !== null) {
        onSourceData(chunk)
      }
      onSourceEnd()
    }

    return [left, right]
  }
}
