/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	// The require scope
/******/ 	var __nccwpck_require__ = {};
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__nccwpck_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__nccwpck_require__.o(definition, key) && !__nccwpck_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__nccwpck_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__nccwpck_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// ESM COMPAT FLAG
__nccwpck_require__.r(__webpack_exports__);

// EXPORTS
__nccwpck_require__.d(__webpack_exports__, {
  "patchGlobalWebStreams": () => (/* binding */ patchGlobalWebStreams),
  "unpatchGlobalWebStreams": () => (/* binding */ unpatchGlobalWebStreams)
});

;// CONCATENATED MODULE: ../../node_modules/.pnpm/experimental-fast-webstreams@0.0.18/node_modules/experimental-fast-webstreams/src/utils.js
// Symbols for internal state (non-enumerable, unforgeable)
const kNodeReadable = Symbol('kNodeReadable');
const kNodeWritable = Symbol('kNodeWritable');
const kNodeTransform = Symbol('kNodeTransform');
const kLock = Symbol('kLock');
const kMaterialized = Symbol('kMaterialized');
const kUpstream = Symbol('kUpstream');
const kNativeOnly = Symbol('kNativeOnly');

// Writable state symbols (shared to avoid circular deps)
const kWritableState = Symbol('kWritableState');
const kStoredError = Symbol('kStoredError');

// Sentinel for cancel handlers to signal "don't destroy the node stream"
const kSkipDestroy = Symbol('kSkipDestroy');

// Shared helpers
const noop = () => {};
const isThenable = (v) => v instanceof Promise || (v != null && typeof v.then === 'function');
const RESOLVED_UNDEFINED = Promise.resolve(undefined);

// Instance checks (typeof guard: `in` throws on primitives)
const isFastReadable = (s) => s != null && typeof s === 'object' && kNodeReadable in s;
const isFastWritable = (s) => s != null && typeof s === 'object' && kNodeWritable in s;
const isFastTransform = (s) => s != null && typeof s === 'object' && kNodeTransform in s;

// Extract highWaterMark from a strategy, converting via ToNumber per spec.
// WHATWG default is CountQueuingStrategy with highWaterMark = 1.
function resolveHWM(strategy, defaultHWM = 1) {
  if (!strategy) return defaultHWM;
  if (!('highWaterMark' in strategy)) return defaultHWM;
  const h = Number(strategy.highWaterMark);
  if (Number.isNaN(h) || h < 0) {
    throw new RangeError('Invalid highWaterMark');
  }
  return h;
}

/**
 * LiteReadable — minimal duck-type of Node.js Readable for byte streams.
 * Avoids the ~6µs overhead of new Readable() for short-lived streams.
 * Supports: push, read, destroy, resume, readableLength, readableEnded,
 * readableHighWaterMark, destroyed, errored, on/once/removeListener/emit.
 * Lazy-promotes to a real Node.js Readable when pipeline/pipe is needed.
 */
class LiteReadable {
  constructor(hwm) {
    this._buffer = [];
    this._bufferHead = 0;
    this._ended = false;
    this._destroyed = false;
    this._errored = null;
    this._hwm = hwm;
    this._listeners = null; // lazy: { readable: [], end: [], error: [], close: [] }
    this._readableState = { reading: false, ended: false };
    this._onRead = null; // _read callback (pull)
    this._autoPullPending = false;
    this._isAutoPull = false;
    this._dataCallback = null; // Direct callback for reader fast path (bypasses listeners)
    this._readQueue = null; // FIFO queue for multiple concurrent reads
  }

  get readableHighWaterMark() { return this._hwm; }
  get readableLength() { return this._buffer.length - this._bufferHead; }
  get readableEnded() { return this._ended && this._buffer.length === this._bufferHead; }
  get destroyed() { return this._destroyed; }
  get errored() { return this._errored; }

  push(chunk) {
    if (chunk === null) {
      this._readableState.ended = true;
      if (this._buffer.length === this._bufferHead) {
        this._ended = true;
        if (this._dataCallback) { const cb = this._dataCallback; this._dataCallback = null; cb('end'); }
        else this._emit('end');
      } else {
        if (this._dataCallback) { const cb = this._dataCallback; this._dataCallback = null; cb('data'); }
        else this._emit('readable');
      }
      return;
    }
    this._buffer.push(chunk);
    // A2: Skip notification during sync pull when no async reader is waiting.
    // reader.read() fast path reads the buffer immediately after _onRead() returns.
    if (this._readableState.reading && !this._dataCallback) return;
    if (this._dataCallback) { const cb = this._dataCallback; this._dataCallback = null; cb('data'); }
    else this._emit('readable');
  }

  read(n) {
    if (n === 0) {
      // Trigger _read (pull) if nothing is buffered and not ended/destroyed
      if (this._buffer.length === this._bufferHead && this._onRead && !this._readableState.reading &&
          !this._readableState.ended && !this._destroyed) {
        this._readableState.reading = true;
        this._onRead();
        // Reset after sync return (async pull resets in its .then() handler).
        // The pullCallback check in the _onRead wrapper prevents double-calling
        // regardless of this flag, so resetting here is always safe.
        this._readableState.reading = false;
      }
      return null;
    }
    if (this._buffer.length > this._bufferHead) {
      const chunk = this._buffer[this._bufferHead];
      this._buffer[this._bufferHead] = undefined; // GC
      this._bufferHead++;
      // Compact when head is past 512 and more than half consumed
      if (this._bufferHead > 512 && this._bufferHead > (this._buffer.length >>> 1)) {
        this._buffer = this._buffer.slice(this._bufferHead);
        this._bufferHead = 0;
      }
      // If buffer drained and ended, mark ended
      if (this._buffer.length === this._bufferHead && this._readableState.ended) {
        this._ended = true;
      }
      // Auto-pull after consumption: if buffer drained and pull is set,
      // schedule read(0) to trigger demand (mirrors Node.js maybeReadMore).
      // Guard with _autoPullPending to prevent infinite microtask loops
      // (read(0) → pull → enqueue → readable → read → consumption → auto-pull → repeat).
      if (this._buffer.length === this._bufferHead && this._onRead && !this._destroyed && !this._autoPullPending && this._hwm > 0) {
        this._autoPullPending = true;
        queueMicrotask(() => {
          this._autoPullPending = false;
          if (!this._destroyed && !this._readableState.reading && this._onRead &&
              this._buffer.length === this._bufferHead) {
            this._isAutoPull = true;
            this.read(0);
            this._isAutoPull = false;
          }
        });
      }
      return chunk;
    }
    return null;
  }

  destroy(err) {
    if (this._destroyed) return;
    this._destroyed = true;
    if (err) {
      this._errored = err;
      if (this._dataCallback) { const cb = this._dataCallback; this._dataCallback = null; cb('error', err); }
      else this._emit('error', err);
    } else {
      if (this._dataCallback) { const cb = this._dataCallback; this._dataCallback = null; cb('close'); }
      else this._emit('close');
    }
  }

  resume() { /* no-op — no flowing mode */ }

  // Multi-listener EventEmitter interface
  on(event, fn) {
    this._addListener(event, fn, false);
    return this;
  }

  once(event, fn) {
    this._addListener(event, fn, true);
    return this;
  }

  removeListener(event, fn) {
    if (!this._listeners) return this;
    const arr = this._listeners[event];
    if (!arr) return this;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].fn === fn) {
        arr.splice(i, 1);
        break;
      }
    }
    return this;
  }

  emit() { return false; }

  _addListener(event, fn, once) {
    if (!this._listeners) this._listeners = { readable: [], end: [], error: [], close: [] };
    const arr = this._listeners[event];
    if (arr) arr.push({ fn, once });
  }

  _emit(event, arg) {
    if (!this._listeners) return;
    const arr = this._listeners[event];
    if (!arr || arr.length === 0) return;
    // Fast path: single non-once listener — no snapshot needed
    if (arr.length === 1 && !arr[0].once) {
      arr[0].fn(arg);
      return;
    }
    // Snapshot: iterate a copy so once-removal doesn't skip entries
    const snapshot = arr.slice();
    // Remove once entries first
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].once) arr.splice(i, 1);
    }
    for (let i = 0; i < snapshot.length; i++) {
      snapshot[i].fn(arg);
    }
  }
}

// Debug stats — lightweight counters for tracing which code paths fire.
// Enable with: globalThis.__FAST_WEBSTREAMS_DEBUG = true
// Read with:   import { _debugStats } from 'experimental-fast-webstreams/utils'
const utils_stats = {
  readableCreated: 0,
  writableCreated: 0,
  transformCreated: 0,
  nativeOnlyReadable: 0,
  nativeOnlyWritable: 0,
  nativeOnlyTransform: 0,
  tier0_pipeline: 0,
  tier05_upstream: 0,
  tier1_getReader: 0,
  tier2_specPipeTo: 0,
  tier2_materializeReadable: 0,
  tier2_materializeWritable: 0,
  bridge: 0,
};

function _debugStats() {
  return { ...(utils_stats) };
}

function _resetStats() {
  for (const key of Object.keys(utils_stats)) utils_stats[key] = 0;
}

;// CONCATENATED MODULE: ../../node_modules/.pnpm/experimental-fast-webstreams@0.0.18/node_modules/experimental-fast-webstreams/src/controller.js
/**
 * Controller adapters that bridge WHATWG controller API to Node stream internals.
 */



// Sentinel for wrapping falsy error values that Node.js would lose
const kWrappedError = Symbol('kWrappedError');

// Symbol for byte queue dequeue method (avoids polluting getOwnPropertyNames)
const kDequeueBytes = Symbol('kDequeueBytes');

// Symbols for BYOB-specific methods (avoids polluting getOwnPropertyNames on prototype)
const kAddPendingPullInto = Symbol('addPendingPullInto');
const kHasPendingPullInto = Symbol('hasPendingPullInto');
const kGetByobRequest = Symbol('getByobRequest');
const kReleasePullIntoReads = Symbol('releasePullIntoReads');
const kCancelPendingPullIntos = Symbol('cancelPendingPullIntos');
const kClosePendingPullIntos = Symbol('closePendingPullIntos');
const kWirePullIntoRead = Symbol('wirePullIntoRead');
const kTrySyncFillPullInto = Symbol('trySyncFillPullInto');
const kEnqueueRemainder = Symbol('enqueueRemainder');
const kGetNodeReadable = Symbol('getNodeReadable');
const kEnqueueInternal = Symbol('enqueueInternal');

// Shared unwrap helper — used by reader.js, writable.js
function unwrapError(err) {
  if (err && typeof err === 'object' && kWrappedError in err) {
    return err[kWrappedError];
  }
  return err;
}

/**
 * Shared helper: error the readable side of a transform stream.
 * Sets stored error, marks errored, settles reader's closed and pending reads.
 */
function _errorReadableSide(readable, error) {
  if (!readable || readable._errored) return;
  readable._storedError = error;
  readable._errored = true;
  const reader = readable[kLock];
  if (reader) {
    if (reader._settleClosedFromError) reader._settleClosedFromError(error);
    if (reader._errorReadRequests) reader._errorReadRequests(error);
  }
}

// Brand token for internal-only construction
const kControllerBrand = Symbol('kControllerBrand');

/**
 * ReadableStreamDefaultController adapter.
 *
 * For byte streams (type: 'bytes'), also manages pull-into descriptors
 * to support BYOB reads without native delegation.
 */
class FastReadableStreamDefaultController {
  #nodeReadable;
  #closed = false;
  #errored = false;
  #originalHWM;
  #byteQueueSize = 0;
  _stream = null; // Set by the stream constructor

  // Pull-into state for BYOB reads (byte streams only, lazily allocated)
  #pendingPullIntos = null;
  #byobRequest = null;

  constructor(nodeReadable, originalHWM) {
    this.#nodeReadable = nodeReadable;
    this.#originalHWM = originalHWM !== undefined ? originalHWM : nodeReadable.readableHighWaterMark;
  }

  /**
   * Internal enqueue — skips byte validation and buffer.transfer() on the chunk.
   * Used by tee() where the caller owns the chunk and no transfer is needed.
   * Still fills pending BYOB pull-into descriptors (for BYOB readers on branches).
   * Keyed by Symbol to avoid appearing in getOwnPropertyNames (WPT checks prototype shape).
   */
  [kEnqueueInternal](chunk) {
    if (this.#closed || this.#errored) return;
    if (this._stream && this._stream._isByteStream && chunk != null) {
      // Fill pending BYOB pull-into descriptors if any
      if (this.#pendingPullIntos && this.#pendingPullIntos.length > 0) {
        this.#fillPendingPullIntosFromEnqueue(chunk);
        return;
      }
      this.#byteQueueSize += chunk.byteLength || 0;
    }
    this.#nodeReadable.push(chunk);
  }

  enqueue(chunk) {
    if (this.#errored) {
      throw new TypeError('Cannot enqueue to an errored stream');
    }
    if (this.#closed || (this._stream && this._stream._closed)) {
      throw new TypeError('Cannot enqueue to a closed stream');
    }
    // Byte streams: validate and convert per spec
    if (this._stream && this._stream._isByteStream) {
      // Fast path: Uint8Array with valid buffer, no pending BYOB descriptors.
      // Covers the common React Flight pattern (start+enqueue with Uint8Array).
      // Skips SharedArrayBuffer check, zero-length check (both are rare edge cases
      // that are still caught — transfer() throws on SharedArrayBuffer, and
      // zero-length buffers have byteLength === 0 which fails the guard).
      if (chunk instanceof Uint8Array && chunk.byteLength > 0 &&
          (!this.#pendingPullIntos || this.#pendingPullIntos.length === 0)) {
        const off = chunk.byteOffset, len = chunk.byteLength;
        let transferred;
        try { transferred = chunk.buffer.transfer(); }
        catch { throw new TypeError('Cannot enqueue a chunk with a non-transferable buffer'); }
        const u8 = new Uint8Array(transferred, off, len);
        this.#byteQueueSize += len;
        this.#nodeReadable.push(u8);
        return;
      }

      if (ArrayBuffer.isView(chunk)) {
        // Check for detached buffer
        if (chunk.buffer.detached) {
          throw new TypeError('Cannot enqueue a chunk with a detached buffer');
        }
        // Check for SharedArrayBuffer or non-transferable buffer (e.g., WebAssembly.Memory)
        if (chunk.buffer instanceof SharedArrayBuffer) {
          throw new TypeError('Cannot enqueue a chunk backed by a SharedArrayBuffer');
        }
        // Check for zero-length chunk
        if (chunk.byteLength === 0) {
          throw new TypeError('Cannot enqueue a zero-length chunk');
        }
        // Per spec: TransferArrayBuffer — detaches caller's buffer, gives us ownership.
        // Non-transferable buffers (e.g., WebAssembly.Memory) throw TypeError.
        // Capture offset/length before transfer (transfer zeroes the original view).
        const savedOffset = chunk.byteOffset;
        const savedLength = chunk.byteLength;
        let transferred;
        try { transferred = chunk.buffer.transfer(); }
        catch { throw new TypeError('Cannot enqueue a chunk with a non-transferable buffer'); }
        chunk = new Uint8Array(transferred, savedOffset, savedLength);
      } else if (chunk instanceof ArrayBuffer) {
        if (chunk.detached) {
          throw new TypeError('Cannot enqueue a chunk with a detached buffer');
        }
        if (chunk.byteLength === 0) {
          throw new TypeError('Cannot enqueue a zero-length chunk');
        }
        try { chunk = chunk.transfer(); }
        catch { throw new TypeError('Cannot enqueue a chunk with a non-transferable buffer'); }
      }

      // BYOB fill path: if there are pending pull-into descriptors
      if (this.#pendingPullIntos && this.#pendingPullIntos.length > 0) {
        const firstD = this.#pendingPullIntos[0];
        if (firstD._resolve === null) {
          // Per spec step 7: released reader's pull-into (readerType "none").
          // Commit partially filled buffer to queue, then proceed.
          if (firstD.bytesFilled > 0) {
            // Per spec: create a new buffer with just the filled bytes
            // (not a view of the original pull-into buffer)
            const committed = new Uint8Array(firstD.bytesFilled);
            committed.set(new Uint8Array(firstD.buffer, firstD.byteOffset, firstD.bytesFilled));
            this.#byteQueueSize += committed.byteLength;
            this.#nodeReadable.push(committed);
          }
          this.#pendingPullIntos.shift();
          this.#byobRequest = null;
          // Check if there are more descriptors to fill
          if (this.#pendingPullIntos.length > 0) {
            this.#fillPendingPullIntosFromEnqueue(chunk);
            return;
          }
          // Fall through to normal enqueue below
        } else {
          // Active reader's pull-into — fill it from enqueue
          this.#fillPendingPullIntosFromEnqueue(chunk);
          return;
        }
      }
    }
    // Track byte queue size for byte stream desiredSize
    if (this._stream && this._stream._isByteStream && chunk != null) {
      this.#byteQueueSize += chunk.byteLength || 0;
    }
    this.#nodeReadable.push(chunk);
  }

  /**
   * Fill pending pull-into descriptors from an enqueued chunk.
   * Per spec: ReadableByteStreamControllerEnqueue fills pull-intos first,
   * then pushes remainder to byte queue.
   */
  #fillPendingPullIntosFromEnqueue(chunk) {
    const pullIntos = this.#pendingPullIntos;
    const d = pullIntos[0];

    // Invalidate cached byobRequest (view is changing) — transfer buffer
    if (this.#byobRequest) {
      this.#byobRequest.view = null;
      this.#byobRequest._responded = true;
    }
    // Transfer the descriptor's buffer so old views become detached
    const newBuffer = d.buffer.transfer();
    d.buffer = newBuffer;
    this.#byobRequest = null;

    // Copy bytes from chunk into the descriptor's buffer
    const src = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    const remaining = d.byteLength - d.bytesFilled;
    const toCopy = Math.min(src.byteLength, remaining);
    const dst = new Uint8Array(d.buffer, d.byteOffset + d.bytesFilled, toCopy);
    dst.set(src.subarray(0, toCopy));
    d.bytesFilled += toCopy;

    const leftover = src.byteLength - toCopy;

    // Check if the descriptor is complete (aligned and meets minimum)
    if (d.bytesFilled % d.elementSize === 0 && d.bytesFilled >= d.minimumFill) {
      // Complete — fulfill or commit
      this.#commitPullIntoDescriptor(d);
      pullIntos.shift();

      // Push leftover to byte queue (for subsequent reads)
      if (leftover > 0) {
        const rest = new Uint8Array(src.buffer, src.byteOffset + toCopy, leftover);
        this.#byteQueueSize += rest.byteLength;
        this.#nodeReadable.push(rest);
      }

      // After committing, try to fill remaining descriptors from queue
      this.#processRemainingPullIntos();
    } else {
      // Not complete — chunk fully consumed but descriptor not filled
      if (leftover > 0) {
        const rest = new Uint8Array(src.buffer, src.byteOffset + toCopy, leftover);
        this.#byteQueueSize += rest.byteLength;
        this.#nodeReadable.push(rest);
      }
      // Schedule re-pull for partial fill (double-deferred: first microtask waits
      // for pullLock to clear, second microtask triggers the actual re-pull)
      if (d._resolve) {
        const controller = this;
        queueMicrotask(() => {
          queueMicrotask(() => {
            if (d._resolve === null) return;
            if (controller.#closed || controller.#errored) return;
            const stream = controller._stream;
            if (!stream || !stream._pullFn) return;
            const nr = controller.#nodeReadable;
            if (nr && !nr.destroyed && nr._onRead && !nr._readableState.ended) {
              if (stream._pullLock) return;
              nr._readableState.reading = false;
              nr.read(0);
            }
          });
        });
      }
    }
  }

  /**
   * Commit a completed pull-into descriptor — fulfill its read promise
   * or push to byte queue if no active reader.
   */
  #commitPullIntoDescriptor(d) {
    if (d._resolve) {
      const filledView = new d.viewConstructor(d.buffer, d.byteOffset,
        d.bytesFilled / d.elementSize);
      d._resolve({ value: filledView, done: false });
      d._resolve = null;
      d._reject = null;
    } else {
      // No active reader (released) — push committed data to byte queue
      // Per spec: committed for readerType "none" creates Uint8Array and enqueues
      const committedChunk = new Uint8Array(d.buffer, d.byteOffset, d.bytesFilled);
      this.#byteQueueSize += committedChunk.byteLength;
      this.#nodeReadable.push(committedChunk);
    }
  }

  /**
   * After committing/shifting the first descriptor, try to fill remaining
   * descriptors from the byte queue (LiteReadable buffer).
   * Per spec: ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue
   */
  #processRemainingPullIntos() {
    while (this.#pendingPullIntos && this.#pendingPullIntos.length > 0) {
      const d = this.#pendingPullIntos[0];
      if (this[kTrySyncFillPullInto](d)) {
        this.#commitPullIntoDescriptor(d);
        this.#pendingPullIntos.shift();
        this.#byobRequest = null;
      } else {
        break;
      }
    }
  }

  /**
   * Commit a pull-into descriptor with done:true (closed stream).
   * Per spec: ReadableByteStreamControllerCommitPullIntoDescriptor with done=true
   */
  #commitPullIntoDescriptorDone(d) {
    if (d._resolve) {
      // Create a zero-length (or filled-length) view for the done result
      const filledView = new d.viewConstructor(d.buffer, d.byteOffset,
        d.bytesFilled / d.elementSize);
      d._resolve({ value: filledView, done: true });
      d._resolve = null;
      d._reject = null;
    }
    // If no resolve (released reader), just discard
  }

  /**
   * Process remaining pull-intos after close+respond — fulfill all with done:true.
   */
  #processRemainingPullIntosClosed() {
    while (this.#pendingPullIntos && this.#pendingPullIntos.length > 0) {
      const d = this.#pendingPullIntos[0];
      this.#commitPullIntoDescriptorDone(d);
      this.#pendingPullIntos.shift();
      this.#byobRequest = null;
    }
  }

  // Called by reader when consuming a chunk (decrements byte queue tracking)
  // Keyed by Symbol to avoid appearing in getOwnPropertyNames (WPT checks prototype shape)
  [kDequeueBytes](chunk) {
    if (chunk != null) {
      this.#byteQueueSize -= chunk.byteLength || 0;
      if (this.#byteQueueSize < 0) this.#byteQueueSize = 0;
    }
  }

  close() {
    if (this.#errored) {
      throw new TypeError('Cannot close an errored stream');
    }
    if (this.#closed || (this._stream && this._stream._closed)) {
      throw new TypeError('Cannot close an already closed stream');
    }

    // Byte stream BYOB: alignment check on close
    if (this.#pendingPullIntos && this.#pendingPullIntos.length > 0) {
      const d = this.#pendingPullIntos[0];
      if (d.bytesFilled > 0 && d.bytesFilled % d.elementSize !== 0) {
        const e = new TypeError('Insufficient bytes to fill elements in the given buffer');
        this.error(e);
        throw e;
      }
      // Per spec: don't immediately fulfill pending pull-intos on close.
      // They are fulfilled when respond(0) is called on the closed stream.
      // But if there's no pull and no pending byobRequest (just queued data
      // with a waiting read), we should resolve pending descriptors with done:true.
    }

    this.#closed = true;
    const r = this.#nodeReadable;
    r.push(null);
    if (r.readableLength === 0) {
      r.resume();
    }
    // Track close state on the stream. Only set _closed if no buffered data
    // (per spec: state transitions to "closed" only when queue is empty).
    // When data is buffered, _closed is set later when 'end' fires.
    if (this._stream) {
      if (r.readableLength === 0) {
        this._stream._closed = true;
        // Synchronously resolve reader.closed (don't wait for Node 'end' event)
        const reader = this._stream[kLock];
        if (reader && reader._resolveClosedFromCancel) {
          reader._resolveClosedFromCancel();
        }
      }
    }
  }

  error(e) {
    if (this.#errored) return;
    // Per spec: error is no-op if stream is already closed
    if (this.#closed || (this._stream && this._stream._closed)) return;
    this.#errored = true;
    if (e == null || e === false || e === 0 || e === '') {
      const wrapped = new Error('wrapped');
      wrapped[kWrappedError] = e;
      this.#nodeReadable.destroy(wrapped);
    } else {
      this.#nodeReadable.destroy(e);
    }
    // Reject pending BYOB reads
    if (this.#pendingPullIntos) {
      for (const d of this.#pendingPullIntos) {
        if (d._reject) {
          d._reject(e);
          d._resolve = null;
          d._reject = null;
        }
      }
      this.#pendingPullIntos = null;
      this.#byobRequest = null;
    }
    // Track error state on the stream for releaseLock to use
    if (this._stream) {
      this._stream._storedError = e;
      this._stream._errored = true;
      // Per spec: synchronously settle closed FIRST, then reject pending reads
      const reader = this._stream[kLock];
      if (reader) {
        if (reader._settleClosedFromError) reader._settleClosedFromError(e);
        if (reader._errorReadRequests) reader._errorReadRequests(e);
      }
    }
  }

  get desiredSize() {
    if (this.#errored) return null;
    if (this.#closed) return 0;
    const r = this.#nodeReadable;
    if (this.#originalHWM === Infinity) {
      return Infinity;
    }
    // Byte streams: use byte queue size instead of item count
    if (this._stream && this._stream._isByteStream) {
      return this.#originalHWM - this.#byteQueueSize;
    }
    // Account for pending reads: in WHATWG spec, pending reads consume enqueued
    // chunks directly (no queuing). Our Node readable buffers chunks first,
    // so subtract pending reads from queue length for accurate desiredSize.
    const queueSize = r.readableLength;
    const reader = this._stream?.[kLock];
    const pendingReads = reader?._pendingReadCount?.() ?? 0;
    return this.#originalHWM - Math.max(0, queueSize - pendingReads);
  }

  // --- BYOB pull-into management (byte streams only) ---

  /**
   * Add a pull-into descriptor (called by BYOB reader's read(view)).
   */
  [kAddPendingPullInto](descriptor) {
    if (!this.#pendingPullIntos) this.#pendingPullIntos = [];
    // Only invalidate byobRequest if this is the first descriptor.
    // Per spec: subsequent descriptors go to end of queue and don't
    // affect the first byobRequest (which survives releaseLock).
    if (this.#pendingPullIntos.length === 0) {
      this.#byobRequest = null;
    }
    this.#pendingPullIntos.push(descriptor);
  }

  /**
   * Check if there are pending pull-into descriptors with active resolve callbacks.
   */
  [kHasPendingPullInto]() {
    if (!this.#pendingPullIntos || this.#pendingPullIntos.length === 0) return false;
    // Only return true if at least one descriptor has an active resolve
    return this.#pendingPullIntos.some(d => d._resolve !== null);
  }

  /**
   * Get the byobRequest for the first pending pull-into.
   * Returns the same object on repeated calls until invalidated.
   */
  [kGetByobRequest]() {
    if (!this.#pendingPullIntos || this.#pendingPullIntos.length === 0) return null;
    if (this.#byobRequest) return this.#byobRequest;

    const d = this.#pendingPullIntos[0];
    const view = new Uint8Array(d.buffer, d.byteOffset + d.bytesFilled,
      d.byteLength - d.bytesFilled);

    const controller = this;
    const req = Object.create(null);

    // view as data property
    req.view = view;

    req.respond = function respond(bytesWritten) {
      // Double-respond prevention
      if (req._responded) throw new TypeError('byobRequest already responded');
      // Respond after cancel/error check
      if (controller._stream && controller._stream._errored) {
        throw new TypeError('Cannot respond on an errored stream');
      }
      if (controller._stream && controller._stream._closed && !controller.#closed) {
        throw new TypeError('Cannot respond on a canceled stream');
      }

      bytesWritten = Number(bytesWritten);
      if (Number.isNaN(bytesWritten) || bytesWritten < 0) {
        throw new TypeError('bytesWritten must be non-negative');
      }
      // Per spec: respond(0) on non-closed stream should throw
      if (bytesWritten === 0 && !controller.#closed) {
        throw new TypeError('bytesWritten must be positive when stream is readable');
      }
      if (d.bytesFilled + bytesWritten > d.byteLength) {
        throw new RangeError('bytesWritten out of range');
      }
      d.bytesFilled += bytesWritten;

      // Transfer buffer per spec: old view's buffer becomes detached
      const newBuffer = d.buffer.transfer();
      d.buffer = newBuffer;

      // Invalidate old request
      req._responded = true;
      req.view = null;
      controller.#byobRequest = null;

      if (controller.#closed) {
        controller.#commitPullIntoDescriptorDone(d);
        controller.#pendingPullIntos.shift();
        controller.#processRemainingPullIntosClosed();
      } else {
        // Handle element-size remainder per spec
        const remainderSize = d.bytesFilled % d.elementSize;
        if (remainderSize > 0 && d.bytesFilled >= d.elementSize) {
          // Enqueue remainder to byte queue, then commit aligned portion
          const remainder = new Uint8Array(d.buffer.slice(
            d.byteOffset + d.bytesFilled - remainderSize, d.byteOffset + d.bytesFilled));
          controller.#byteQueueSize += remainder.byteLength;
          controller.#nodeReadable.push(remainder);
          d.bytesFilled -= remainderSize;
        }
        if (d.bytesFilled >= d.minimumFill && d.bytesFilled % d.elementSize === 0) {
          controller.#commitPullIntoDescriptor(d);
          controller.#pendingPullIntos.shift();
          controller.#processRemainingPullIntos();
          // After commit, trigger pull for remaining pending descriptors
          if (controller.#pendingPullIntos && controller.#pendingPullIntos.length > 0 &&
              controller.#pendingPullIntos[0]._resolve) {
            queueMicrotask(() => {
              queueMicrotask(() => {
                const next = controller.#pendingPullIntos?.[0];
                if (!next || next._resolve === null) return;
                if (controller.#closed || controller.#errored) return;
                const stream = controller._stream;
                if (!stream || !stream._pullFn) return;
                const nr = controller.#nodeReadable;
                if (nr && !nr.destroyed && nr._onRead && !nr._readableState.ended) {
                  if (stream._pullLock) return;
                  nr._readableState.reading = false;
                  nr.read(0);
                }
              });
            });
          }
        } else if (d._resolve) {
          // Partial respond with pending descriptor: double-deferred re-pull
          // (first microtask waits for sync pullLock to clear, second triggers pull)
          queueMicrotask(() => {
            queueMicrotask(() => {
              if (d._resolve === null) return;
              if (controller.#closed || controller.#errored) return;
              const stream = controller._stream;
              if (!stream || !stream._pullFn) return;
              const nr = controller.#nodeReadable;
              if (nr && !nr.destroyed && nr._onRead && !nr._readableState.ended) {
                if (stream._pullLock) return;
                nr._readableState.reading = false;
                nr.read(0);
              }
            });
          });
        }
      }
    };

    req.respondWithNewView = function respondWithNewView(newView) {
      // Double-respond prevention
      if (req._responded) throw new TypeError('byobRequest already responded');
      // Respond after cancel/error check
      if (controller._stream && controller._stream._errored) {
        throw new TypeError('Cannot respond on an errored stream');
      }
      if (controller._stream && controller._stream._closed && !controller.#closed) {
        throw new TypeError('Cannot respond on a canceled stream');
      }

      if (!ArrayBuffer.isView(newView)) {
        throw new TypeError('view must be a TypedArray or DataView');
      }
      if (newView.buffer instanceof SharedArrayBuffer) {
        throw new TypeError('view must not reference a SharedArrayBuffer');
      }
      // Save dimensions before potential transfer
      const newViewByteOffset = newView.byteOffset;
      const bytesWritten = newView.byteLength;
      // Per spec: respondWithNewView(zero-length) on non-closed stream should throw
      if (bytesWritten === 0 && !controller.#closed) {
        throw new TypeError('bytesWritten must be positive when stream is readable');
      }

      // Per spec: transfer the buffer (non-transferable throws)
      let newBuffer;
      try { newBuffer = newView.buffer.transfer(); } catch {
        throw new TypeError('Cannot respondWithNewView with a non-transferable buffer');
      }
      d.buffer = newBuffer;
      d.byteOffset = newViewByteOffset;
      d.bytesFilled = bytesWritten;

      // Invalidate old request
      req._responded = true;
      req.view = null;
      controller.#byobRequest = null;

      if (controller.#closed) {
        controller.#commitPullIntoDescriptorDone(d);
        controller.#pendingPullIntos.shift();
        controller.#processRemainingPullIntosClosed();
      } else if (d.bytesFilled % d.elementSize === 0 && d.bytesFilled >= d.minimumFill) {
        controller.#commitPullIntoDescriptor(d);
        controller.#pendingPullIntos.shift();
        controller.#processRemainingPullIntos();
      }
    };

    this.#byobRequest = req;
    return req;
  }

  /**
   * Invalidate pending pull-into read promises (called by BYOB reader releaseLock).
   * The descriptors STAY on the controller (per spec: pull-into survives releaseLock).
   * Only the resolve/reject callbacks are cleared.
   */
  [kReleasePullIntoReads]() {
    if (!this.#pendingPullIntos) return;
    for (const d of this.#pendingPullIntos) {
      d._resolve = null;
      d._reject = null;
    }
    // Don't clear byobRequest — it survives releaseLock per spec
  }

  /**
   * Fulfill all pending BYOB reads with {done: true, value: undefined}.
   * Called when the stream is canceled with pending BYOB reads.
   */
  [kCancelPendingPullIntos]() {
    if (!this.#pendingPullIntos) return;
    for (const d of this.#pendingPullIntos) {
      if (d._resolve) {
        d._resolve({ value: undefined, done: true });
        d._resolve = null;
        d._reject = null;
      }
    }
    this.#pendingPullIntos = null;
    this.#byobRequest = null;
  }

  /**
   * Close all pending BYOB pull-into descriptors with done:true and proper typed views.
   * Used by tee close path where respond(0) isn't available.
   */
  [kClosePendingPullIntos]() {
    if (!this.#pendingPullIntos || this.#pendingPullIntos.length === 0) return;
    this.#processRemainingPullIntosClosed();
  }

  /**
   * Wire a new read promise to the first pending pull-into descriptor
   * (called by a second reader after first was released).
   * For BYOB readers: wires with the original viewConstructor.
   * For default readers: just return false (default reader reads from queue).
   */
  [kWirePullIntoRead](resolve, reject) {
    if (!this.#pendingPullIntos || this.#pendingPullIntos.length === 0) return false;
    const d = this.#pendingPullIntos[0];
    if (d._resolve) return false; // Already wired
    d._resolve = resolve;
    d._reject = reject;
    return true;
  }

  /**
   * Try to fill a pull-into descriptor synchronously from LiteReadable buffer.
   * Returns true if the descriptor was filled enough (meets minimum + alignment).
   */
  [kTrySyncFillPullInto](d) {
    const nr = this.#nodeReadable;
    const buf = nr._buffer;
    let head = nr._bufferHead;
    if (!buf || buf.length === head) return false;

    // Fill as much as possible from the buffer (up to byteLength, not just minimumFill)
    while (buf.length > head && d.bytesFilled < d.byteLength) {
      const chunk = buf[head];
      const chunkBytes = chunk.byteLength;
      const need = d.byteLength - d.bytesFilled;
      const toCopy = Math.min(chunkBytes, need);

      const src = new Uint8Array(chunk.buffer, chunk.byteOffset, toCopy);
      const dst = new Uint8Array(d.buffer, d.byteOffset + d.bytesFilled, toCopy);
      dst.set(src);
      d.bytesFilled += toCopy;

      // Dequeue bytes
      this.#byteQueueSize -= toCopy;
      if (this.#byteQueueSize < 0) this.#byteQueueSize = 0;

      if (toCopy === chunkBytes) {
        buf[head] = undefined; // GC
        head++;
      } else {
        // Partial consumption — replace with remainder
        buf[head] = new Uint8Array(chunk.buffer, chunk.byteOffset + toCopy, chunkBytes - toCopy);
      }
    }

    // Update head on LiteReadable
    nr._bufferHead = head;

    // Update LiteReadable ended state
    if (buf.length === head && nr._readableState && nr._readableState.ended) {
      nr._ended = true;
    }

    return d.bytesFilled % d.elementSize === 0 && d.bytesFilled >= d.minimumFill;
  }

  /**
   * Enqueue remainder bytes back into the byte queue (after element alignment).
   */
  [kEnqueueRemainder](chunk) {
    this.#byteQueueSize += chunk.byteLength;
    this.#nodeReadable.push(chunk);
  }

  /**
   * Get the node readable (for BYOB reader to check state).
   */
  [kGetNodeReadable]() {
    return this.#nodeReadable;
  }
}



/**
 * TransformStreamDefaultController adapter.
 */
class FastTransformStreamDefaultController {
  #nodeTransform;
  #terminated = false;
  #errored = false;
  #enqueueBlocked = false;
  #transformStream = null;

  constructor(nodeTransform) {
    this.#nodeTransform = nodeTransform;
  }

  // Called by FastTransformStream to wire up the reference
  _setTransformStream(ts) {
    this.#transformStream = ts;
  }

  enqueue(chunk) {
    if (this.#terminated || this.#errored || this.#enqueueBlocked) {
      throw new TypeError('Cannot enqueue to an errored stream');
    }
    this.#nodeTransform.push(chunk);
    // Update transform backpressure after enqueue
    this._updateBackpressure();
  }

  /**
   * Update backpressure flag on the writable shell based on readable desiredSize.
   * Per spec: TransformStreamSetBackpressure
   */
  _updateBackpressure() {
    if (!this.#transformStream) return;
    const writable = this.#transformStream.writable;
    if (!writable || !writable._isTransformShell) return;
    const t = this.#nodeTransform;
    const desiredSize = t.readableHighWaterMark - t.readableLength;

    // Fast path: if desiredSize > 0, backpressure is definitely false
    // (pending reads can only increase effective size). Skip optional chaining.
    if (desiredSize > 0) {
      if (writable._transformBackpressure) {
        writable._transformBackpressure = false;
        if (writable._transformBackpressureResolve) {
          writable._transformBackpressureResolve();
        }
      }
      return;
    }

    // Only compute pendingReads when desiredSize <= 0
    const reader = this.#transformStream.readable?.[kLock];
    const pendingReads = reader?._pendingReadCount?.() ?? 0;
    const effectiveDesiredSize = desiredSize + pendingReads;
    const backpressure = effectiveDesiredSize <= 0;
    if (writable._transformBackpressure !== backpressure) {
      writable._transformBackpressure = backpressure;
      if (!backpressure && writable._transformBackpressureResolve) {
        writable._transformBackpressureResolve();
      }
    }
  }

  error(e) {
    if (this.#errored) return;
    // Per spec: error is no-op if readable is "closed" (fully closed, no queued data).
    // But if terminated with queued data (closeRequested but state="readable"), error should work.
    if (this.#terminated && this.#nodeTransform.readableLength === 0) return;
    this.#terminated = true;
    this.#errored = true;
    // Error the readable side directly (set stored error + reject reader)
    if (this.#transformStream) {
      _errorReadableSide(this.#transformStream.readable, e);
    }
    if (!this.#nodeTransform.destroyed) {
      this.#nodeTransform.destroy(e);
    }
    // Also error the writable side
    if (this.#transformStream && this.#transformStream._errorWritable) {
      this.#transformStream._errorWritable(e);
    }
  }

  terminate() {
    if (this.#terminated) return;
    this.#terminated = true;
    this.#nodeTransform.push(null);
    // Per spec: terminate also errors the writable side,
    // UNLESS we're inside flush (writable is already closing)
    if (this.#transformStream && this.#transformStream._flushStarted) {
      return; // During flush, terminate only closes readable (writable close proceeds)
    }
    const terminateError = new TypeError('TransformStream terminated');
    if (this.#transformStream && this.#transformStream._errorWritable) {
      this.#transformStream._errorWritable(terminateError);
    }
  }

  // Mark as enqueue-blocked (called by readable cancel to prevent subsequent enqueue)
  // Does NOT set #errored — error() should still work after cancel
  _markErrored() {
    this.#enqueueBlocked = true;
  }

  get desiredSize() {
    const t = this.#nodeTransform;
    if (this.#terminated) return 0;
    const queueSize = t.readableLength;
    // Fast path: empty queue means effectiveQueueSize = 0 (max(0, 0-N) = 0)
    if (queueSize === 0) return t.readableHighWaterMark;
    // Only compute pendingReads when queue has items
    const reader = this.#transformStream?.readable?.[kLock];
    const pendingReads = reader?._pendingReadCount?.() ?? 0;
    return t.readableHighWaterMark - Math.max(0, queueSize - pendingReads);
  }
}

/**
 * WritableStreamDefaultController adapter.
 * Receives a controllerError callback at construction to avoid circular imports.
 */
class FastWritableStreamDefaultController {
  #abortController;
  #controllerErrorFn;
  #stream;

  constructor(nodeWritable, stream, controllerErrorFn, brand) {
    if (brand !== kControllerBrand) {
      throw new TypeError('Illegal constructor');
    }
    this.#stream = stream;
    this.#controllerErrorFn = controllerErrorFn;
    this.#abortController = null; // Lazy — most streams are never aborted
  }

  error(e) {
    if (this.#controllerErrorFn) {
      this.#controllerErrorFn(this.#stream, e);
    }
  }

  _abortSignal(reason) {
    if (!this.#abortController) this.#abortController = new AbortController();
    if (!this.#abortController.signal.aborted) {
      this.#abortController.abort(reason);
    }
  }

  get signal() {
    if (!this.#abortController) this.#abortController = new AbortController();
    return this.#abortController.signal;
  }
}

;// CONCATENATED MODULE: external "node:stream"
const external_node_stream_namespaceObject = require("node:stream");
;// CONCATENATED MODULE: ../../node_modules/.pnpm/experimental-fast-webstreams@0.0.18/node_modules/experimental-fast-webstreams/src/natives.js
/**
 * Capture references to the original native stream constructors BEFORE
 * any monkey-patching can occur. All internal code that needs the real
 * native constructors (for delegation, instanceof checks, etc.) must
 * import from this module instead of using bare globals.
 */

const NativeReadableStream = globalThis.ReadableStream;
const NativeWritableStream = globalThis.WritableStream;
const NativeTransformStream = globalThis.TransformStream;
const NativeByteLengthQueuingStrategy = globalThis.ByteLengthQueuingStrategy;
const NativeCountQueuingStrategy = globalThis.CountQueuingStrategy;

;// CONCATENATED MODULE: ../../node_modules/.pnpm/experimental-fast-webstreams@0.0.18/node_modules/experimental-fast-webstreams/src/materialize.js
/**
 * Tier 2 delegation: convert Fast streams to native WHATWG streams
 * using Node.js built-in Readable.toWeb() / Writable.toWeb().
 */





function materialize_materializeReadable(fastReadable) {
  if (fastReadable[kMaterialized]) return fastReadable[kMaterialized];
  utils_stats.tier2_materializeReadable++;

  // kNodeReadable may be null for native-only streams (byte, custom size)
  const nodeReadable = fastReadable[kNodeReadable];
  if (!nodeReadable) {
    throw new Error('Cannot materialize: no Node readable (native-only stream should already have kMaterialized)');
  }

  const native = external_node_stream_namespaceObject.Readable.toWeb(nodeReadable);
  fastReadable[kMaterialized] = native;
  return native;
}

/**
 * Convert a typed array or DataView to Uint8Array (byte stream spec requirement).
 */
function toUint8Array(chunk) {
  if (chunk instanceof Uint8Array) return chunk;
  if (ArrayBuffer.isView(chunk)) return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
  return chunk;
}

/**
 * Materialize a fast byte stream as a native byte stream (type: 'bytes').
 * Uses dual-write: hooks the fast controller's enqueue/close/error to also
 * operate on the native byte controller. This gives the native stream the
 * same data as the Node readable, enabling BYOB reads, tee, and byobRequest.
 * No pull bridge — data flows via the fast controller hooks.
 */
function materializeReadableAsBytes(fastReadable) {
  if (fastReadable[kMaterialized]) return fastReadable[kMaterialized];
  utils_stats.tier2_materializeReadable++;

  const nodeReadable = fastReadable[kNodeReadable];
  if (!nodeReadable) {
    throw new Error('Cannot materialize as bytes: no Node readable');
  }

  const ctrl = fastReadable._controller;
  let nativeCtrl = null;

  const nativeSource = {
    type: 'bytes',
    start(controller) {
      nativeCtrl = controller;
      // If the fast stream is already errored, propagate to native
      if (fastReadable._errored) {
        controller.error(fastReadable._storedError);
        return;
      }
      // Drain any data already buffered in the Node readable
      let chunk;
      while ((chunk = nodeReadable.read()) !== null) {
        controller.enqueue(toUint8Array(chunk));
      }
      // Check if stream already ended (close was called before materialization)
      if (nodeReadable._readableState && nodeReadable._readableState.ended) {
        controller.close();
      }
    },
    cancel(reason) {
      return fastReadable._cancelInternal(reason);
    },
  };

  // Pull handoff: if the fast stream has a pull function, disable LiteReadable's
  // _onRead (demand-driven pull) and add a native pull that calls the user's pull
  // with the fast controller. This ensures a single pull coordinator — native pull
  // drives demand, data flows through dual-write hooks (enqueue → both controllers).
  if (fastReadable._pullFn) {
    // Disable LiteReadable demand-driven pull
    if (nodeReadable._onRead !== undefined) nodeReadable._onRead = null;

    const userSource = fastReadable._byteSource;
    nativeSource.pull = () => {
      // Don't call user's pull if stream is errored or closed
      if (fastReadable._errored || fastReadable._closed) return;
      return Reflect.apply(userSource.pull, userSource, [ctrl]);
    };
  }

  const native = new NativeReadableStream(nativeSource);

  // Hook fast controller to dual-write into the native byte controller.
  // This ensures enqueue/close/error go directly to both the Node readable
  // (for fast default reader) and the native byte stream (for BYOB/tee).
  if (ctrl && nativeCtrl) {
    const proto = Object.getPrototypeOf(ctrl);
    const origEnqueue = proto.enqueue;
    const origClose = proto.close;
    const origError = proto.error;

    ctrl.enqueue = function(chunk) {
      // Copy chunk data before origEnqueue transfers the buffer (byte stream spec).
      // Preserve the original byteOffset by allocating a full-size buffer copy
      // and creating a view at the same offset. Native tee expects offset-preserving chunks.
      // This is a Tier 2 path (tee materialization) where the copy cost is acceptable.
      let nativeChunk;
      if (ArrayBuffer.isView(chunk)) {
        const bufCopy = chunk.buffer.slice(0);
        nativeChunk = new Uint8Array(bufCopy, chunk.byteOffset, chunk.byteLength);
      } else {
        nativeChunk = chunk;
      }
      origEnqueue.call(this, chunk);
      try { nativeCtrl.enqueue(nativeChunk); } catch {}
    };
    ctrl.close = function() {
      // Try native close FIRST — it throws TypeError for Uint16Array with
      // unaligned bytesFilled ("Invalid state: Partial read").
      // Tests 4, 8 expect close() to throw this error AND error the stream.
      try {
        nativeCtrl.close();
      } catch (err) {
        if (err.code === 'ERR_INVALID_STATE') {
          // Alignment error from native — propagate to fast controller too
          origError.call(this, err);
          throw err;
        }
        // Swallow other errors (e.g., already closed)
      }
      origClose.call(this);
    };
    ctrl.error = function(e) {
      origError.call(this, e);
      try { nativeCtrl.error(e); } catch {}
    };

    // Proxy byobRequest from native byte controller (own property, not on prototype)
    // Return null (not undefined) when no BYOB read is pending, per spec
    Object.defineProperty(ctrl, 'byobRequest', {
      get() { return nativeCtrl.byobRequest || null; },
      configurable: true,
    });
  }

  fastReadable[kMaterialized] = native;
  return native;
}

function materializeWritable(fastWritable) {
  if (fastWritable[kMaterialized]) return fastWritable[kMaterialized];
  utils_stats.tier2_materializeWritable++;

  const nodeWritable = fastWritable[kNodeWritable];
  if (!nodeWritable) {
    throw new Error('Cannot materialize: no Node writable');
  }

  const native = external_node_stream_namespaceObject.Writable.toWeb(nodeWritable);
  fastWritable[kMaterialized] = native;
  return native;
}

;// CONCATENATED MODULE: ../../node_modules/.pnpm/experimental-fast-webstreams@0.0.18/node_modules/experimental-fast-webstreams/src/byob-reader.js
/**
 * FastReadableStreamBYOBReader — wraps native ReadableStreamBYOBReader
 * to accept FastReadableStream instances (materializes to native first).
 *
 * For fast byte streams: uses a standalone BYOB reader with pull-into
 * descriptors when there's NO pull callback (React Flight pattern).
 * For byte streams WITH pull: delegates to native via materializeReadableAsBytes.
 */






// Get the native BYOB reader constructor
const NativeBYOBReader = new NativeReadableStream({ type: 'bytes' }).getReader({ mode: 'byob' }).constructor;

/**
 * BYOB reader that accepts both native ReadableStream and FastReadableStream.
 * For FastReadableStream byte streams without pull: standalone implementation.
 * For FastReadableStream byte streams with pull: materializes to native.
 * For other streams: delegates to native.
 */
class FastReadableStreamBYOBReader {
  // Standalone BYOB reader state
  #stream = null;
  #closedPromise = null;
  #closedResolve = null;
  #closedReject = null;
  #closedSettled = false;
  #released = false;
  #pendingReads = [];
  #isStandalone = false;

  // Native delegate
  #nativeReader = null;

  constructor(stream) {
    if (isFastReadable(stream) && stream._isByteStream && !stream[kNativeOnly]) {
      // Fast byte stream (with or without pull): use standalone BYOB reader
      // This avoids native delegation issues (timing, data ownership, error swallowing)
      this.#isStandalone = true;
      if (stream[kLock]) {
        throw new TypeError('Cannot construct a ReadableStreamBYOBReader for a locked ReadableStream');
      }
      this.#stream = stream;
      stream[kLock] = this;

      this.#closedPromise = new Promise((resolve, reject) => {
        this.#closedResolve = resolve;
        this.#closedReject = reject;
      });

      if (stream._errored) {
        this.#settleClose(false, stream._storedError);
      } else if (stream._closed) {
        this.#settleClose(true);
      } else {
        const nodeReadable = stream[kNodeReadable];
        if (nodeReadable.destroyed) {
          if (nodeReadable.errored) {
            this.#settleClose(false, unwrapError(nodeReadable.errored));
          } else {
            this.#settleClose(true);
          }
        } else if (nodeReadable.readableEnded) {
          this.#settleClose(true);
        } else {
          const onEnd = () => { cleanup(); stream._closed = true; this.#settleClose(true); };
          const onError = (err) => {
            cleanup();
            if (stream._errored) this.#settleClose(false, stream._storedError);
            else this.#settleClose(false, unwrapError(err));
          };
          const onClose = () => {
            cleanup();
            if (stream._errored) this.#settleClose(false, stream._storedError);
            else if (nodeReadable.errored) this.#settleClose(false, unwrapError(nodeReadable.errored));
            else { stream._closed = true; this.#settleClose(true); }
          };
          const cleanup = () => {
            nodeReadable.removeListener('end', onEnd);
            nodeReadable.removeListener('error', onError);
            nodeReadable.removeListener('close', onClose);
          };
          nodeReadable.on('end', onEnd);
          nodeReadable.on('error', onError);
          nodeReadable.on('close', onClose);
        }
      }
    } else if (isFastReadable(stream)) {
      this.#nativeReader = new NativeBYOBReader(materialize_materializeReadable(stream));
      this.#stream = stream;
    } else {
      this.#nativeReader = new NativeBYOBReader(stream);
      this.#stream = stream;
    }
  }

  #settleClose(success, err) {
    if (this.#closedSettled || this.#released) return;
    this.#closedSettled = true;
    if (success) this.#closedResolve(undefined);
    else { this.#closedReject(err); this.#closedPromise.catch(noop); }
  }

  read(view, options) {
    if (this.#nativeReader) return this.#nativeReader.read(view, options);
    if (this.#released) return Promise.reject(new TypeError('Reader has been released'));

    const stream = this.#stream;

    // Validate view
    if (!ArrayBuffer.isView(view)) {
      return Promise.reject(new TypeError('view must be a TypedArray or DataView'));
    }
    if (view.byteLength === 0) {
      return Promise.reject(new TypeError('view must have non-zero byteLength'));
    }
    if (view.buffer.byteLength === 0) {
      return Promise.reject(new TypeError('view must reference a non-zero-length buffer'));
    }
    if (view.buffer.detached) {
      return Promise.reject(new TypeError('view references a detached ArrayBuffer'));
    }
    const elementSize = view.BYTES_PER_ELEMENT || 1;
    const isDataView = view.constructor === DataView;
    const viewConstructor = isDataView ? DataView : view.constructor;

    // Parse min option
    let minimumFill = elementSize;
    if (options && options.min !== undefined) {
      const min = Number(options.min);
      if (min <= 0 || !Number.isInteger(min)) {
        return Promise.reject(new TypeError('min must be a positive integer'));
      }
      if (min > view.byteLength / elementSize) {
        return Promise.reject(new RangeError('min must not exceed view length'));
      }
      minimumFill = min * elementSize;
    }

    if (stream._errored) return Promise.reject(stream._storedError);

    // Save view dimensions BEFORE transfer (transfer detaches original, zeroing these)
    const viewByteOffset = view.byteOffset;
    const viewByteLength = view.byteLength;

    // Transfer buffer per spec (detaches caller's view)
    // Non-transferable buffers (e.g., WebAssembly.Memory) throw TypeError
    let bufferCopy;
    try {
      bufferCopy = view.buffer.transfer();
    } catch {
      return Promise.reject(new TypeError('Cannot read into a non-transferable buffer'));
    }

    const descriptor = {
      buffer: bufferCopy,
      byteOffset: viewByteOffset,
      byteLength: viewByteLength,
      bytesFilled: 0,
      minimumFill,
      elementSize,
      viewConstructor,
      _resolve: null,
      _reject: null,
    };

    const controller = stream._controller;

    // Try sync fill from LiteReadable buffer
    if (controller[kTrySyncFillPullInto](descriptor)) {
      const filledView = new viewConstructor(descriptor.buffer, descriptor.byteOffset,
        descriptor.bytesFilled / elementSize);
      return Promise.resolve({ value: filledView, done: false });
    }

    // Check if stream closed/ended after sync fill attempt
    const nodeReadable = stream[kNodeReadable];
    const isEnded = stream._closed || nodeReadable.readableEnded ||
      (nodeReadable._ended && nodeReadable.readableLength === 0);

    // Handle partial fill with element-size remainder:
    // If we have enough bytes for at least one element but have a non-aligned remainder,
    // commit the aligned portion and re-enqueue the remainder
    if (descriptor.bytesFilled >= elementSize && descriptor.bytesFilled % elementSize !== 0) {
      const remainderSize = descriptor.bytesFilled % elementSize;
      const alignedFill = descriptor.bytesFilled - remainderSize;

      // On ended streams: if aligned portion doesn't meet minimumFill, error
      if (isEnded && alignedFill < minimumFill) {
        const e = new TypeError('Insufficient bytes to fill elements in the given buffer');
        if (!stream._errored) {
          stream._storedError = e;
          stream._errored = true;
          this.#settleClose(false, e);
          if (nodeReadable && !nodeReadable.destroyed) nodeReadable.destroy(e);
        }
        return Promise.reject(e);
      }

      // Re-enqueue the remainder bytes
      const remainder = new Uint8Array(descriptor.buffer.slice(
        descriptor.byteOffset + descriptor.bytesFilled - remainderSize,
        descriptor.byteOffset + descriptor.bytesFilled));
      controller[kEnqueueRemainder](remainder);
      // Align bytesFilled
      descriptor.bytesFilled = alignedFill;
      const filledView = new viewConstructor(descriptor.buffer, descriptor.byteOffset,
        descriptor.bytesFilled / elementSize);
      return Promise.resolve({ value: filledView, done: false });
    }

    if (isEnded) {
      if (descriptor.bytesFilled === 0) {
        // Per spec: return empty view of the requested type (not undefined)
        const emptyView = new viewConstructor(descriptor.buffer, descriptor.byteOffset, 0);
        return Promise.resolve({ value: emptyView, done: true });
      }
      if (descriptor.bytesFilled % elementSize !== 0) {
        const e = new TypeError('Insufficient bytes to fill elements in the given buffer');
        // Error the stream directly (controller.error may be no-op if controller already closed)
        if (!stream._errored) {
          stream._storedError = e;
          stream._errored = true;
          // Settle reader's closed promise with error
          this.#settleClose(false, e);
          // Destroy the node readable
          const nr = stream[kNodeReadable];
          if (nr && !nr.destroyed) nr.destroy(e);
        }
        return Promise.reject(e);
      }
      const filledView = new viewConstructor(descriptor.buffer, descriptor.byteOffset,
        descriptor.bytesFilled / elementSize);
      return Promise.resolve({ value: filledView, done: true });
    }

    // Not enough data — add descriptor to controller and wait for pull/enqueue
    return new Promise((resolve, reject) => {
      descriptor._resolve = resolve;
      descriptor._reject = reject;
      this.#pendingReads.push(descriptor);
      controller[kAddPendingPullInto](descriptor);

      // Trigger pull synchronously — spec requires pull to fire immediately
      // when a BYOB read is added with empty buffer. The respond() method's
      // re-pull is deferred (queueMicrotask) to prevent recursion.
      if (stream._pullFn && !stream._pullLock) {
        const nr = stream[kNodeReadable];
        if (nr && !nr.destroyed && nr._onRead && !nr._readableState.ended) {
          nr._readableState.reading = false;
          nr.read(0);
        }
      }
    });
  }

  cancel(reason) {
    if (this.#nativeReader) return this.#nativeReader.cancel(reason);
    if (this.#released) return Promise.reject(new TypeError('Reader has been released'));
    return this.#stream._cancelInternal(reason);
  }

  releaseLock() {
    if (this.#nativeReader) {
      this.#nativeReader.releaseLock();
      return;
    }
    if (!this.#stream || this.#released) return;
    this.#released = true;
    const stream = this.#stream;

    // Reject all pending BYOB reads but keep descriptors on controller
    if (this.#pendingReads.length > 0) {
      const releasedError = new TypeError('Reader was released');
      for (const d of this.#pendingReads) {
        if (d._reject) d._reject(releasedError);
      }
      stream._controller[kReleasePullIntoReads]();
      this.#pendingReads = [];
    }

    // Settle closed promise
    if (!this.#closedSettled) {
      const releasedError = new TypeError('Reader was released');
      if (stream._closed) {
        this.#closedResolve(undefined);
        this.#closedSettled = true;
        this.#closedPromise = Promise.reject(releasedError);
        this.#closedPromise.catch(noop);
      } else if (stream._errored) {
        this.#closedReject(stream._storedError);
        this.#closedPromise.catch(noop);
        this.#closedSettled = true;
        this.#closedPromise = Promise.reject(releasedError);
        this.#closedPromise.catch(noop);
      } else {
        this.#closedReject(releasedError);
        this.#closedPromise.catch(noop);
        this.#closedSettled = true;
      }
    } else {
      const releasedError = new TypeError('Reader was released');
      this.#closedPromise = Promise.reject(releasedError);
      this.#closedPromise.catch(noop);
    }

    stream[kLock] = null;
  }

  _settleClosedFromError(error) {
    if (this.#nativeReader) return;
    if (!this.#closedSettled && !this.#released) {
      this.#closedSettled = true;
      this.#closedReject(error);
      this.#closedPromise.catch(noop);
    }
  }

  _errorReadRequests(error) {
    if (this.#nativeReader) return;
    this.#pendingReads = [];
  }

  _pendingReadCount() {
    return this.#pendingReads.length;
  }

  _resolveClosedFromCancel() {
    if (this.#nativeReader) return;
    if (!this.#closedSettled && !this.#released) {
      this.#closedResolve(undefined);
      this.#closedSettled = true;
    }
  }

  get closed() {
    if (this.#nativeReader) return this.#nativeReader.closed;
    return this.#closedPromise;
  }
}

;// CONCATENATED MODULE: external "node:stream/promises"
const promises_namespaceObject = require("node:stream/promises");
;// CONCATENATED MODULE: ../../node_modules/.pnpm/experimental-fast-webstreams@0.0.18/node_modules/experimental-fast-webstreams/src/writer.js
/**
 * FastWritableStreamDefaultWriter
 * Bridges writer.write() to the writable state machine.
 */




class FastWritableStreamDefaultWriter {
  #stream;
  #closedPromise;
  #closedResolve;
  #closedReject;
  #closedSettled = false;
  #readyPromise;
  #readyResolve;
  #readyReject;
  #readySettled = false;
  #released = false;

  constructor(stream) {
    // Brand check: must be a FastWritableStream
    if (!isFastWritable(stream)) {
      throw new TypeError('Illegal constructor');
    }
    if (stream[kLock]) {
      throw new TypeError('WritableStream is already locked');
    }
    this.#stream = stream;
    stream[kLock] = this;

    // Set up closed promise
    this.#closedPromise = new Promise((resolve, reject) => {
      this.#closedResolve = resolve;
      this.#closedReject = reject;
    });

    const state = stream[kWritableState];

    if (state === 'writable') {
      // Per spec: ready reflects backpressure only, NOT start status.
      // Ready is resolved unless there's backpressure (desiredSize <= 0).
      if (!_defaultWriterReadyPromiseIsSettled(stream)) {
        this.#readyPromise = new Promise((resolve, reject) => {
          this.#readyResolve = resolve;
          this.#readyReject = reject;
        });
        this.#readySettled = false;
      } else {
        this.#readyPromise = RESOLVED_UNDEFINED;
        this.#readySettled = true;
        this.#readyResolve = null;
        this.#readyReject = null;
      }
    } else if (state === 'erroring') {
      this.#readyPromise = Promise.reject(stream[kStoredError]);
      this.#readyPromise.catch(noop);
      this.#readySettled = true;
      this.#readyResolve = null;
      this.#readyReject = null;
    } else if (state === 'closed') {
      this.#readyPromise = RESOLVED_UNDEFINED;
      this.#readySettled = true;
      this.#readyResolve = null;
      this.#readyReject = null;
      this.#closedResolve(undefined);
      this.#closedSettled = true;
    } else if (state === 'errored') {
      const storedError = stream[kStoredError];
      this.#readyPromise = Promise.reject(storedError);
      this.#readyPromise.catch(noop);
      this.#readySettled = true;
      this.#readyResolve = null;
      this.#readyReject = null;
      this.#closedReject(storedError);
      this.#closedPromise.catch(noop);
      this.#closedSettled = true;
    }
  }

  write(chunk) {
    if (this.#released) {
      return Promise.reject(new TypeError('Writer has been released'));
    }
    return _writeInternal(this.#stream, chunk);
  }

  close() {
    if (this.#released) {
      return Promise.reject(new TypeError('Writer has been released'));
    }
    const stream = this.#stream;
    return _closeFromWriter(stream);
  }

  abort(reason) {
    if (this.#released) {
      return Promise.reject(new TypeError('Writer has been released'));
    }
    return _abortInternal(this.#stream, reason);
  }

  releaseLock() {
    if (!this.#stream) return;
    if (!this.#released) {
      this.#released = true;
      const stream = this.#stream;

      if (!this.#closedSettled) {
        const typeError = new TypeError('Writer was released');

        // Reject ready FIRST (so ready handlers fire before closed handlers)
        if (!this.#readySettled) {
          this.#readyReject(typeError);
          this.#readyPromise.catch(noop);
          this.#readySettled = true;
        } else {
          this.#readyPromise = Promise.reject(typeError);
          this.#readyPromise.catch(noop);
        }

        // Then reject closed
        this.#closedReject(typeError);
        this.#closedPromise.catch(noop);
        this.#closedSettled = true;
      } else {
        const typeError = new TypeError('Writer was released');
        this.#readyPromise = Promise.reject(typeError);
        this.#readyPromise.catch(noop);
        this.#closedPromise = Promise.reject(typeError);
        this.#closedPromise.catch(noop);
      }

      stream[kLock] = null;
    }
  }

  get closed() {
    return this.#closedPromise;
  }

  get ready() {
    return this.#readyPromise;
  }

  get desiredSize() {
    if (this.#released) {
      throw new TypeError('Cannot get desiredSize of a released writer');
    }
    return _getDesiredSize(this.#stream);
  }

  // --- Internal methods called by the stream state machine ---

  /**
   * Reject the ready promise if it's pending (called on transition to erroring).
   */
  _rejectReadyIfPending(reason) {
    if (!this.#readySettled && this.#readyReject) {
      this.#readyReject(reason);
      this.#readyPromise.catch(noop);
      this.#readySettled = true;
      this.#readyResolve = null;
      this.#readyReject = null;
    } else if (this.#readySettled) {
      // Replace with a new rejected promise
      this.#readyPromise = Promise.reject(reason);
      this.#readyPromise.catch(noop);
    }
  }

  /**
   * Resolve the ready promise (called when close is requested or backpressure relieved).
   */
  _resolveReady() {
    if (!this.#readySettled && this.#readyResolve) {
      this.#readyResolve(undefined);
      this.#readySettled = true;
      this.#readyResolve = null;
      this.#readyReject = null;
    }
  }

  /**
   * Reject the closed promise (called when stream transitions to errored).
   */
  _rejectClosed(error) {
    if (this.#released) return;
    if (!this.#closedSettled) {
      this.#closedReject(error);
      this.#closedPromise.catch(noop);
      this.#closedSettled = true;
    }
  }

  /**
   * Reject the ready promise unconditionally (e.g., on close error).
   */
  _rejectReady(error) {
    if (this.#released) return;
    if (!this.#readySettled && this.#readyReject) {
      this.#readyReject(error);
      this.#readyPromise.catch(noop);
      this.#readySettled = true;
      this.#readyResolve = null;
      this.#readyReject = null;
    } else {
      this.#readyPromise = Promise.reject(error);
      this.#readyPromise.catch(noop);
      this.#readySettled = true;
    }
  }

  /**
   * Resolve the closed promise (called when stream transitions to closed).
   */
  _resolveClosed() {
    if (this.#released) return;
    if (!this.#closedSettled) {
      this.#closedResolve(undefined);
      this.#closedSettled = true;
    }
  }

  /**
   * Update the ready promise based on backpressure.
   * If there's backpressure, ready should be pending. Otherwise resolved.
   */
  _updateReadyForBackpressure(stream) {
    if (this.#released) return;
    const desiredSize = _getDesiredSize(stream);
    if (desiredSize !== null && desiredSize <= 0) {
      // Backpressure — make ready pending if currently settled
      if (this.#readySettled) {
        this.#readyPromise = new Promise((resolve, reject) => {
          this.#readyResolve = resolve;
          this.#readyReject = reject;
        });
        this.#readySettled = false;
      }
    } else {
      // No backpressure — resolve ready if pending
      if (!this.#readySettled && this.#readyResolve) {
        this.#readyResolve(undefined);
        this.#readySettled = true;
        this.#readyResolve = null;
        this.#readyReject = null;
      } else if (!this.#readySettled) {
        this.#readyPromise = RESOLVED_UNDEFINED;
        this.#readySettled = true;
      }
    }
  }

  /**
   * Set ready to a new pending promise (backpressure from Node write returning false).
   */
  _setReadyPending(stream) {
    if (this.#released) return;
    if (this.#readySettled) {
      this.#readyPromise = new Promise((resolve, reject) => {
        this.#readyResolve = resolve;
        this.#readyReject = reject;
      });
      this.#readySettled = false;

      // Listen for drain to resolve it
      const nodeWritable = stream[kNodeWritable];
      nodeWritable.once('drain', () => {
        if (!this.#released && !this.#readySettled) {
          this.#readyResolve(undefined);
          this.#readySettled = true;
          this.#readyResolve = null;
          this.#readyReject = null;
        }
      });
    }
  }
}

/**
 * Check if the writer's ready promise should be initially settled.
 * Ready should be pending if the stream hasn't started or if there's backpressure.
 */
function _defaultWriterReadyPromiseIsSettled(stream) {
  // Per spec: ready reflects backpressure only (not start status)
  const desiredSize = _getDesiredSize(stream);
  return desiredSize !== null && desiredSize > 0;
}

;// CONCATENATED MODULE: ../../node_modules/.pnpm/experimental-fast-webstreams@0.0.18/node_modules/experimental-fast-webstreams/src/writable.js
/**
 * FastWritableStream — WHATWG WritableStream API backed by Node.js Writable.
 *
 * Implements the full writable → erroring → errored state machine per spec.
 */








const kPendingAbortRequest = Symbol('kPendingAbortRequest');
const kInFlightWriteRequest = Symbol('kInFlightWriteRequest');
const kInFlightCloseRequest = Symbol('kInFlightCloseRequest');
const kWriteRequests = Symbol('kWriteRequests');
const kCloseRequest = Symbol('kCloseRequest');
const kStarted = Symbol('kStarted');

class FastWritableStream {
  constructor(underlyingSink = {}, strategy) {
    if (underlyingSink === null) {
      underlyingSink = {};
    }

    // Access strategy FIRST per spec
    let strategySize, strategyHWM;
    if (strategy != null && typeof strategy === 'object') {
      strategySize = strategy.size;
      strategyHWM = strategy.highWaterMark;
    }

    const write = underlyingSink.write;
    const close = underlyingSink.close;
    const abort = underlyingSink.abort;
    const start = underlyingSink.start;
    const type = underlyingSink.type;

    if (type !== undefined) {
      throw new RangeError(`Invalid type: ${type}`);
    }

    if (write !== undefined && typeof write !== 'function') {
      throw new TypeError('write must be a function');
    }
    if (close !== undefined && typeof close !== 'function') {
      throw new TypeError('close must be a function');
    }
    if (abort !== undefined && typeof abort !== 'function') {
      throw new TypeError('abort must be a function');
    }
    if (start !== undefined && typeof start !== 'function') {
      throw new TypeError('start must be a function');
    }

    if (strategySize !== undefined && typeof strategySize !== 'function') {
      throw new TypeError('size must be a function');
    }

    // If strategy has a custom size(), delegate to native
    if (typeof strategySize === 'function') {
      const native = new NativeWritableStream(underlyingSink, strategy);
      _initNativeWritableShell(this, native);
      return;
    }

    let hwm = 1;
    if (strategyHWM !== undefined) {
      hwm = Number(strategyHWM);
      if (Number.isNaN(hwm) || hwm < 0) {
        throw new RangeError('Invalid highWaterMark');
      }
    }

    // --- State machine ---
    utils_stats.writableCreated++;
    this[kWritableState] = 'writable';
    this[kStoredError] = undefined;
    this[kPendingAbortRequest] = null;
    this[kInFlightWriteRequest] = null;
    this[kInFlightCloseRequest] = null;
    this[kWriteRequests] = [];
    this[kCloseRequest] = null;
    this[kStarted] = false;

    const self = this;
    let controller;

    const nodeWritable = new external_node_stream_namespaceObject.Writable({
      objectMode: true,
      highWaterMark: hwm === Infinity ? 0x7fffffff : hwm,
      write(chunk, encoding, callback) {
        if (!write) {
          callback();
          return;
        }
        try {
          const result = Reflect.apply(write, underlyingSink, [chunk, controller]);
          if (isThenable(result)) {
            result.then(
              () => callback(),
              (err) => {
                // Wrap falsy errors so Node treats rejection as error (not success)
                if (err == null || err === false || err === 0 || err === '') {
                  const wrapped = new Error('write rejected');
                  wrapped[kWrappedError] = err;
                  callback(wrapped);
                } else {
                  callback(err);
                }
              },
            );
          } else {
            callback();
          }
        } catch (e) {
          callback(e);
        }
      },
      final(callback) {
        if (!close) {
          callback();
          return;
        }
        try {
          const result = Reflect.apply(close, underlyingSink, []);
          if (isThenable(result)) {
            result.then(
              () => callback(),
              (err) => {
                if (err == null || err === false || err === 0 || err === '') {
                  const wrapped = new Error('close rejected');
                  wrapped[kWrappedError] = err;
                  callback(wrapped);
                } else {
                  callback(err);
                }
              },
            );
          } else {
            callback();
          }
        } catch (e) {
          callback(e);
        }
      },
      destroy(err, callback) {
        callback(err);
      },
    });

    // Prevent unhandled 'error' events from crashing
    nodeWritable.on('error', noop);

    controller = new FastWritableStreamDefaultController(nodeWritable, self, _controllerError, kControllerBrand);

    this[kNodeWritable] = nodeWritable;
    this[kLock] = null;
    this[kMaterialized] = null;
    this[kNativeOnly] = false;
    this._controller = controller;
    this._underlyingSink = underlyingSink;
    this._sinkAbort = abort || null;
    this._sinkWrite = write || null;
    this._sinkClose = close || null;
    this._hwm = hwm;
    this._isTransformShell = false;
    // Pre-declare transform-shell properties so normal + transform paths share
    // the same property set, reducing V8 polymorphism in hot functions.
    this._origTransform = null;
    this._transformWriteCallback = null;
    this._transformReadable = null;
    this._transformStream = null;
    this._transformBackpressure = false;
    this._transformBackpressureResolve = null;

    // Start
    let startResult;
    if (start) {
      startResult = Reflect.apply(start, underlyingSink, [controller]);
    }

    // Per spec: even for sync start, kStarted is set via a microtask.
    if (isThenable(startResult)) {
      this._startPromise = startResult;
      startResult.then(
        () => {
          self[kStarted] = true;
          self._startPromise = null;
          _advanceQueueIfNeeded(self);
        },
        (err) => {
          self[kStarted] = true;
          self._startPromise = null;
          _dealWithRejection(self, err);
        },
      );
    } else {
      // Sync start — use queueMicrotask instead of Promise.resolve().then()
      this._startPromise = null;
      queueMicrotask(() => {
        self[kStarted] = true;
        _advanceQueueIfNeeded(self);
      });
    }
  }

  getWriter() {
    if (this[kNativeOnly]) {
      return materializeWritable(this).getWriter();
    }
    return new FastWritableStreamDefaultWriter(this);
  }

  abort(reason) {
    if (this[kLock]) {
      return Promise.reject(new TypeError('WritableStream is locked'));
    }
    return _abortInternal(this, reason);
  }

  _abortInternal(reason) {
    return _abortInternal(this, reason);
  }

  close() {
    if (this[kLock]) {
      return Promise.reject(new TypeError('WritableStream is locked'));
    }
    if (this[kNativeOnly]) {
      return materializeWritable(this).close();
    }
    if (!_isCloseAllowed(this)) {
      return Promise.reject(new TypeError('Cannot close stream'));
    }
    return _closeInternal(this);
  }

  get locked() {
    return this[kLock] !== null;
  }
}

// --- Internal algorithms ---

function _isCloseAllowed(stream) {
  const state = stream[kWritableState];
  if (state === 'closed' || state === 'errored') return false;
  if (stream[kCloseRequest] || stream[kInFlightCloseRequest]) return false;
  return true;
}

function _closeInternal(stream) {
  return new Promise((resolve, reject) => {
    stream[kCloseRequest] = { resolve, reject };
    // Per spec: only resolve ready if state is 'writable' (not erroring)
    const writer = stream[kLock];
    if (writer && writer._resolveReady && stream[kWritableState] === 'writable') {
      writer._resolveReady();
    }
    _advanceQueueIfNeeded(stream);
  });
}

function _abortInternal(stream, reason) {
  if (stream[kNativeOnly]) {
    return materializeWritable(stream).abort(reason);
  }

  let state = stream[kWritableState];

  // If already closed or errored, no-op
  if (state === 'closed' || state === 'errored') {
    return RESOLVED_UNDEFINED;
  }

  // Abort the controller's signal synchronously (spec requirement)
  if (stream._controller && stream._controller._abortSignal) {
    stream._controller._abortSignal(reason);
  }

  // Re-read state: the signal handler may have triggered a recursive abort
  // that ran to completion (e.g., errored the stream). Using the stale local
  // `state` would create an orphaned kPendingAbortRequest that never settles.
  state = stream[kWritableState];
  if (state === 'closed' || state === 'errored') {
    return RESOLVED_UNDEFINED;
  }

  // If already erroring, store abort without calling sink.abort()
  if (state === 'erroring') {
    if (stream[kPendingAbortRequest]) {
      return stream[kPendingAbortRequest].promise;
    }
    const p = {};
    p.promise = new Promise((resolve, reject) => {
      p.resolve = resolve;
      p.reject = reject;
    });
    p.reason = reason;
    p.wasAlreadyErroring = true;
    stream[kPendingAbortRequest] = p;
    return p.promise;
  }

  // If there's already a pending abort (from writable state), return same promise
  if (stream[kPendingAbortRequest]) {
    return stream[kPendingAbortRequest].promise;
  }

  const p = {};
  p.promise = new Promise((resolve, reject) => {
    p.resolve = resolve;
    p.reject = reject;
  });
  p.reason = reason;
  p.wasAlreadyErroring = false;
  stream[kPendingAbortRequest] = p;

  // Transition to erroring
  _startErroring(stream, reason);

  return p.promise;
}

function _startErroring(stream, reason) {
  const state = stream[kWritableState];
  if (state !== 'writable') return;

  stream[kWritableState] = 'erroring';
  stream[kStoredError] = reason;

  // Reject ready promise for writer
  const writer = stream[kLock];
  if (writer) {
    writer._rejectReadyIfPending(reason);
  }

  // If no in-flight operations and stream is started, finish erroring
  if (!_hasOperationMarkedInFlight(stream) && stream[kStarted]) {
    _finishErroring(stream);
  }
}

function _hasOperationMarkedInFlight(stream) {
  return stream[kInFlightWriteRequest] !== null || stream[kInFlightCloseRequest] !== null;
}

function _finishErroring(stream) {
  stream[kWritableState] = 'errored';
  const storedError = stream[kStoredError];

  // For transform shells, destroy the node stream to propagate error to readable side
  if (stream._isTransformShell && stream[kNodeWritable] && !stream[kNodeWritable].destroyed) {
    stream[kNodeWritable].destroy(
      storedError instanceof Error
        ? storedError
        : storedError != null
          ? Object.assign(new Error('abort'), { [kWrappedError]: storedError })
          : new Error('aborted'),
    );
  }

  // Reject all queued writes
  const writeRequests = stream[kWriteRequests];
  stream[kWriteRequests] = [];
  for (const req of writeRequests) {
    req.reject(storedError);
  }

  const abortRequest = stream[kPendingAbortRequest];
  if (!abortRequest) {
    // No abort — reject close and closed immediately
    _rejectCloseAndClosedPromiseIfNeeded(stream, storedError);
    return;
  }

  stream[kPendingAbortRequest] = null;

  if (abortRequest.wasAlreadyErroring) {
    abortRequest.reject(storedError);
    _rejectCloseAndClosedPromiseIfNeeded(stream, storedError);
    return;
  }

  // Call underlying sink abort
  const sinkAbort = stream._sinkAbort;
  if (!sinkAbort) {
    abortRequest.resolve();
    _rejectCloseAndClosedPromiseIfNeeded(stream, storedError);
    return;
  }

  try {
    const result = Reflect.apply(sinkAbort, stream._underlyingSink, [abortRequest.reason]);
    if (isThenable(result)) {
      result.then(
        () => {
          abortRequest.resolve();
          _rejectCloseAndClosedPromiseIfNeeded(stream, storedError);
        },
        (e) => {
          abortRequest.reject(e);
          _rejectCloseAndClosedPromiseIfNeeded(stream, storedError);
        },
      );
    } else {
      abortRequest.resolve();
      _rejectCloseAndClosedPromiseIfNeeded(stream, storedError);
    }
  } catch (e) {
    abortRequest.reject(e);
    _rejectCloseAndClosedPromiseIfNeeded(stream, storedError);
  }
}

/**
 * Per spec: WritableStreamRejectCloseAndClosedPromiseIfNeeded
 * Reject close request and writer.closed AFTER abort handling.
 */
function _rejectCloseAndClosedPromiseIfNeeded(stream, storedError) {
  if (stream[kCloseRequest]) {
    stream[kCloseRequest].reject(storedError);
    stream[kCloseRequest] = null;
  }
  const writer = stream[kLock];
  if (writer) {
    writer._rejectClosed(storedError);
  }
}

function _advanceQueueIfNeeded(stream) {
  if (!stream[kStarted]) return;
  const state = stream[kWritableState];
  if (state === 'errored' || state === 'closed') return;
  if (state === 'erroring') {
    // Per spec: only finish erroring when no in-flight operations
    if (!_hasOperationMarkedInFlight(stream)) {
      _finishErroring(stream);
    }
    return;
  }

  // When start just completed, resolve the writer's ready if no backpressure
  const writer = stream[kLock];
  if (writer) {
    writer._updateReadyForBackpressure(stream);
  }

  // If close request and no writes pending and no in-flight write
  if (stream[kWriteRequests].length === 0 && stream[kCloseRequest] && !stream[kInFlightWriteRequest]) {
    _processClose(stream);
    return;
  }

  // Process next write
  if (stream[kWriteRequests].length > 0 && !stream[kInFlightWriteRequest]) {
    _processWrite(stream);
  }
}

function _processWrite(stream) {
  const writeRequest = stream[kWriteRequests].shift();
  stream[kInFlightWriteRequest] = writeRequest;

  const chunk = writeRequest.chunk;

  // For transform shells, the write callback from Node may not fire reliably
  // due to readable-side backpressure. Use a different approach.
  if (stream._isTransformShell) {
    const nodeWritable = stream[kNodeWritable];
    _processWriteTransform(stream, writeRequest, nodeWritable, chunk);
    return;
  }

  // Direct sink path: bypass Node Writable for queued writes too
  const sinkWrite = stream._sinkWrite;
  if (sinkWrite) {
    try {
      const result = Reflect.apply(sinkWrite, stream._underlyingSink, [chunk, stream._controller]);
      if (isThenable(result)) {
        result.then(
          () => {
            stream[kInFlightWriteRequest] = null;
            writeRequest.resolve(undefined);
            const writer = stream[kLock];
            if (writer && stream[kWritableState] === 'writable') {
              writer._updateReadyForBackpressure(stream);
            }
            _advanceQueueIfNeeded(stream);
          },
          (err) => {
            stream[kInFlightWriteRequest] = null;
            writeRequest.reject(err);
            _handleWriteError(stream, err);
          },
        );
      } else {
        // Sync sink — resolve via microtask (matches fast path timing)
        queueMicrotask(() => {
          stream[kInFlightWriteRequest] = null;
          writeRequest.resolve(undefined);
          const writer = stream[kLock];
          if (writer && stream[kWritableState] === 'writable') {
            writer._updateReadyForBackpressure(stream);
          }
          _advanceQueueIfNeeded(stream);
        });
      }
    } catch (err) {
      stream[kInFlightWriteRequest] = null;
      writeRequest.reject(err);
      _handleWriteError(stream, err);
    }
    return;
  }

  // No sink write (default no-op) — go through Node Writable
  const nodeWritable = stream[kNodeWritable];
  const ok = nodeWritable.write(chunk, (err) => {
    stream[kInFlightWriteRequest] = null;
    if (err) {
      const unwrapped = unwrapError(err);
      writeRequest.reject(unwrapped);
      _handleWriteError(stream, unwrapped);
    } else {
      writeRequest.resolve(undefined);
      const writer = stream[kLock];
      if (writer && stream[kWritableState] === 'writable') {
        writer._updateReadyForBackpressure(stream);
      }
      _advanceQueueIfNeeded(stream);
    }
  });

  // If Node buffer is full, update ready promise for backpressure
  if (!ok) {
    const writer = stream[kLock];
    if (writer && stream[kWritableState] === 'writable') {
      writer._setReadyPending(stream);
    }
  }
}

/**
 * Write processing for transform shells. Since Node Transform's write() callback
 * can be delayed by readable-side backpressure, we use the internal _write mechanism.
 */
function _processWriteTransform(stream, writeRequest, nodeWritable, chunk) {
  // Per WHATWG spec: TransformStreamDefaultSinkWriteAlgorithm
  // If backpressure is true (readable desiredSize <= 0 and no pending reads),
  // defer transform until readable side is drained.
  if (stream._transformBackpressure) {
    // Wait for backpressure to be released (by a read consuming data)
    stream._transformBackpressureResolve = () => {
      stream._transformBackpressureResolve = null;
      // Re-check: stream may have errored while waiting
      if (stream[kWritableState] === 'erroring' || stream[kWritableState] === 'errored') {
        stream[kInFlightWriteRequest] = null;
        writeRequest.reject(stream[kStoredError]);
        if (stream[kWritableState] === 'erroring') _finishErroring(stream);
        return;
      }
      _doTransformWrite(stream, writeRequest, nodeWritable, chunk);
    };
    return;
  }

  _doTransformWrite(stream, writeRequest, nodeWritable, chunk);
}

function _doTransformWrite(stream, writeRequest, nodeWritable, chunk) {
  // Use callback slot pattern instead of swapping _transform on every write.
  // This keeps the Node Transform's hidden class stable for V8 optimization.
  stream._transformWriteCallback = (err, data, cb) => {
    stream._transformWriteCallback = null;

    const ts = stream._transformStream;
    if (ts) ts._inTransformCallback = true;

    // Call original transform, preserving the data argument
    stream._origTransform.call(nodeWritable, chunk, 'utf8', (transformErr, transformData) => {
      if (ts) ts._inTransformCallback = false;
      cb(transformErr, transformData);

      // Deferred state machine update (must happen BEFORE flush, which Node defers to nextTick)
      queueMicrotask(() => {
        stream[kInFlightWriteRequest] = null;
        if (transformErr) {
          const unwrapped = unwrapError(transformErr);
          writeRequest.reject(unwrapped);
          _handleWriteError(stream, unwrapped);
          if (stream._transformReadable) {
            _errorReadableSide(stream._transformReadable(), unwrapped);
          }
        } else {
          writeRequest.resolve(undefined);
          const writer = stream[kLock];
          if (writer && stream[kWritableState] === 'writable') {
            writer._updateReadyForBackpressure(stream);
          }
          _advanceQueueIfNeeded(stream);
        }
      });
    });
  };

  nodeWritable.write(chunk);
}

function _handleWriteError(stream, error) {
  const state = stream[kWritableState];
  if (state === 'writable') {
    _startErroring(stream, error);
  } else if (state === 'erroring') {
    _finishErroring(stream);
  }
}

function _processClose(stream) {
  const closeRequest = stream[kCloseRequest];
  stream[kCloseRequest] = null;
  stream[kInFlightCloseRequest] = closeRequest;

  const nodeWritable = stream[kNodeWritable];

  // For transform shells, call flush directly instead of nodeWritable.end().
  // Node Transform's end() blocks on readable-side backpressure, but the spec
  // says close should complete once flush is done regardless of readable consumption.
  if (stream._isTransformShell) {
    const flush = nodeWritable._flush;
    const flushCallback = (err) => {
      // Check if stream errored during flush (e.g., controller.error() was called)
      const state = stream[kWritableState];
      if (state === 'erroring' || state === 'errored') {
        err = err || stream[kStoredError];
      }
      if (err) {
        stream[kInFlightCloseRequest] = null;
        const unwrapped = unwrapError(err);
        closeRequest.reject(unwrapped);
        _handleCloseError(stream, unwrapped);
        // For transforms: also error the readable side (TransformStreamError)
        if (stream._transformReadable) {
          const readable = stream._transformReadable();
          if (readable && !readable._errored && readable[kNodeReadable] && !readable[kNodeReadable].destroyed) {
            readable[kNodeReadable].destroy(unwrapped);
          }
          _errorReadableSide(readable, unwrapped);
        }
      } else {
        // If a cancel is in-flight (readable.cancel() running async), wait for it
        // before resolving close — cancel rejection should take precedence.
        const ts = stream._transformStream;
        if (ts && ts._cancelPromise) {
          ts._cancelPromise.then(
            () => _handleCloseSuccess(stream, closeRequest),
            (cancelErr) => {
              stream[kInFlightCloseRequest] = null;
              const unwrapped = unwrapError(cancelErr);
              closeRequest.reject(unwrapped);
              _handleCloseError(stream, unwrapped);
            },
          );
        } else {
          _handleCloseSuccess(stream, closeRequest);
        }
      }
    };
    if (flush) {
      try {
        flush.call(nodeWritable, flushCallback);
      } catch (e) {
        flushCallback(e);
      }
    } else {
      flushCallback(null);
    }
    return;
  }

  nodeWritable.end((err) => {
    stream[kInFlightCloseRequest] = null;
    if (err) {
      const unwrapped = unwrapError(err);
      closeRequest.reject(unwrapped);
      _handleCloseError(stream, unwrapped);
    } else {
      _handleCloseSuccess(stream, closeRequest);
    }
  });
}

function _handleCloseSuccess(stream, closeRequest) {
  stream[kInFlightCloseRequest] = null;
  closeRequest.resolve(undefined);

  const abortRequest = stream[kPendingAbortRequest];
  if (abortRequest) {
    stream[kPendingAbortRequest] = null;
    abortRequest.resolve();
  }

  stream[kWritableState] = 'closed';

  // For transform shells: after close succeeds, the transform's flush has completed.
  // Ensure the readable side closes: push null if not ended, then resume.
  if (stream._isTransformShell && stream[kNodeWritable]) {
    const nodeTransform = stream[kNodeWritable];
    if (!nodeTransform.readableEnded) {
      try {
        nodeTransform.push(null);
      } catch {}
      if (nodeTransform.readableLength === 0) {
        nodeTransform.resume();
      }
    }
    // Synchronously mark readable shell as closed and resolve reader.closed
    if (stream._transformReadable) {
      const readable = stream._transformReadable();
      if (readable) {
        readable._closed = true;
        const readableReader = readable[kLock];
        if (readableReader && readableReader._resolveClosedFromCancel) {
          readableReader._resolveClosedFromCancel();
        }
      }
    }
  }

  const writer = stream[kLock];
  if (writer) {
    writer._resolveClosed();
  }
}

function _handleCloseError(stream, error) {
  const abortRequest = stream[kPendingAbortRequest];

  if (abortRequest) {
    stream[kPendingAbortRequest] = null;
    abortRequest.reject(error);
  }

  stream[kWritableState] = 'errored';
  stream[kStoredError] = error;

  const writer = stream[kLock];
  if (writer) {
    writer._rejectReady(error);
    // Per spec: when abort is pending, closed rejects with abort reason
    writer._rejectClosed(abortRequest ? abortRequest.reason : error);
  }
}

function _dealWithRejection(stream, error) {
  const state = stream[kWritableState];
  if (state === 'writable') {
    _startErroring(stream, error);
  } else {
    _finishErroring(stream);
  }
}

/**
 * Called by the controller when controller.error() is invoked.
 */
function _controllerError(stream, error) {
  const state = stream[kWritableState];
  if (state !== 'writable') return;
  _startErroring(stream, error);
}

/**
 * Called by the writer to enqueue a write.
 */
function _writeInternal(stream, chunk) {
  const state = stream[kWritableState];

  if (state === 'erroring' || state === 'errored') {
    return Promise.reject(stream[kStoredError]);
  }

  if (state === 'closed') {
    return Promise.reject(new TypeError('Cannot write to a closed stream'));
  }

  if (stream[kCloseRequest] || stream[kInFlightCloseRequest]) {
    return Promise.reject(new TypeError('Cannot write to a closing stream'));
  }

  // FAST PATH: started, queue empty, no in-flight write, not transform shell.
  // Bypasses Node Writable entirely for direct sink calls — eliminates the
  // process.nextTick() deferral that Node imposes on write callbacks.
  if (
    stream[kStarted] &&
    stream[kWriteRequests].length === 0 &&
    !stream[kInFlightWriteRequest] &&
    !stream._isTransformShell
  ) {
    const sinkWrite = stream._sinkWrite;

    // DIRECT SINK PATH: call user's write() directly, no Node Writable
    if (sinkWrite) {
      return new Promise((resolve, reject) => {
        const writeRequest = { resolve, reject, chunk };
        stream[kInFlightWriteRequest] = writeRequest;

        // Update backpressure (in-flight write counts toward desiredSize)
        const writer = stream[kLock];
        if (writer && stream[kWritableState] === 'writable') {
          writer._updateReadyForBackpressure(stream);
        }

        try {
          const result = Reflect.apply(sinkWrite, stream._underlyingSink, [chunk, stream._controller]);
          if (isThenable(result)) {
            result.then(
              () => {
                stream[kInFlightWriteRequest] = null;
                writeRequest.resolve(undefined);
                const w = stream[kLock];
                if (w && stream[kWritableState] === 'writable') {
                  w._updateReadyForBackpressure(stream);
                }
                _advanceQueueIfNeeded(stream);
              },
              (err) => {
                stream[kInFlightWriteRequest] = null;
                writeRequest.reject(err);
                _handleWriteError(stream, err);
              },
            );
          } else {
            // Sync write — defer by one microtask (not nextTick).
            // Must keep kInFlightWriteRequest set so concurrent fire-and-forget
            // writes queue properly (abort can reject them).
            queueMicrotask(() => {
              stream[kInFlightWriteRequest] = null;
              writeRequest.resolve(undefined);
              const w = stream[kLock];
              if (w && stream[kWritableState] === 'writable') {
                w._updateReadyForBackpressure(stream);
              }
              _advanceQueueIfNeeded(stream);
            });
          }
        } catch (err) {
          stream[kInFlightWriteRequest] = null;
          writeRequest.reject(err);
          _handleWriteError(stream, err);
        }
      });
    }

    // No sink write (default no-op sink) — go through Node Writable
    return new Promise((resolve, reject) => {
      const writeRequest = { resolve, reject, chunk };
      stream[kInFlightWriteRequest] = writeRequest;

      const writer = stream[kLock];
      if (writer && stream[kWritableState] === 'writable') {
        writer._updateReadyForBackpressure(stream);
      }

      const nodeWritable = stream[kNodeWritable];
      const ok = nodeWritable.write(chunk, (err) => {
        stream[kInFlightWriteRequest] = null;
        if (err) {
          const unwrapped = unwrapError(err);
          writeRequest.reject(unwrapped);
          _handleWriteError(stream, unwrapped);
        } else {
          writeRequest.resolve(undefined);
          const w = stream[kLock];
          if (w && stream[kWritableState] === 'writable') {
            w._updateReadyForBackpressure(stream);
          }
          _advanceQueueIfNeeded(stream);
        }
      });

      if (!ok) {
        const w = stream[kLock];
        if (w && stream[kWritableState] === 'writable') {
          w._setReadyPending(stream);
        }
      }
    });
  }

  // SLOW PATH: queue the write (multiple pending writes or not yet started)
  return new Promise((resolve, reject) => {
    stream[kWriteRequests].push({ resolve, reject, chunk });
    const writer = stream[kLock];
    if (writer && stream[kWritableState] === 'writable') {
      writer._updateReadyForBackpressure(stream);
    }
    _advanceQueueIfNeeded(stream);
  });
}

/**
 * Called by the writer to close the stream.
 */
function _closeFromWriter(stream) {
  const state = stream[kWritableState];

  if (state === 'closed' || state === 'errored') {
    return Promise.reject(new TypeError('Cannot close stream'));
  }

  // Per spec: check close queued/in-flight BEFORE erroring state
  if (stream[kCloseRequest] || stream[kInFlightCloseRequest]) {
    return Promise.reject(new TypeError('Cannot close an already-closing stream'));
  }

  // Per spec: state is 'writable' or 'erroring' — proceed with close.
  // Close will be rejected later by _finishErroring if erroring.
  return _closeInternal(stream);
}

/**
 * Get the desiredSize for the stream.
 */
/**
 * Initialize a native-only writable shell (delegates everything to native WritableStream).
 */
function _initNativeWritableShell(target, nativeStream) {
  utils_stats.nativeOnlyWritable++;
  target[kNodeWritable] = null;
  target[kLock] = null;
  target[kMaterialized] = nativeStream;
  target[kNativeOnly] = true;
  return target;
}

function _getDesiredSize(stream) {
  const state = stream[kWritableState];
  if (state === 'errored' || state === 'erroring') return null;
  if (state === 'closed') return 0;
  if (stream._hwm === Infinity) return Infinity;

  // Use state-machine formula for all streams (including transform shells)
  return stream._hwm - stream[kWriteRequests].length - (stream[kInFlightWriteRequest] ? 1 : 0);
}

;// CONCATENATED MODULE: ../../node_modules/.pnpm/experimental-fast-webstreams@0.0.18/node_modules/experimental-fast-webstreams/src/reader.js
/**
 * FastReadableStreamDefaultReader
 * Bridges reader.read() to Node Readable consumption with sync fast path (Tier 1).
 */




// Cached done result — avoids allocating { value: undefined, done: true } + Promise per stream end
const DONE_RESULT = { value: undefined, done: true };
const DONE_PROMISE = Promise.resolve(DONE_RESULT);

// Sentinel for _readSyncRaw() — signals end-of-stream without object allocation
const READ_DONE = Symbol('READ_DONE');

function _resolveReadResult(value, done) {
  if (done) return DONE_PROMISE;
  return Promise.resolve({ value, done: false });
}

/**
 * Create a shared LiteReadable dispatcher for FIFO read queue.
 * Dispatches push events to the oldest waiting read in the queue.
 */
function _createLiteDispatcher(nodeReadable) {
  const dispatch = (event, arg) => {
    const queue = nodeReadable._readQueue;
    if (!queue || queue.length === 0) return;

    if (event === 'data') {
      // Dispatch to oldest waiting read (FIFO)
      const entry = queue[0];
      const data = nodeReadable.read();
      if (data !== null) {
        queue.shift();
        entry.removePending();
        const stream = entry.stream;
        if (stream._controller && stream._controller[kDequeueBytes]) stream._controller[kDequeueBytes](data);
        if (stream._onPull) stream._onPull();
        // Callback-based entry: dispatch via onChunk, resolve with undefined
        if (entry.onChunk) {
          entry.onChunk(data);
          entry.resolve(undefined);
        } else {
          entry.resolve({ value: data, done: false });
        }
        // If more data available and more reads waiting, dispatch again
        if (queue.length > 0 && nodeReadable.readableLength > 0) {
          dispatch('data');
        } else if (queue.length > 0) {
          // Re-register for next push
          nodeReadable._dataCallback = dispatch;
        }
      } else if (nodeReadable.readableEnded || nodeReadable.destroyed) {
        queue.shift();
        entry.removePending();
        if (entry.onClose) { entry.onClose(); entry.resolve(undefined); }
        else entry.resolve(DONE_RESULT);
      } else {
        // No data yet — re-register for next push
        nodeReadable._dataCallback = dispatch;
      }
    } else {
      // end/error/close — dispatch to ALL waiting reads
      const entries = queue.splice(0);
      for (const entry of entries) {
        entry.removePending();
        if (event === 'end') {
          if (entry.onClose) { entry.onClose(); entry.resolve(undefined); }
          else entry.resolve(DONE_RESULT);
        } else if (event === 'error') {
          const stream = entry.stream;
          const err = stream._errored ? stream._storedError : unwrapError(arg);
          if (entry.onError) { entry.onError(err); entry.resolve(undefined); }
          else entry.reject(err);
        } else if (event === 'close') {
          const stream = entry.stream;
          if (stream._errored) {
            if (entry.onError) { entry.onError(stream._storedError); entry.resolve(undefined); }
            else entry.reject(stream._storedError);
          } else if (nodeReadable.errored) {
            const err = unwrapError(nodeReadable.errored);
            if (entry.onError) { entry.onError(err); entry.resolve(undefined); }
            else entry.reject(err);
          } else {
            if (entry.onClose) { entry.onClose(); entry.resolve(undefined); }
            else entry.resolve(DONE_RESULT);
          }
        }
      }
    }
  };
  return dispatch;
}

class FastReadableStreamDefaultReader {
  #stream;
  #nodeReadable;
  #closedPromise;
  #closedResolve;
  #closedReject;
  #closedSettled = false;
  #released = false;
  #pendingReads = []; // Track pending reads for releaseLock

  constructor(stream) {
    if (stream[kLock]) {
      throw new TypeError('ReadableStream is already locked');
    }
    this.#stream = stream;
    this.#nodeReadable = stream[kNodeReadable];
    stream[kLock] = this;

    this.#closedPromise = new Promise((resolve, reject) => {
      this.#closedResolve = resolve;
      this.#closedReject = reject;
    });

    // Use stream-level state for initial closed/errored checks (preserves error identity)
    if (stream._errored) {
      this.#settleClose(false, stream._storedError);
    } else if (stream._closed) {
      this.#settleClose(true);
    } else {
      const nodeReadable = this.#nodeReadable;

      // Check Node-level state as fallback
      if (nodeReadable.destroyed) {
        if (nodeReadable.errored) {
          this.#settleClose(false, unwrapError(nodeReadable.errored));
        } else {
          this.#settleClose(true);
        }
      } else if (nodeReadable.readableEnded) {
        this.#settleClose(true);
      } else if (nodeReadable._dataCallback !== undefined) {
        // LiteReadable: skip event listeners entirely. All close/error paths
        // settle the reader directly via controller.close/error → reader._settleClosedFromError
        // / _resolveClosedFromCancel. Avoids 4 closures + _listeners object + 3 wrapper
        // objects (~953 bytes) per reader — significant for 300+ streams/request.
      } else {
        // Node.js Readable: listen for close events (needed because Node internals
        // can emit end/error/close independently of our controller)
        const onEnd = () => {
          cleanup();
          stream._closed = true;
          this.#settleClose(true);
        };
        const onError = (err) => {
          cleanup();
          // Use stream-level error if available (preserves identity)
          if (stream._errored) {
            this.#settleClose(false, stream._storedError);
          } else {
            this.#settleClose(false, unwrapError(err));
          }
        };
        const onClose = () => {
          cleanup();
          if (stream._errored) {
            this.#settleClose(false, stream._storedError);
          } else if (nodeReadable.errored) {
            this.#settleClose(false, unwrapError(nodeReadable.errored));
          } else {
            stream._closed = true;
            this.#settleClose(true);
          }
        };
        const cleanup = () => {
          nodeReadable.removeListener('end', onEnd);
          nodeReadable.removeListener('error', onError);
          nodeReadable.removeListener('close', onClose);
        };
        nodeReadable.on('end', onEnd);
        nodeReadable.on('error', onError);
        nodeReadable.on('close', onClose);
      }
    }
  }

  #settleClose(success, err) {
    if (this.#closedSettled || this.#released) return;
    this.#closedSettled = true;
    if (success) {
      this.#closedResolve(undefined);
    } else {
      this.#closedReject(err);
      this.#closedPromise.catch(noop);
    }
  }

  read() {
    if (this.#released) {
      return Promise.reject(new TypeError('Reader has been released'));
    }

    const stream = this.#stream;
    const nodeReadable = this.#nodeReadable;

    // Check stream-level error first (preserves error identity for falsy errors)
    if (stream._errored) {
      return Promise.reject(stream._storedError);
    }

    // Check if the stream has errored (Node-level fallback)
    if (nodeReadable.errored) {
      return Promise.reject(unwrapError(nodeReadable.errored));
    }

    // Check if destroyed (closed)
    if (nodeReadable.destroyed) {
      return _resolveReadResult(undefined, true);
    }

    // A3: Byte stream HWM=0 fast path — simplified guards, no _onPull checks
    if (stream._byteStreamSyncPull) {
      const chunk = nodeReadable.read();
      if (chunk !== null) {
        if (stream._onChunkRead) stream._onChunkRead(chunk);
        return _resolveReadResult(chunk, false);
      }
      if (nodeReadable.readableEnded) return DONE_PROMISE;
      // Simplified sync pull: skip _onRead/_pullFn/_reading guards (guaranteed for _byteStreamSyncPull)
      if (!stream._pullLock && !nodeReadable._readableState.ended && !nodeReadable._destroyed) {
        nodeReadable._readableState.reading = true;
        nodeReadable._onRead();
        nodeReadable._readableState.reading = false;
        const pulled = nodeReadable.read();
        if (pulled !== null) {
          if (stream._onChunkRead) stream._onChunkRead(pulled);
          return _resolveReadResult(pulled, false);
        }
        if (nodeReadable.readableEnded) return DONE_PROMISE;
      }
      // Async pull in progress — fall through to async wait path below
    } else {
      // Tier 1: sync fast path — data already in buffer
      const chunk = nodeReadable.read();
      if (chunk !== null) {
        // Consolidated byte stream accounting (kDequeueBytes + pull-after-read).
        // For non-byte streams, _onChunkRead is null → zero overhead.
        if (stream._onChunkRead) stream._onChunkRead(chunk);
        // Notify transform controller that data was consumed (may clear backpressure)
        if (stream._onPull) stream._onPull();
        return _resolveReadResult(chunk, false);
      }

      // Check if ended
      if (nodeReadable.readableEnded) {
        return _resolveReadResult(undefined, true);
      }

      // Sync pull fast path: try pulling synchronously before creating async Promise.
      // If pull enqueues synchronously (common for byte stream pull callbacks),
      // return Promise.resolve() instead of new Promise + FIFO queue overhead.
      if (nodeReadable._onRead !== undefined &&
          !nodeReadable._readableState.reading &&
          !nodeReadable._readableState.ended && !nodeReadable._destroyed &&
          stream._pullFn && !stream._pullLock) {
        nodeReadable._readableState.reading = true;
        nodeReadable._onRead();
        nodeReadable._readableState.reading = false;
        const pulled = nodeReadable.read();
        if (pulled !== null) {
          if (stream._onChunkRead) stream._onChunkRead(pulled);
          if (stream._onPull) stream._onPull();
          return _resolveReadResult(pulled, false);
        }
        if (nodeReadable.readableEnded) {
          return _resolveReadResult(undefined, true);
        }
      }
    }

    // Data not available yet — wait for data
    return new Promise((resolve, reject) => {
      // Track this pending read for releaseLock
      const entry = { reject: null, cleanup: null };
      this.#pendingReads.push(entry);

      // Notify transform controller that there's a pending read (clears backpressure)
      // Must be called AFTER pushing to pendingReads so _pendingReadCount() is accurate
      if (stream._onPull) stream._onPull();

      const removePending = () => {
        const idx = this.#pendingReads.indexOf(entry);
        if (idx !== -1) this.#pendingReads.splice(idx, 1);
      };

      // LiteReadable fast path: FIFO callback queue instead of 4 listener registrations.
      // Multiple concurrent reads are queued; each push dispatches to the oldest waiting read.
      if (nodeReadable._dataCallback !== undefined) {
        const readQueue = nodeReadable._readQueue || (nodeReadable._readQueue = []);
        const queueEntry = { resolve, reject, entry, stream, removePending };
        readQueue.push(queueEntry);
        entry.reject = reject;
        entry.cleanup = () => {
          const idx = readQueue.indexOf(queueEntry);
          if (idx !== -1) readQueue.splice(idx, 1);
        };
        // Install shared dispatcher if not already installed
        if (!nodeReadable._dataCallback) {
          nodeReadable._dataCallback = _createLiteDispatcher(nodeReadable);
        }
        if (nodeReadable._readableState.reading) nodeReadable._readableState.reading = false;
        nodeReadable.read(0);
        return;
      }

      // Node.js Readable path: use event listeners
      const onReadable = () => {
        cleanup();
        removePending();
        const data = nodeReadable.read();
        if (data !== null) {
          if (stream._controller && stream._controller[kDequeueBytes]) stream._controller[kDequeueBytes](data);
          if (stream._onPull) stream._onPull();
          resolve({ value: data, done: false });
        } else if (nodeReadable.readableEnded || nodeReadable.destroyed) {
          resolve(DONE_RESULT);
        } else {
          // No data yet, re-register
          this.#pendingReads.push(entry);
          nodeReadable.once('readable', onReadable);
          nodeReadable.once('end', onEnd);
          nodeReadable.once('error', onError);
          nodeReadable.once('close', onClose);
        }
      };
      const onEnd = () => { cleanup(); removePending(); resolve(DONE_RESULT); };
      const onError = (err) => {
        cleanup(); removePending();
        if (stream._errored) reject(stream._storedError);
        else reject(unwrapError(err));
      };
      const onClose = () => {
        cleanup(); removePending();
        if (stream._errored) reject(stream._storedError);
        else if (nodeReadable.errored) reject(unwrapError(nodeReadable.errored));
        else resolve(DONE_RESULT);
      };
      const cleanup = () => {
        nodeReadable.removeListener('readable', onReadable);
        nodeReadable.removeListener('end', onEnd);
        nodeReadable.removeListener('error', onError);
        nodeReadable.removeListener('close', onClose);
      };

      entry.reject = reject;
      entry.cleanup = cleanup;

      nodeReadable.once('readable', onReadable);
      nodeReadable.once('end', onEnd);
      nodeReadable.once('error', onError);
      nodeReadable.once('close', onClose);

      // Trigger _read() to request data (pull).
      if (nodeReadable._readableState.reading) {
        nodeReadable._readableState.reading = false;
      }
      nodeReadable.read(0);

      // If close happened synchronously during read(0) (e.g., tee close propagation),
      // resolve immediately instead of waiting for nextTick 'end' event.
      if (nodeReadable.readableEnded || nodeReadable.destroyed) {
        cleanup();
        removePending();
        if (stream._errored) {
          reject(stream._storedError);
        } else if (nodeReadable.errored) {
          reject(unwrapError(nodeReadable.errored));
        } else {
          resolve(DONE_RESULT);
        }
        return;
      }
    });
  }

  /**
   * Internal sync read — returns { value, done } directly, or null if data isn't
   * available (caller should fall back to async read()). Used by specPipeTo to
   * avoid Promise allocation when data is buffered.
   */
  _readSync() {
    if (this.#released) return null;
    const stream = this.#stream;
    if (stream._errored) return null; // Let async read() handle error rejection
    const nodeReadable = this.#nodeReadable;
    if (nodeReadable.errored || nodeReadable.destroyed) return null;
    const chunk = nodeReadable.read();
    if (chunk !== null) {
      if (stream._controller && stream._controller[kDequeueBytes]) stream._controller[kDequeueBytes](chunk);
      if (stream._onPull) stream._onPull();
      return { value: chunk, done: false };
    }
    if (nodeReadable.readableEnded) return DONE_RESULT;
    return null;
  }

  /**
   * Raw sync read — returns the chunk directly, READ_DONE for end-of-stream,
   * or null if no data is available. Avoids {value, done} object allocation.
   * Used by specPipeTo batch path.
   */
  _readSyncRaw() {
    if (this.#released) return null;
    const stream = this.#stream;
    if (stream._errored) return null;
    const nodeReadable = this.#nodeReadable;
    if (nodeReadable.errored || nodeReadable.destroyed) return null;
    const chunk = nodeReadable.read();
    if (chunk !== null) {
      if (stream._controller && stream._controller[kDequeueBytes]) stream._controller[kDequeueBytes](chunk);
      if (stream._onPull) stream._onPull();
      return chunk;
    }
    if (nodeReadable.readableEnded) return READ_DONE;
    return null;
  }

  /**
   * Callback-based internal read — avoids creating {value, done} objects entirely.
   * Used by tee and specPipeTo to avoid thenable interception: Promise.resolve(obj)
   * checks obj.then per ECMAScript spec, so passing {value, done} through promise
   * resolution is observable when Object.prototype.then is patched. This method
   * resolves with undefined instead, dispatching chunks via direct callbacks.
   * Returns Promise<undefined> (never rejects — errors go through onError callback).
   */
  _readWithCallbacks(onChunk, onClose, onError) {
    if (this.#released) {
      onError(new TypeError('Reader has been released'));
      return RESOLVED_UNDEFINED;
    }

    const stream = this.#stream;
    const nodeReadable = this.#nodeReadable;

    if (stream._errored) {
      onError(stream._storedError);
      return RESOLVED_UNDEFINED;
    }
    if (nodeReadable.errored) {
      onError(unwrapError(nodeReadable.errored));
      return RESOLVED_UNDEFINED;
    }
    if (nodeReadable.destroyed) {
      onClose();
      return RESOLVED_UNDEFINED;
    }

    // Sync fast path — data already in buffer
    const chunk = nodeReadable.read();
    if (chunk !== null) {
      if (stream._controller && stream._controller[kDequeueBytes]) stream._controller[kDequeueBytes](chunk);
      if (stream._onPull) stream._onPull();
      onChunk(chunk);
      return RESOLVED_UNDEFINED;
    }

    if (nodeReadable.readableEnded) {
      onClose();
      return RESOLVED_UNDEFINED;
    }

    // Async path — wait for data, resolve with undefined (no thenable check)
    return new Promise((resolve) => {
      const entry = { reject: null, cleanup: null };
      this.#pendingReads.push(entry);
      if (stream._onPull) stream._onPull();

      const removePending = () => {
        const idx = this.#pendingReads.indexOf(entry);
        if (idx !== -1) this.#pendingReads.splice(idx, 1);
      };

      // LiteReadable fast path
      if (nodeReadable._dataCallback !== undefined) {
        const readQueue = nodeReadable._readQueue || (nodeReadable._readQueue = []);
        const queueEntry = { resolve, reject: null, entry, stream, removePending, onChunk, onClose, onError };
        readQueue.push(queueEntry);
        entry.reject = (err) => {
          const idx = readQueue.indexOf(queueEntry);
          if (idx !== -1) readQueue.splice(idx, 1);
          removePending();
          onError(err);
          resolve(undefined);
        };
        entry.cleanup = () => {
          const idx = readQueue.indexOf(queueEntry);
          if (idx !== -1) readQueue.splice(idx, 1);
        };
        if (!nodeReadable._dataCallback) {
          nodeReadable._dataCallback = _createLiteDispatcher(nodeReadable);
        }
        if (nodeReadable._readableState.reading) nodeReadable._readableState.reading = false;
        nodeReadable.read(0);
        return;
      }

      // Node.js Readable path
      const onReadable = () => {
        cleanup();
        removePending();
        const data = nodeReadable.read();
        if (data !== null) {
          if (stream._controller && stream._controller[kDequeueBytes]) stream._controller[kDequeueBytes](data);
          if (stream._onPull) stream._onPull();
          onChunk(data);
          resolve(undefined);
        } else if (nodeReadable.readableEnded || nodeReadable.destroyed) {
          onClose();
          resolve(undefined);
        } else {
          this.#pendingReads.push(entry);
          nodeReadable.once('readable', onReadable);
          nodeReadable.once('end', onEndH);
          nodeReadable.once('error', onErrorH);
          nodeReadable.once('close', onCloseH);
        }
      };
      const onEndH = () => { cleanup(); removePending(); onClose(); resolve(undefined); };
      const onErrorH = (err) => {
        cleanup(); removePending();
        if (stream._errored) onError(stream._storedError);
        else onError(unwrapError(err));
        resolve(undefined);
      };
      const onCloseH = () => {
        cleanup(); removePending();
        if (stream._errored) { onError(stream._storedError); resolve(undefined); }
        else if (nodeReadable.errored) { onError(unwrapError(nodeReadable.errored)); resolve(undefined); }
        else { onClose(); resolve(undefined); }
      };
      const cleanup = () => {
        nodeReadable.removeListener('readable', onReadable);
        nodeReadable.removeListener('end', onEndH);
        nodeReadable.removeListener('error', onErrorH);
        nodeReadable.removeListener('close', onCloseH);
      };

      entry.reject = (err) => { cleanup(); removePending(); onError(err); resolve(undefined); };
      entry.cleanup = cleanup;

      nodeReadable.once('readable', onReadable);
      nodeReadable.once('end', onEndH);
      nodeReadable.once('error', onErrorH);
      nodeReadable.once('close', onCloseH);

      if (nodeReadable._readableState.reading) {
        nodeReadable._readableState.reading = false;
      }
      nodeReadable.read(0);
    });
  }

  /**
   * Try to read synchronously — returns the chunk directly, READ_DONE sentinel
   * for end-of-stream, or null if no data is available. Avoids {value,done}
   * object allocation and Promise wrapping. Used by async iterator fast path.
   */
  _tryReadSync() {
    if (this.#released) return null;
    const stream = this.#stream;
    if (stream._errored) return null;
    const nodeReadable = this.#nodeReadable;
    if (nodeReadable.errored || nodeReadable.destroyed) return null;
    const chunk = nodeReadable.read();
    if (chunk !== null) {
      if (stream._onChunkRead) stream._onChunkRead(chunk);
      if (stream._onPull) stream._onPull();
      return chunk;
    }
    if (nodeReadable.readableEnded) return READ_DONE;
    return null;
  }

  cancel(reason) {
    if (this.#released) {
      return Promise.reject(new TypeError('Reader has been released'));
    }
    // Call the stream's internal cancel (bypasses lock check, calls underlyingSource.cancel)
    return this.#stream._cancelInternal(reason);
  }

  /**
   * Called by controller.error() to synchronously settle the closedPromise.
   * Must be called BEFORE _errorReadRequests so closed rejects before reads.
   */
  _settleClosedFromError(error) {
    if (!this.#closedSettled && !this.#released) {
      this.#closedSettled = true;
      this.#closedReject(error);
      this.#closedPromise.catch(noop);
    }
  }

  /**
   * Called by controller.error() to synchronously reject all pending read requests.
   * Per spec: ReadableStreamError rejects all read requests before releaseLock.
   */
  _errorReadRequests(error) {
    for (const entry of this.#pendingReads) {
      if (entry.cleanup) entry.cleanup();
      if (entry.reject) entry.reject(error);
    }
    this.#pendingReads = [];
  }

  /**
   * Returns the number of pending read requests. Used by transform controller
   * to compute accurate desiredSize (pending reads consume enqueued chunks).
   */
  _pendingReadCount() {
    return this.#pendingReads.length;
  }

  /**
   * Called by stream._cancelInternal() to resolve closedPromise synchronously.
   * Per spec: cancel sets stream state to "closed" and resolves reader.closedPromise
   * before calling the cancel algorithm.
   */
  _resolveClosedFromCancel() {
    if (!this.#closedSettled && !this.#released) {
      this.#closedResolve(undefined);
      this.#closedSettled = true;
    }
  }

  releaseLock() {
    if (!this.#stream) return;
    if (!this.#released) {
      this.#released = true;
      const stream = this.#stream;

      // Reject all pending read requests
      const releasedError = new TypeError('Reader was released');
      for (const entry of this.#pendingReads) {
        if (entry.cleanup) entry.cleanup();
        if (entry.reject) entry.reject(releasedError);
      }
      this.#pendingReads = [];

      if (!this.#closedSettled) {
        // Per spec: if state is "readable", reject existing promise (preserve identity).
        // If state is "closed" or "errored", the promise should already be settled
        // from events. But if it hasn't settled yet, settle it first.
        if (stream._closed) {
          // Stream closed (e.g., via cancel) — resolve, then replace
          this.#closedResolve(undefined);
          this.#closedSettled = true;
          this.#closedPromise = Promise.reject(releasedError);
          this.#closedPromise.catch(noop);
        } else if (stream._errored) {
          // Stream errored — reject with stored error, then replace
          this.#closedReject(stream._storedError);
          this.#closedPromise.catch(noop);
          this.#closedSettled = true;
          this.#closedPromise = Promise.reject(releasedError);
          this.#closedPromise.catch(noop);
        } else {
          // Stream still readable — reject existing promise, preserve identity
          this.#closedReject(releasedError);
          this.#closedPromise.catch(noop);
          this.#closedSettled = true;
        }
      } else {
        // Already settled — per spec: replace with new rejected promise
        this.#closedPromise = Promise.reject(releasedError);
        this.#closedPromise.catch(noop);
      }

      stream[kLock] = null;
    }
  }

  get closed() {
    return this.#closedPromise;
  }
}

;// CONCATENATED MODULE: ../../node_modules/.pnpm/experimental-fast-webstreams@0.0.18/node_modules/experimental-fast-webstreams/src/pipe-to.js
/**
 * Spec-compliant pipeTo implementation.
 *
 * Preserves error identity by using reader.read()/writer.write() directly
 * instead of delegating to native pipeTo (which wraps errors through
 * the Node↔WHATWG conversion layer).
 *
 * Follows the WHATWG ReadableStreamPipeTo algorithm:
 * https://streams.spec.whatwg.org/#readable-stream-pipe-to
 */





/**
 * Wait for a write promise to settle, resolving to undefined regardless of outcome.
 */
function _waitForWrite(writePromise) {
  return writePromise.then(noop, noop);
}

function specPipeTo(source, dest, options = {}) {
  utils_stats.tier2_specPipeTo++;
  // Options are pre-evaluated by caller (pipeTo/pipeThrough) in spec order
  const preventClose = !!options.preventClose;
  const preventAbort = !!options.preventAbort;
  const preventCancel = !!options.preventCancel;
  const signal = options.signal;
  const reader = source.getReader();
  const writer = dest.getWriter();

  let shuttingDown = false;
  let currentWrite = RESOLVED_UNDEFINED;

  // Track dest state for WritableStreamDefaultWriterCloseWithErrorPropagation
  let destClosed = false;
  let destErrored = false;
  let destStoredError;
  let sourceClosed = false;
  const destWasErroredAtStart = dest[kWritableState] === 'errored';

  return new Promise((resolve, reject) => {
    // --- Abort signal handling ---
    let abortAlgorithm;
    if (signal) {
      abortAlgorithm = () => {
        const error = signal.reason;
        const actions = [];
        if (!preventAbort)
          actions.push(() => {
            // Abort on already-errored writable resolves (spec: no-op)
            const state = dest[kWritableState];
            if (state === 'closed' || state === 'errored') return RESOLVED_UNDEFINED;
            return writer.abort(error);
          });
        if (!preventCancel)
          actions.push(() => {
            // Cancel on already-errored/closed readable resolves to avoid
            // the automatic rejection overriding the abort signal error.
            if (source._errored || source._closed) return RESOLVED_UNDEFINED;
            return reader.cancel(error);
          });
        shutdownWithAction(() => Promise.all(actions.map((a) => a())), true, error);
      };

      if (signal.aborted) {
        abortAlgorithm();
        return;
      }
      signal.addEventListener('abort', abortAlgorithm);
    }

    // --- Track dest state ---
    writer.closed.then(
      () => {
        destClosed = true;
      },
      (err) => {
        destErrored = true;
        destStoredError = err;
      },
    );

    // --- Source close/error handler ---
    // NOTE: reader.closed can resolve (via Node.js 'end'/'close' events)
    // before the pump loop has drained all buffered data from the Node.js
    // readable (e.g., TransformStream flush() chunks). Check readableLength
    // to decide: if data remains, kick the pump to drain it first; if not,
    // shutdown immediately (preserves microtask ordering for abort signal
    // tests and avoids deadlock when dest has HWM=0).
    reader.closed.then(
      () => {
        sourceClosed = true;
        if (shuttingDown) return;
        // Check if there's buffered data that the pump needs to drain first
        const nodeReadable = source[kNodeReadable];
        if (nodeReadable && nodeReadable.readableLength > 0) {
          pipeLoop();
          return;
        }
        // No buffered data — shutdown immediately
        if (!preventClose) {
          shutdownWithAction(() => {
            if (destErrored) return Promise.reject(destStoredError);
            if (destClosed) return RESOLVED_UNDEFINED;
            return writer.close().catch((e) => {
              if (e instanceof TypeError) return;
              throw e;
            });
          });
        } else {
          shutdown();
        }
      },
      (storedError) => {
        // Source errored — immediate shutdown is correct (no data to drain)
        if (shuttingDown) return;
        if (!preventAbort) {
          // Check if dest errored during setup — dest error takes precedence
          const destNowErrored = dest[kWritableState] === 'errored';
          if (!destWasErroredAtStart && destNowErrored) {
            shutdown(true, dest[kStoredError]);
            return;
          }
          shutdownWithAction(() => writer.abort(storedError), true, storedError);
        } else {
          shutdown(true, storedError);
        }
      },
    );

    // --- Dest close/error handler ---
    writer.closed.then(
      () => {
        // Dest closed unexpectedly (if we didn't close it, shuttingDown would be false)
        if (shuttingDown) return;
        const destClosedError = new TypeError(
          'the destination writable stream closed before all data could be piped to it',
        );
        if (!preventCancel) {
          shutdownWithAction(() => reader.cancel(destClosedError), true, destClosedError);
        } else {
          shutdown(true, destClosedError);
        }
      },
      (storedError) => {
        // Dest errored
        if (shuttingDown) return;
        // Per spec: don't cancel source if it's already closed/closing
        const nodeReadable = source[kNodeReadable];
        const srcAlreadyClosed =
          sourceClosed ||
          source._closed ||
          (nodeReadable && (nodeReadable.readableEnded || nodeReadable._readableState?.ended));
        if (!preventCancel && !srcAlreadyClosed) {
          shutdownWithAction(() => reader.cancel(storedError), true, storedError);
        } else {
          shutdown(true, storedError);
        }
      },
    );

    // Check if reader supports sync reads (FastReadableStreamDefaultReader)
    const hasSyncRead = typeof reader._readSync === 'function';

    // Check if dest supports direct sink writes (Fast writable, not transform shell)
    const hasBatchWrite = !!(dest._sinkWrite && !dest._isTransformShell);

    // Cache sink references for batch path
    const sinkWrite = hasBatchWrite ? dest._sinkWrite : null;
    const sink = hasBatchWrite ? dest._underlyingSink : null;
    const ctrl = hasBatchWrite ? dest._controller : null;

    // Synchronous pre-check: if source is already errored, transition dest to
    // "erroring" immediately. This must happen BEFORE the dest constructor's
    // start-completion microtask fires, so that _advanceQueueIfNeeded sees
    // "erroring" (calls _finishErroring → sink.abort) instead of processing
    // a pending close request (which would call sink.close instead of sink.abort).
    // The reader.closed rejection handler will fire later and handle shutdown.
    if (source._errored && !preventAbort) {
      const destState = dest[kWritableState];
      if (destState !== 'closed' && destState !== 'errored') {
        dest._abortInternal(source._storedError);
      }
    }

    // --- Pump loop ---
    pipeLoop();

    // Re-enter pump after backpressure or batch completion.
    // For batch-eligible dests, bypass writer.desiredSize getter (avoids
    // released-check + brand-check + _getDesiredSize indirection per call).
    function pipeLoop() {
      if (shuttingDown) return;

      if (hasBatchWrite) {
        const ds = _getDesiredSize(dest);
        if (ds !== null && ds > 0) {
          pumpRead();
        } else {
          writer.ready.then(() => {
            if (!shuttingDown) pumpRead();
          }, noop);
        }
      } else if (writer.desiredSize > 0) {
        pumpRead();
      } else {
        writer.ready.then(() => {
          if (!shuttingDown) pumpRead();
        }, noop);
      }
    }

    // Close-shutdown helper (called when pump reads done)
    function pumpClose() {
      sourceClosed = true;
      if (shuttingDown) return;
      if (!preventClose) {
        shutdownWithAction(() => {
          if (destErrored) return Promise.reject(destStoredError);
          if (destClosed) return RESOLVED_UNDEFINED;
          return writer.close().catch((e) => {
            if (e instanceof TypeError) return;
            throw e;
          });
        });
      } else {
        shutdown();
      }
    }

    // Batch-aware re-entry: after clearing the sentinel, check desiredSize
    // directly and call pumpRead() without going through pipeLoop overhead.
    function batchReenter() {
      if (shuttingDown) return;
      const ds = _getDesiredSize(dest);
      if (ds !== null && ds > 0) {
        pumpRead();
      } else {
        writer.ready.then(() => {
          if (!shuttingDown) pumpRead();
        }, noop);
      }
    }

    function pumpRead() {
      if (shuttingDown) return;

      // Sync fast path: batch-read directly from Node buffer via reader._readSync.
      // Drains all available buffered chunks in one go before yielding to the
      // microtask queue, amortizing the yield cost across multiple chunks.
      if (hasSyncRead) {

        // Transform shell batch: call _origTransform directly, bypassing
        // writer.write() and the writable state machine (~2 Promises per chunk → 0).
        if (dest._isTransformShell && dest._origTransform &&
            dest[kStarted] && dest[kWritableState] === 'writable' &&
            !dest[kInFlightWriteRequest] && dest[kWriteRequests].length === 0 &&
            !dest[kCloseRequest] && !dest._transformBackpressure) {

          let chunk = reader._readSyncRaw();
          if (chunk !== null) {
            dest[kInFlightWriteRequest] = true;
            const origTransform = dest._origTransform;
            const nodeWritable = dest[kNodeWritable];
            const ts = dest._transformStream;
            let batchCount = 0;
            const hwm = dest._hwm || 1;

            while (chunk !== null) {
              if (chunk === READ_DONE) {
                dest[kInFlightWriteRequest] = null;
                pumpClose();
                return;
              }

              let syncCompleted = false;
              let transformErr = null;
              let asyncResolve = null;
              try {
                if (ts) ts._inTransformCallback = true;
                origTransform.call(nodeWritable, chunk, 'utf8', (err) => {
                  if (ts) ts._inTransformCallback = false;
                  if (err) {
                    transformErr = err;
                    if (asyncResolve) {
                      dest[kInFlightWriteRequest] = null;
                      if (ts && ts._controller) try { ts._controller.error(err); } catch {}
                      asyncResolve();
                    }
                    return;
                  }
                  syncCompleted = true;
                  if (asyncResolve) {
                    asyncResolve();
                    if (!shuttingDown) queueMicrotask(pipeLoop);
                  }
                });
              } catch (err) {
                if (ts) ts._inTransformCallback = false;
                dest[kInFlightWriteRequest] = null;
                if (ts && ts._controller) try { ts._controller.error(err); } catch {}
                return;
              }

              if (transformErr) {
                dest[kInFlightWriteRequest] = null;
                if (ts && ts._controller) try { ts._controller.error(transformErr); } catch {}
                return;
              }

              if (!syncCompleted) {
                // Async transform — wait for callback, then resume pump
                currentWrite = new Promise((resolve) => { asyncResolve = resolve; });
                return;
              }

              batchCount++;
              if (shuttingDown) { dest[kInFlightWriteRequest] = null; return; }
              if (dest[kWritableState] !== 'writable') { dest[kInFlightWriteRequest] = null; return; }
              if (dest._transformBackpressure) break;
              if (batchCount >= hwm) break;

              chunk = reader._readSyncRaw();
            }

            dest[kInFlightWriteRequest] = null;
            currentWrite = new Promise((resolve) => {
              queueMicrotask(() => {
                resolve();
                batchReenter();
              });
            });
            return;
          }
        }

        // Batch write path: when both reader and writer are Fast, bypass writer.write()
        // and call the sink directly. Uses _readSyncRaw() to avoid {value, done}
        // object allocation per chunk. Reduces N promises to 1 per batch.
        if (hasBatchWrite &&
            dest[kStarted] &&
            dest[kWritableState] === 'writable' &&
            !dest[kInFlightWriteRequest] &&
            dest[kWriteRequests].length === 0 &&
            !dest[kCloseRequest]) {

          let chunk = reader._readSyncRaw();
          if (chunk !== null) {
            // Set sentinel to block concurrent writes from _advanceQueueIfNeeded
            dest[kInFlightWriteRequest] = true;

            let batchCount = 0;
            const hwm = dest._hwm;

            while (chunk !== null) {
              if (chunk === READ_DONE) {
                dest[kInFlightWriteRequest] = null;
                pumpClose();
                return;
              }

              try {
                const result = Reflect.apply(sinkWrite, sink, [chunk, ctrl]);
                if (isThenable(result)) {
                  // Async write — wait for it, then re-enter directly
                  currentWrite = result.then(
                    () => {
                      dest[kInFlightWriteRequest] = null;
                      const w = dest[kWritableState];
                      if (w === 'erroring' || w === 'errored') return;
                      const writer_ = dest[kLock];
                      if (writer_ && w === 'writable') {
                        writer_._updateReadyForBackpressure(dest);
                      }
                      _advanceQueueIfNeeded(dest);
                      batchReenter();
                    },
                    (err) => {
                      dest[kInFlightWriteRequest] = null;
                      ctrl.error(err);
                    },
                  );
                  return;
                }
              } catch (err) {
                dest[kInFlightWriteRequest] = null;
                ctrl.error(err);
                return;
              }

              batchCount++;
              if (shuttingDown) {
                dest[kInFlightWriteRequest] = null;
                return;
              }

              // Check writable state (may have changed via abort signal, etc.)
              if (dest[kWritableState] !== 'writable') {
                dest[kInFlightWriteRequest] = null;
                return;
              }

              // Backpressure: stop batch after hwm chunks
              if (batchCount >= hwm) {
                break;
              }

              chunk = reader._readSyncRaw();
            }

            // End of batch (all sync). Clear sentinel and re-enter via microtask.
            // The microtask deferral allows events (abort signal, errors) to fire between batches.
            currentWrite = new Promise((resolve) => {
              queueMicrotask(() => {
                dest[kInFlightWriteRequest] = null;
                if (dest[kWritableState] === 'writable') {
                  const writer_ = dest[kLock];
                  if (writer_) {
                    writer_._updateReadyForBackpressure(dest);
                  }
                  _advanceQueueIfNeeded(dest);
                }
                resolve();
                batchReenter();
              });
            });
            return;
          }
          // _readSyncRaw returned null on first call — no sync data, fall through
        }

        // Non-batch sync path: use writer.write() per chunk (transform shells, etc.)
        let didSync = false;
        let syncResult = reader._readSync();
        while (syncResult !== null) {
          if (syncResult.done) {
            pumpClose();
            return;
          }
          didSync = true;
          currentWrite = writer.write(syncResult.value);
          if (shuttingDown) return;
          // Check backpressure before reading more
          if (writer.desiredSize <= 0) {
            queueMicrotask(pipeLoop);
            return;
          }
          syncResult = reader._readSync();
        }
        // _readSync returned null — no more buffered data.
        if (didSync) {
          // We processed at least one chunk. Yield to allow events to fire,
          // then re-enter pipeLoop which will try sync again or fall to async.
          queueMicrotask(pipeLoop);
          return;
        }
        // No sync data available at all — fall through to async read below.
      }

      // Async fallback: use _readWithCallbacks to avoid {value,done} objects
      // in promise resolution (avoids thenable interception on Object.prototype.then)
      reader._readWithCallbacks(
        (value) => {
          if (shuttingDown) return;
          currentWrite = writer.write(value);
          pipeLoop();
        },
        () => {
          if (!shuttingDown) pumpClose();
        },
        noop,
      );
    }

    // --- Shutdown with action (spec: shutdownWithAction) ---
    function shutdownWithAction(action, isError = false, originalError) {
      if (shuttingDown) return;
      shuttingDown = true;

      const doAction = () => {
        let p;
        try {
          p = action();
        } catch (e) {
          finalize(true, e);
          return;
        }
        Promise.resolve(p).then(
          () => finalize(isError, originalError),
          (newError) => finalize(true, newError),
        );
      };

      // Wait for the last in-flight write to settle before running action
      _waitForWrite(currentWrite).then(doAction, doAction);
    }

    // --- Shutdown without action ---
    function shutdown(isError = false, error) {
      if (shuttingDown) return;
      shuttingDown = true;
      _waitForWrite(currentWrite).then(
        () => finalize(isError, error),
        () => finalize(isError, error),
      );
    }

    // --- Finalize: release locks, settle promise ---
    function finalize(isError, error) {
      writer.releaseLock();
      reader.releaseLock();
      if (signal && abortAlgorithm) {
        signal.removeEventListener('abort', abortAlgorithm);
      }
      if (isError) reject(error);
      else resolve(undefined);
    }
  });
}

;// CONCATENATED MODULE: ../../node_modules/.pnpm/experimental-fast-webstreams@0.0.18/node_modules/experimental-fast-webstreams/src/readable.js
/**
 * FastReadableStream — WHATWG ReadableStream API backed by Node.js Readable.
 *
 * Tier 0: pipeTo/pipeThrough between Fast streams → pipeline() internally
 * Tier 1: getReader().read() → sync read from Node buffer
 * Tier 2: tee(), native interop → Readable.toWeb() delegation
 */











// Shared byobRequest getter descriptor — avoids per-instance closure allocation.
// The getter uses `this` dynamically so it's safe to share across all byte stream controllers.
const _byobRequestDescriptor = {
  get() { return this[kGetByobRequest](); },
  configurable: true,
};

// ReadableStreamAsyncIteratorPrototype — shared by all async iterators
// Per spec: extends AsyncIteratorPrototype, has next() and return() methods on the prototype
const kIterReader = Symbol('kIterReader');
const kIterDone = Symbol('kIterDone');
const kIterPreventCancel = Symbol('kIterPreventCancel');
const kIterOngoing = Symbol('kIterOngoing');

let _readableStreamAsyncIteratorPrototype = null;
function _getAsyncIteratorPrototype() {
  if (!_readableStreamAsyncIteratorPrototype) {
    const asyncIterProto = Object.getPrototypeOf(Object.getPrototypeOf(async function* () {}.prototype));
    _readableStreamAsyncIteratorPrototype = Object.create(asyncIterProto);

    // Helper: chain operation behind ongoing promise
    function chainOperation(iter, op) {
      const ongoing = iter[kIterOngoing];
      iter[kIterOngoing] = ongoing ? ongoing.then(op, op) : op();
      return iter[kIterOngoing];
    }

    // Define methods with correct name, length, and enumerable properties
    async function next() {
      // Sync fast path: skip chainOperation + Promise when data is buffered
      // and no prior async operation is pending.
      // _tryReadSync returns: chunk (any value) | READ_DONE | null (no data)
      if (!this[kIterDone] && !this[kIterOngoing]) {
        const reader = this[kIterReader];
        if (reader._tryReadSync) {
          const chunk = reader._tryReadSync();
          if (chunk !== null) {
            if (chunk === READ_DONE) {
              this[kIterDone] = true;
              reader.releaseLock();
              return { value: undefined, done: true };
            }
            return { value: chunk, done: false };
          }
        }
      }
      return chainOperation(this, async () => {
        if (this[kIterDone]) return { value: undefined, done: true };
        try {
          const result = await this[kIterReader].read();
          if (result.done) {
            this[kIterDone] = true;
            this[kIterReader].releaseLock();
          }
          return result;
        } catch (e) {
          this[kIterDone] = true;
          this[kIterReader].releaseLock();
          throw e;
        }
      });
    }

    // return needs length = 1, so we use an explicit parameter
    const returnFn = async function (value) {
      return chainOperation(this, async () => {
        if (!this[kIterDone]) {
          this[kIterDone] = true;
          if (!this[kIterPreventCancel]) {
            const cancelResult = this[kIterReader].cancel(value);
            this[kIterReader].releaseLock();
            await cancelResult;
          } else {
            this[kIterReader].releaseLock();
          }
        }
        return { value, done: true };
      });
    };
    Object.defineProperty(returnFn, 'name', { value: 'return' });

    Object.defineProperty(_readableStreamAsyncIteratorPrototype, 'next', {
      value: next,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    Object.defineProperty(_readableStreamAsyncIteratorPrototype, 'return', {
      value: returnFn,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }
  return _readableStreamAsyncIteratorPrototype;
}

// Brand checks: accept both Fast and native streams.
// Must verify internal state, not just prototype chain, because
// Object.setPrototypeOf(FastReadableStream.prototype, NativeReadableStream.prototype)
// makes Object.create(FastReadableStream.prototype) pass instanceof NativeReadableStream.
const _nativeLockedGetter = Object.getOwnPropertyDescriptor(NativeReadableStream.prototype, 'locked')?.get;
function _isReadableStream(obj) {
  if (obj == null) return false;
  if (typeof obj !== 'object' && typeof obj !== 'function') return false;
  if (isFastReadable(obj)) return true;
  // Check for genuine native ReadableStream (has C++ internal slots)
  if (_nativeLockedGetter) {
    try { _nativeLockedGetter.call(obj); return true; } catch { return false; }
  }
  return obj instanceof NativeReadableStream;
}

function _isWritableStream(obj) {
  if (obj == null) return false;
  if (typeof obj !== 'object' && typeof obj !== 'function') return false;
  return isFastWritable(obj) || obj instanceof NativeWritableStream;
}

/**
 * Wrap a LiteReadable in a Node.js Readable so it can participate in pipeline().
 * LiteReadable lacks pipe()/flowing mode that pipeline needs.
 * One-time ~10µs cost, then zero-promise pipeline throughput.
 */
function _wrapLiteForPipeline(lite, stream) {
  // Signal the pull coordinator that demand comes from pipeline, not WHATWG reader.
  // pullFn's desiredSize guard checks this to allow pull without reader demand.
  if (stream) stream._pipelineDemand = true;

  let inDrain = false;

  function drain() {
    if (inDrain) return;
    inDrain = true;
    let chunk;
    while ((chunk = lite.read()) !== null) {
      if (!nr.push(chunk)) {
        // Backpressure: wrapper buffer full. Stop pulling until pipeline consumes.
        if (stream) stream._pipelineDemand = false;
        inDrain = false;
        return;
      }
    }
    if (lite._ended) { inDrain = false; nr.push(null); return; }
    // Trigger pull synchronously to fill buffer.
    // inDrain flag prevents re-entrancy if sync pull enqueues immediately
    // (sync pull → enqueue → push → _dataCallback → drain → blocked by inDrain,
    //  data sits in buffer, picked up by while loop after _onRead returns).
    if (lite._onRead && !lite._readableState.reading && !lite._readableState.ended && !lite._destroyed) {
      lite._readableState.reading = true;
      lite._onRead();
      lite._readableState.reading = false;
    }
    // Drain any data enqueued by sync pull
    while ((chunk = lite.read()) !== null) {
      if (!nr.push(chunk)) {
        if (stream) stream._pipelineDemand = false;
        inDrain = false;
        return;
      }
    }
    if (lite._ended) { inDrain = false; nr.push(null); return; }
    inDrain = false;
    // Async pull: register _dataCallback to be notified when data arrives.
    // _dataCallback is cleared by push(), so we re-register each time.
    if (!lite._dataCallback && !lite._destroyed && !lite._ended) {
      lite._dataCallback = (evt, err) => {
        if (evt === 'error') { nr.destroy(err); return; }
        if (evt === 'end' || evt === 'close') { if (!nr.destroyed) nr.push(null); return; }
        // 'data' — new chunk available
        drain();
      };
    }
  }

  const nr = new external_node_stream_namespaceObject.Readable({
    objectMode: true,
    highWaterMark: Math.max(lite._hwm, 1),
    read() {
      // Pipeline is ready for more data — restore pull demand
      if (stream) stream._pipelineDemand = true;
      drain();
    },
  });
  lite.on('end', () => { if (!nr.destroyed) nr.push(null); });
  lite.on('error', (err) => nr.destroy(err));
  nr.on('error', noop);
  return nr;
}

/**
 * Direct feed: LiteReadable → nodeTransform.write() without Node Readable wrapper.
 * Eliminates _wrapLiteForPipeline overhead for single-hop pipeThrough chains.
 * Writes chunks directly from LiteReadable buffer to Node Transform.
 */
function _startDirectFeed(lite, nodeTransform, sourceStream) {
  if (sourceStream) sourceStream._pipelineDemand = true;

  let ended = false;
  let inFeed = false;

  function feedLoop() {
    if (inFeed || nodeTransform.destroyed || ended) return;
    inFeed = true;

    // Drain LiteReadable buffer → nodeTransform.write()
    let chunk;
    while ((chunk = lite.read()) !== null) {
      if (nodeTransform.destroyed) { inFeed = false; return; }
      if (!nodeTransform.write(chunk)) {
        // Backpressure from transform
        if (sourceStream) sourceStream._pipelineDemand = false;
        inFeed = false;
        nodeTransform.once('drain', () => {
          if (sourceStream) sourceStream._pipelineDemand = true;
          feedLoop();
        });
        return;
      }
    }

    if (lite._ended) { ended = true; inFeed = false; nodeTransform.end(); return; }

    // Sync pull: call _onRead directly
    if (lite._onRead && !lite._readableState.reading && !lite._readableState.ended && !lite._destroyed) {
      lite._readableState.reading = true;
      lite._onRead();
      lite._readableState.reading = false;
    }

    // Drain data enqueued by sync pull
    while ((chunk = lite.read()) !== null) {
      if (nodeTransform.destroyed) { inFeed = false; return; }
      if (!nodeTransform.write(chunk)) {
        if (sourceStream) sourceStream._pipelineDemand = false;
        inFeed = false;
        nodeTransform.once('drain', () => {
          if (sourceStream) sourceStream._pipelineDemand = true;
          feedLoop();
        });
        return;
      }
    }

    if (lite._ended) { ended = true; inFeed = false; nodeTransform.end(); return; }
    inFeed = false;

    // Async pull: register _dataCallback for notification when data arrives
    if (!lite._dataCallback && !lite._destroyed && !lite._ended) {
      lite._dataCallback = (evt, err) => {
        if (evt === 'error') { if (!nodeTransform.destroyed) nodeTransform.destroy(err); return; }
        if (evt === 'end' || evt === 'close') {
          if (!ended && !nodeTransform.destroyed) { ended = true; nodeTransform.end(); }
          return;
        }
        // 'data' — new chunk available
        feedLoop();
      };
    }
  }

  // Error from transform → destroy source
  nodeTransform.on('error', (err) => {
    if (!lite._destroyed) lite.destroy(err);
  });

  feedLoop();
}

/**
 * Direct feed: native ReadableStream → nodeTransform via Node Readable bridge.
 * Readable.fromWeb() buffers chunks (HWM=64), sync feedLoop drains in batches.
 * Eliminates per-chunk Promise on the write side; batches amortize read Promises.
 */
function _startNativeDirectFeed(nativeSource, nodeTransform) {
  const nodeReadable = external_node_stream_namespaceObject.Readable.fromWeb(nativeSource, { objectMode: true, highWaterMark: 64 });

  function feedLoop() {
    let chunk;
    while ((chunk = nodeReadable.read()) !== null) {
      if (nodeTransform.destroyed) { nodeReadable.destroy(); return; }
      if (!nodeTransform.write(chunk)) {
        nodeTransform.once('drain', feedLoop);
        return;
      }
    }
    // Buffer empty — wait for more data
    if (!nodeReadable.readableEnded) {
      nodeReadable.once('readable', feedLoop);
    }
  }

  nodeReadable.on('end', () => { if (!nodeTransform.destroyed) nodeTransform.end(); });
  nodeReadable.on('error', (err) => { if (!nodeTransform.destroyed) nodeTransform.destroy(err); });
  nodeTransform.on('error', (err) => { if (!nodeReadable.destroyed) nodeReadable.destroy(err); });

  feedLoop();
}

/**
 * Collect the full pipeline chain by walking upstream links.
 * Returns an array of Node.js streams: [source, ...transforms, dest]
 * Wraps LiteReadable instances in Node Readable for pipeline compatibility.
 */
function collectPipelineChain(readable, destination) {
  const chain = [];

  // Walk upstream from this readable (build forward, reverse once — O(n) vs O(n²))
  let current = readable;
  while (current) {
    const nr = current[kNodeReadable];
    // LiteReadable (byte streams) needs a Node Readable wrapper for pipeline
    chain.push(nr instanceof LiteReadable ? _wrapLiteForPipeline(nr, current) : nr);
    current = current[kUpstream];
  }
  chain.reverse();

  // Add destination
  chain.push(destination[kNodeWritable]);

  return chain;
}

/**
 * Tier 0 fast path: pipe Fast→Fast via Node.js pipeline().
 * Walks upstream links and builds a single pipeline() call.
 */
function fastPipelineTo(source, dest, signal) {
  utils_stats.tier0_pipeline++;
  const chain = collectPipelineChain(source, dest);
  const onDone = () => {
    source._closed = true;
    if (kWritableState in dest) {
      dest[kWritableState] = 'closed';
    }
  };
  if (signal) {
    return (0,promises_namespaceObject.pipeline)(...chain, { signal }).then(onDone);
  }
  return new Promise((resolve, reject) => {
    (0,external_node_stream_namespaceObject.pipeline)(...chain, (err) => {
      if (!err) {
        onDone();
        resolve(undefined);
      } else {
        reject(err);
      }
    });
  });
}


/**
 * Initialize a native-only readable shell (delegates everything to native ReadableStream).
 */
function _initNativeReadableShell(target, nativeStream) {
  utils_stats.nativeOnlyReadable++;
  // Property order must match FastReadableStream constructor for monomorphic hidden class
  target[kNodeReadable] = null;
  target[kLock] = null;
  target[kMaterialized] = nativeStream;
  target[kUpstream] = null;
  target[kNativeOnly] = true;
  target._closed = false;
  target._errored = false;
  target._cancel = null;
  target._storedError = undefined;
  target._onPull = null;
  target._isByteStream = false;
  target._controller = null;
  target._byteSource = null;
  target._pullLock = null;
  target._pullAgain = false;
  target._pullFn = null;
  target._onChunkRead = null;
  target._byteStreamSyncPull = false;
  return target;
}

/**
 * Bridge a kNativeOnly readable into a proper FastReadableStream.
 * Reads from the native reader and enqueues into a Fast controller.
 * Cost: 1 Promise per chunk (native reader.read()), but enables
 * downstream Fast transforms to use Node.js pipeline (zero promises per chunk).
 */
/** Bridge from an already-materialized native stream (used by deferred pipeTo resolution). */
function _bridgeNativeToFast_fromStream(nativeStream) {
  utils_stats.bridge++;
  const nativeReader = nativeStream.getReader();
  return new FastReadableStream({
    pull(controller) {
      return nativeReader.read().then(function pump({ value, done }) {
        if (done) { controller.close(); return; }
        controller.enqueue(value);
        if (controller.desiredSize > 0) {
          return nativeReader.read().then(pump);
        }
      });
    },
    cancel(reason) {
      return nativeReader.cancel(reason);
    },
  }, { highWaterMark: 64 });
}

function _bridgeNativeToFast(nativeOnlyStream) {
  _stats.bridge++;
  const nativeStream = materializeReadable(nativeOnlyStream);
  const nativeReader = nativeStream.getReader();
  return new FastReadableStream({
    pull(controller) {
      return nativeReader.read().then(function pump({ value, done }) {
        if (done) { controller.close(); return; }
        controller.enqueue(value);
        // Batch: drain native reader while HWM headroom exists.
        // Chains reads within a single pull call, eliminating the
        // pull coordinator roundtrip (queueMicrotask + read(0) + pullFn)
        // between consecutive chunks.
        if (controller.desiredSize > 0) {
          return nativeReader.read().then(pump);
        }
      });
    },
    cancel(reason) {
      return nativeReader.cancel(reason);
    },
  }, { highWaterMark: 64 });
}

class FastReadableStream {
  /**
   * Static from() — delegates to native ReadableStream.from()
   * Wraps result in a FastReadableStream shell so .constructor checks pass
   */
  static from(asyncIterable) {
    const native = NativeReadableStream.from(asyncIterable);
    return _initNativeReadableShell(Object.create(FastReadableStream.prototype), native);
  }

  constructor(underlyingSource, strategy) {
    // Per WebIDL: undefined → empty dictionary; null and non-objects → TypeError
    if (underlyingSource === undefined) {
      underlyingSource = {};
    } else if (
      underlyingSource === null ||
      (typeof underlyingSource !== 'object' && typeof underlyingSource !== 'function')
    ) {
      throw new TypeError('underlyingSource must be an object');
    }

    // Access strategy FIRST (IDL layer) before underlying source (method body per spec)
    let strategySize, strategyHWM;
    if (strategy != null && typeof strategy === 'object') {
      strategySize = strategy.size;
      strategyHWM = strategy.highWaterMark;
    }

    // Validate strategy.size
    if (strategySize !== undefined && typeof strategySize !== 'function') {
      throw new TypeError('size must be a function');
    }

    // NOW access underlying source properties (method body per spec)
    const typeRaw = underlyingSource.type;
    const type = typeRaw === undefined ? undefined : String(typeRaw);
    const pull = underlyingSource.pull;
    const start = underlyingSource.start;
    const cancel = underlyingSource.cancel;

    // Validate type
    if (type === 'bytes') {
      // Pure-pull byte streams (no start, no custom size, no autoAllocate):
      // Delegate entirely to native. The read loop stays in C++ with zero
      // JS-layer overhead. Avoids creating a LiteReadable + controller that
      // getReader() would immediately discard in favor of a native stream.
      // Streams with start() are excluded because the user saves the controller
      // for external enqueue (React Flight pattern) — these need our fast path.
      if (pull && !start && !strategySize && underlyingSource.autoAllocateChunkSize === undefined) {
        _initNativeReadableShell(this, new NativeReadableStream(underlyingSource, strategy));
        return;
      }

      // Delegate to native only when the pull callback needs a real
      // ReadableByteStreamController (byobRequest/respond/respondWithNewView),
      // or when autoAllocateChunkSize or custom size() is used.
      // Byte streams with start/cancel only use enqueue/close/error on the
      // controller, which our FastReadableStreamDefaultController supports.
      // BYOB/tee fallback uses dual-write materialization (see materialize.js).
      if (typeof strategySize === 'function' || underlyingSource.autoAllocateChunkSize !== undefined) {
        const native = new NativeReadableStream(underlyingSource, strategy);
        const shell = Object.create(native);
        _initNativeReadableShell(shell, native);
        shell.getReader = function(opts) { return FastReadableStream.prototype.getReader.call(this, opts); };
        shell.pipeTo = function(dest, opts) { return FastReadableStream.prototype.pipeTo.call(this, dest, opts); };
        shell.pipeThrough = function(t, opts) { return FastReadableStream.prototype.pipeThrough.call(this, t, opts); };
        shell.tee = function() { return FastReadableStream.prototype.tee.call(this); };
        shell.cancel = function(r) { return FastReadableStream.prototype.cancel.call(this, r); };
        shell._cancelInternal = FastReadableStream.prototype._cancelInternal;
        shell.values = function(opts) { return FastReadableStream.prototype.values.call(this, opts); };
        shell[Symbol.asyncIterator] = FastReadableStream.prototype[Symbol.asyncIterator];
        const lockedDesc = Object.getOwnPropertyDescriptor(FastReadableStream.prototype, 'locked');
        if (lockedDesc) {
          Object.defineProperty(shell, 'locked', {
            get() { return lockedDesc.get.call(this); },
            configurable: true,
          });
        }
        return shell;
      }
      // Otherwise: use fast Node.js path, mark as byte-capable
      // Fall through to normal constructor below
    }
    if (type !== undefined && type !== 'bytes') {
      throw new TypeError(`Invalid type: ${type}`);
    }

    // Validate callbacks
    if (cancel !== undefined && typeof cancel !== 'function') {
      throw new TypeError('cancel must be a function');
    }
    if (pull !== undefined && typeof pull !== 'function') {
      throw new TypeError('pull must be a function');
    }
    if (start !== undefined && typeof start !== 'function') {
      throw new TypeError('start must be a function');
    }

    // If strategy has a custom size(), delegate to native
    if (typeof strategySize === 'function') {
      _initNativeReadableShell(this, new NativeReadableStream(underlyingSource, strategy));
      return;
    }

    // Validate and resolve strategy highWaterMark
    // Byte streams default to 0 per spec (unlike default-type which defaults to 1)
    const defaultHWM = type === 'bytes' ? 0 : 1;
    const hwm =
      strategyHWM !== undefined
        ? (() => {
            const h = Number(strategyHWM);
            if (Number.isNaN(h) || h < 0) throw new RangeError('Invalid highWaterMark');
            return h;
          })()
        : defaultHWM;

    let controller;
    let startCompleted = false;

    // Byte streams use LiteReadable (lightweight array buffer, ~5µs faster construction).
    // Default-type streams use Node.js Readable (needed for pipeline/pipe compatibility).
    const useLite = type === 'bytes';

    // _pullLock is shared between Node _read and native byte stream pull
    // (from materializeReadableAsBytes). Prevents double-calling user's pull.
    // Exposed on the stream so materializeReadableAsBytes can coordinate.
    const stream = this;

    const pullFn = pull ? () => {
      if (!startCompleted) {
        nodeReadable._readableState.reading = false;
        return;
      }
      if (stream._pullLock) {
        // Async pull in progress (Promise): always wait for it to complete.
        // Per spec ([[pullAgain]]), pull must not be called again until its
        // promise fulfills. Mark _pullAgain so the .then() handler re-pulls.
        if (stream._pullLock !== true) {
          stream._pullAgain = true;
          return;
        }
        // Sync pull lock (true): only block auto-pulls with no HWM headroom.
        // Demand-driven reader.read() bypasses sync lock (pull already completed).
        if (useLite && nodeReadable._isAutoPull && controller.desiredSize !== null && controller.desiredSize <= 0) return;
        if (!useLite) return;
      }
      // Byte streams: only pull when there's demand (desiredSize > 0 or pending reads).
      // _pipelineDemand: pipeline mode — demand comes from Node pipeline, not WHATWG reader.
      // Node Readable HWM provides backpressure; desiredSize guard not needed.
      if (useLite && !stream._pipelineDemand && controller.desiredSize !== null && controller.desiredSize <= 0) {
        const reader = stream[kLock];
        const hasPendingReads = reader && reader._pendingReadCount && reader._pendingReadCount() > 0;
        const hasPendingPullIntos = controller[kHasPendingPullInto] && controller[kHasPendingPullInto]();
        if (!hasPendingReads && !hasPendingPullIntos) {
          nodeReadable._readableState.reading = false;
          return;
        }
      }
      try {
        const result = pull.call(underlyingSource, controller);
        if (isThenable(result)) {
          stream._pullLock = result;
          result.then(
            () => {
              stream._pullLock = null;
              // Per spec [[pullAgain]]: only re-pull if something requested
              // a pull while the previous one was in progress (e.g., enqueue
              // triggered maybeReadMore, or reader.read() called read(0)).
              // Without this guard, the .then() → read(0) → pullFn chain
              // creates an infinite microtask loop.
              if (stream._pullAgain) {
                stream._pullAgain = false;
                nodeReadable._readableState.reading = false;
                if (!nodeReadable.destroyed) nodeReadable.read(0);
              }
            },
            (err) => {
              stream._pullLock = null;
              stream._pullAgain = false;
              if (!nodeReadable.destroyed) controller.error(err);
            },
          );
        }
        // Sync pull completed: set pull lock for one microtask.
        // Prevents auto-pull from double-calling pull before the pull's
        // microtask settles. Reader.read()'s direct read(0) bypasses this
        // by resetting _readableState.reading before calling read(0).
        if (useLite && !isThenable(result)) {
          stream._pullLock = true;
          queueMicrotask(() => {
            stream._pullLock = null;
          });
        }
      } catch (e) {
        if (!nodeReadable.destroyed) controller.error(e);
      }
    } : null;

    const nodeReadable = useLite
      ? new LiteReadable(hwm === Infinity ? 0x7fffffff : hwm)
      : new external_node_stream_namespaceObject.Readable({
          objectMode: true,
          highWaterMark: hwm === Infinity ? 0x7fffffff : hwm,
          read() { if (pullFn) pullFn(); },
        });

    if (useLite) {
      if (pullFn) nodeReadable._onRead = pullFn;
    } else {
      nodeReadable.on('error', noop);
    }

    controller = new FastReadableStreamDefaultController(nodeReadable, hwm);
    controller._stream = this;
    // Byte streams: add byobRequest as own property (not on prototype — that's
    // ReadableStreamDefaultController which doesn't have byobRequest per spec).
    // Delegates to controller[kGetByobRequest]() for pending pull-into descriptors.
    if (type === 'bytes') {
      Object.defineProperty(controller, 'byobRequest', _byobRequestDescriptor);
    }
    this._controller = controller;

    this[kNodeReadable] = nodeReadable;
    this[kLock] = null;
    this[kMaterialized] = null;
    this[kUpstream] = null;
    this[kNativeOnly] = false;
    this._closed = false;
    this._errored = false;
    this._cancel = cancel;
    this._storedError = undefined;
    this._onPull = null;
    this._isByteStream = type === 'bytes';
    this._byteSource = type === 'bytes' ? underlyingSource : null;
    this._pullLock = null;
    this._pullAgain = false;
    this._pullFn = pullFn;
    this._pipelineDemand = false;

    // Pre-bound chunk-read callback for byte streams (consolidates kDequeueBytes + onPull + pull-after-read).
    // For non-byte default-type streams, null → zero overhead on the 3.4x-native fast path.
    if (type === 'bytes') {
      const ctrl = controller;
      const nr = nodeReadable;
      // A1: For HWM=0 byte streams, desiredSize is always ≤0 after kDequeueBytes,
      // so the pull-after-read check never passes. Skip it entirely.
      this._onChunkRead = (pullFn && hwm > 0)
        ? (chunk) => {
            ctrl[kDequeueBytes](chunk);
            const ds = ctrl.desiredSize;
            if (ds !== null && ds > 0 && ds - (chunk.byteLength || 0) <= 0) {
              nr._readableState.reading = false;
              nr.read(0);
            }
          }
        : (chunk) => { ctrl[kDequeueBytes](chunk); };
    } else {
      this._onChunkRead = null;
    }

    // A3: Byte stream HWM=0 sync pull marker — reader.read() skips empty buffer check
    this._byteStreamSyncPull = (type === 'bytes' && !!pullFn && hwm === 0);

    utils_stats.readableCreated++;

    // For byte streams (hwm=0), pull is demand-driven — triggered by pending reads,
    // not by HWM headroom. Always try read(0) so pull fires if a read is waiting.
    const shouldAutoPull = hwm > 0 || type === 'bytes';

    if (start) {
      const startResult = start.call(underlyingSource, controller);
      if (isThenable(startResult)) {
        startResult.then(
          () => {
            startCompleted = true;
            if (pull && !nodeReadable.destroyed && shouldAutoPull) {
              nodeReadable.read(0);
            }
          },
          (err) => {
            controller.error(err);
          },
        );
      } else {
        // Sync start — per spec, start "completes" via microtask
        queueMicrotask(() => {
          startCompleted = true;
          if (pull && !nodeReadable.destroyed && shouldAutoPull) {
            nodeReadable.read(0);
          }
        });
      }
    } else {
      // No start — per spec, start completes via resolved promise's .then()
      queueMicrotask(() => {
        startCompleted = true;
        if (pull && !nodeReadable.destroyed && shouldAutoPull) {
          nodeReadable.read(0);
        }
      });
    }
  }

  /**
   * pipeTo(destination, options) — returns Promise<void>
   *
   * Three-tier routing:
   *   Tier 0: kNativeOnly → delegate to native pipeTo (C++ speed)
   *   Tier 1: Fast→Fast, no options → Node.js pipeline() (zero-promise fast path)
   *   Tier 2: Mixed/options → specPipeTo (full WHATWG compliance)
   */
  pipeTo(destination, options) {
    try {
      // Brand check: must have internal state (not just Object.create(prototype))
      if (!(kNodeReadable in this) && !(kMaterialized in this)) {
        throw new TypeError('pipeTo called on non-ReadableStream');
      }
      // Validate destination
      if (!_isWritableStream(destination)) {
        throw new TypeError('pipeTo destination must be a WritableStream');
      }

      // Access option getters in spec order (alphabetical per Web IDL)
      let preventAbort = false,
        preventCancel = false,
        preventClose = false,
        signal;
      if (options !== undefined && options !== null) {
        if (typeof options !== 'object' && typeof options !== 'function') {
          throw new TypeError('options must be an object');
        }
        preventAbort = !!options.preventAbort;
        preventCancel = !!options.preventCancel;
        preventClose = !!options.preventClose;
        signal = options.signal;
      }

      if (signal !== undefined) {
        try {
          if (signal === null || typeof signal !== 'object' || typeof signal.aborted !== 'boolean') {
            throw new TypeError('options.signal must be an AbortSignal');
          }
        } catch {
          throw new TypeError('options.signal must be an AbortSignal');
        }
      }

      // Tier 0: kNativeOnly source → delegate to native pipeTo (C++ speed)
      // Use NativeReadableStream.prototype.pipeTo directly to avoid recursion
      // when kMaterialized === this (self-referential native shell from patch.js).
      if (this[kNativeOnly]) {
        const nativeSrc = materialize_materializeReadable(this);
        const nativeDst = isFastWritable(destination) ? materializeWritable(destination) : destination;
        return NativeReadableStream.prototype.pipeTo.call(nativeSrc, nativeDst, { preventAbort, preventCancel, preventClose, signal });
      }

      if (this[kLock]) {
        return Promise.reject(new TypeError('ReadableStream is locked'));
      }
      if (destination.locked) {
        return Promise.reject(new TypeError('WritableStream is locked'));
      }

      // Resolve deferred native sources in upstream chain: bridge for pipeTo
      // (enables pipeline chain). Walks all upstream nodes because chained
      // pipeThrough stores _nativeSource on an intermediate readable.
      {
        let _cur = this;
        while (_cur) {
          if (_cur._nativeSource) {
            const bridged = _bridgeNativeToFast_fromStream(_cur._nativeSource);
            bridged[kUpstream] = _cur[kUpstream];
            _cur[kUpstream] = bridged;
            if (!_cur._upstreamWritable) _cur._upstreamWritable = _cur._nativeSourceWritable;
            _cur._nativeSource = null;
            _cur._nativeSourceWritable = null;
          }
          _cur = _cur[kUpstream];
        }
      }

      // Tier 0: pipeThrough chain with upstream links → Node.js pipeline()
      // Supports default options OR signal-only (pipeline supports AbortSignal).
      // preventAbort/preventCancel/preventClose require spec-compliant handling.
      const isPipelineCompatible = !preventAbort && !preventCancel && !preventClose;
      if (
        isPipelineCompatible &&
        this[kUpstream] &&
        isFastWritable(destination) &&
        !destination[kNativeOnly] &&
        destination[kNodeWritable]
      ) {
        // LiteReadable (byte streams) auto-wrapped by collectPipelineChain
        return fastPipelineTo(this, destination, signal);
      }

      // Tier 0.5: upstream chain exists but can't use full pipeline.
      // Start specPipeTo for each upstream hop retroactively.
      if (this[kUpstream]) {
        const hops = [];
        let current = this;
        while (current[kUpstream]) {
          hops.push({ source: current[kUpstream], writable: current._upstreamWritable });
          const next = current[kUpstream];
          current[kUpstream] = null;
          current = next;
        }
        // Start each hop (they are independent: source→t1.writable, t1.readable→t2.writable, ...)
        for (const hop of hops) {
          if (hop.source && hop.writable) {
            specPipeTo(hop.source, hop.writable, {}).catch(noop);
          }
        }
      }

      // Tier 2: Spec-compliant (handles the last hop: this → destination)
      return specPipeTo(this, destination, { preventAbort, preventCancel, preventClose, signal });
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /**
   * pipeThrough(transform, options) — returns ReadableStream
   *
   * Three-tier routing:
   *   Tier 0: kNativeOnly → delegate to native pipeThrough, wrap result
   *   Tier 1: FastTransform, default options → upstream linking (deferred pipe)
   *   Tier 2: Mixed/options → specPipeTo (full WHATWG compliance)
   */
  pipeThrough(transform, options) {
    if (
      transform === null ||
      transform === undefined ||
      (typeof transform !== 'object' && typeof transform !== 'function')
    ) {
      throw new TypeError('transform must be an object');
    }

    // Per spec: access readable BEFORE writable
    const readable = transform.readable;
    if (!_isReadableStream(readable)) {
      throw new TypeError('transform.readable must be a ReadableStream');
    }

    const writable = transform.writable;
    if (!_isWritableStream(writable)) {
      throw new TypeError('transform.writable must be a WritableStream');
    }

    if (this[kLock]) {
      throw new TypeError('ReadableStream is locked');
    }

    if (writable.locked) {
      throw new TypeError('WritableStream is locked');
    }

    // Eagerly access option getters per Web IDL (alphabetical order)
    let preventAbort = false,
      preventCancel = false,
      preventClose = false,
      signal;
    if (options !== undefined && options !== null && (typeof options === 'object' || typeof options === 'function')) {
      preventAbort = !!options.preventAbort;
      preventCancel = !!options.preventCancel;
      preventClose = !!options.preventClose;
      signal = options.signal;
    }

    if (signal !== undefined) {
      try {
        if (signal === null || typeof signal !== 'object' || typeof signal.aborted !== 'boolean') {
          throw new TypeError('options.signal must be an AbortSignal');
        }
      } catch {
        throw new TypeError('options.signal must be an AbortSignal');
      }
    }

    // Tier 0: kNativeOnly source → deferred resolution for transform
    if (this[kNativeOnly]) {
      // Store native source for deferred resolution at getReader/pipeTo time.
      // - getReader: native pipeTo into materialized writable (C++ pipe, 0 Promises/chunk)
      // - pipeTo: bridge + upstream linking → pipeline (batched Promises, full chain)
      if (
        isFastWritable(writable) && !writable[kNativeOnly] &&
        isFastReadable(readable) && !readable[kNativeOnly]
      ) {
        readable._nativeSource = materialize_materializeReadable(this);
        readable._nativeSourceWritable = writable;
        return readable;
      }
      // Fallback: cascade to native (transform is not fully Fast)
      // Use native prototype method to avoid recursion for self-referential kMaterialized.
      const nativeSrc = materialize_materializeReadable(this);
      const nativeDst = isFastWritable(writable) ? materializeWritable(writable) : writable;
      const nativeRd = isFastReadable(readable) ? materialize_materializeReadable(readable) : readable;
      NativeReadableStream.prototype.pipeThrough.call(nativeSrc,
        { writable: nativeDst, readable: nativeRd },
        { preventAbort, preventCancel, preventClose, signal },
      );
      // Return the original readable (Fast shell or native) — the pipe is running
      return readable;
    }

    // Tier 1: FastTransform, default options → upstream linking (deferred pipe)
    // Just sets kUpstream. pipeTo resolves the chain:
    //   - Default opts + Fast dest → fastPipelineTo (Tier 0, zero promises)
    //   - Otherwise → retroactive specPipeTo for each hop
    const isDefaultOpts = !preventAbort && !preventCancel && !preventClose && !signal;
    if (isDefaultOpts && isFastTransform(transform)) {
      readable[kUpstream] = this;
      readable._upstreamWritable = writable; // for retroactive specPipeTo
      return readable;
    }

    // Tier 1.5: Non-Fast transform with native readable/writable (e.g. CompressionStream).
    // Materialize the source and use native pipeThrough — keeps entire pipe in C++,
    // avoiding the JS promise chain per chunk from specPipeTo.
    if (!isFastReadable(readable) && !isFastWritable(writable)) {
      const nativeSrc = materialize_materializeReadable(this);
      NativeReadableStream.prototype.pipeThrough.call(nativeSrc,
        { writable, readable },
        { preventAbort, preventCancel, preventClose, signal },
      );
      return readable;
    }

    // Tier 2: Spec-compliant — use internal pipeTo (not this.pipeTo) per spec
    const pipePromise = specPipeTo(this, writable, {
      preventAbort,
      preventCancel,
      preventClose,
      signal,
    });
    // Mark as handled (spec: set [[PromiseIsHandled]] to true)
    pipePromise.catch(noop);

    return readable;
  }

  /**
   * getReader(options) — returns a reader
   *
   * Tier 1: Default reader (sync fast path)
   * Tier 2: BYOB mode → delegate to native
   */
  getReader(options) {
    if (options !== undefined && options !== null && typeof options !== 'object') {
      throw new TypeError('options must be an object');
    }
    const mode = options ? (options.mode === undefined ? undefined : String(options.mode)) : undefined;
    if (mode === 'byob') {
      // Standalone BYOB reader handles lock check and kLock directly
      return new FastReadableStreamBYOBReader(this);
    }
    if (mode !== undefined) {
      throw new TypeError(`Invalid mode: ${mode}`);
    }

    // For native-only streams (byte, custom size), delegate reader too.
    // Use native prototype method to avoid recursion for self-referential kMaterialized.
    if (this[kNativeOnly]) {
      return NativeReadableStream.prototype.getReader.call(materialize_materializeReadable(this), options);
    }

    // Native delegation for pull-only byte streams: create native stream, return native reader.
    // Entire read loop stays in C++ — eliminates Promise/object allocation overhead.
    // Gate: byte stream + pull + no start (controller not saved externally) + no upstream + empty buffer.
    if (this._isByteStream && this._pullFn && !this[kUpstream] && !this._nativeSource &&
        !this._byteSource.start && this[kNodeReadable].readableLength === 0) {
      const us = this._byteSource;
      const userPull = us.pull;
      const userCancel = us.cancel;
      const nativeSource = { type: 'bytes' };
      nativeSource.pull = function(controller) {
        return userPull.call(us, controller);
      };
      if (userCancel) {
        nativeSource.cancel = function(reason) {
          return userCancel.call(us, reason);
        };
      }
      // Disable Fast pull coordinator (prevent auto-pull microtask from firing)
      this[kNodeReadable]._onRead = null;
      this[kLock] = 'native-delegate';
      utils_stats.tier1_getReader++;
      const hwm = this[kNodeReadable]._hwm;
      return NativeReadableStream.prototype.getReader.call(
        new NativeReadableStream(nativeSource, hwm > 0 ? { highWaterMark: hwm } : undefined)
      );
    }

    // Resolve deferred native sources: use C++ pipeTo for zero-promise first hop.
    // Data flows: native → materializedWritable → Node Transform → reader reads output.
    // Walks all upstream nodes for chained pipeThrough.
    {
      let _cur = this;
      while (_cur) {
        if (_cur._nativeSource) {
          utils_stats.bridge++;
          const writable = _cur._nativeSourceWritable;

          // Native delegation: single-hop kNativeOnly → FastTransformStream → getReader()
          // Create native TransformStream with same transformer, keep entire pipeline in C++.
          if (_cur === this && !this[kUpstream] && writable?._isTransformShell) {
            const ts = writable._transformStream;
            if (ts?._transformer) {
              const nativeTS = new NativeTransformStream(ts._transformer);
              NativeReadableStream.prototype.pipeTo.call(
                _cur._nativeSource, nativeTS.writable
              ).catch(noop);
              _cur._nativeSource = null;
              _cur._nativeSourceWritable = null;
              this[kLock] = 'native-delegate';
              return NativeReadableStream.prototype.getReader.call(nativeTS.readable);
            }
          }

          const nodeWritable = writable?.[kNodeWritable];
          if (nodeWritable && typeof nodeWritable.write === 'function') {
            // Direct feed: native reader → nodeTransform.write() (skip Writable.toWeb)
            _startNativeDirectFeed(_cur._nativeSource, nodeWritable);
          } else {
            // Fallback: materialize + native pipeTo
            const nativeWritable = materializeWritable(writable);
            NativeReadableStream.prototype.pipeTo.call(
              _cur._nativeSource, nativeWritable,
            ).catch(noop); // errors propagate via Node Transform
          }
          _cur._nativeSource = null;
          _cur._nativeSourceWritable = null;
        }
        _cur = _cur[kUpstream];
      }
    }

    // Resolve upstream chain when getReader() is called on pipeThrough result.
    // Prefer Tier 0 (Node.js pipeline) over specPipeTo — pipeline processes
    // chunks without Promise chains (~3.5µs saved per chunk).
    if (this[kUpstream]) {
      const upstream = this[kUpstream];

      // Native delegation: pull-only byte stream → transform(no start) → getReader()
      // Creates all-C++ pipeline, eliminates JS per-chunk overhead.
      if (!upstream[kUpstream] &&                                    // single hop
          upstream._isByteStream && upstream._pullFn &&              // byte stream with pull
          !upstream._byteSource?.start &&                            // no start (controller not saved)
          upstream[kNodeReadable].readableLength === 0 &&            // empty buffer
          this._upstreamWritable?._isTransformShell) {               // transform writable
        const ts = this._upstreamWritable._transformStream;
        if (ts?._transformer && !ts._transformer.start) {            // transformer without start
          const us = upstream._byteSource;
          const userPull = us.pull;
          const userCancel = us.cancel;
          const nativeSource = { type: 'bytes' };
          nativeSource.pull = function(controller) {
            return userPull.call(us, controller);
          };
          if (userCancel) {
            nativeSource.cancel = function(reason) {
              return userCancel.call(us, reason);
            };
          }
          const hwm = upstream[kNodeReadable]._hwm;
          const nativeRS = new NativeReadableStream(
            nativeSource, hwm > 0 ? { highWaterMark: hwm } : undefined
          );
          const nativeTS = new NativeTransformStream(ts._transformer);
          NativeReadableStream.prototype.pipeTo.call(
            nativeRS, nativeTS.writable
          ).catch(noop);

          upstream[kNodeReadable]._onRead = null;
          upstream[kLock] = 'native-delegate';
          this[kUpstream] = null;
          this._upstreamWritable = null;
          this[kLock] = 'native-delegate';
          utils_stats.tier1_getReader++;
          return NativeReadableStream.prototype.getReader.call(nativeTS.readable);
        }
      }

      // Single-hop LiteReadable → Transform: direct feed (skip pipeline wrapper)
      // Writes chunks directly from LiteReadable to nodeTransform.write(),
      // eliminating _wrapLiteForPipeline overhead (~4.6x faster).
      if (!upstream[kUpstream] &&
          upstream[kNodeReadable] instanceof LiteReadable &&
          this[kNodeReadable] && typeof this[kNodeReadable].write === 'function') {
        utils_stats.tier0_pipeline++;
        const lite = upstream[kNodeReadable];
        const nodeTransform = this[kNodeReadable];
        this[kUpstream] = null;
        this._upstreamWritable = null;
        _startDirectFeed(lite, nodeTransform, upstream);
      } else {
        // Multi-hop or non-LiteReadable: full pipeline chain
        // Tier 0 for getReader: build pipeline chain, data flows into last
        // transform's Node buffer. Reader reads from there (Tier 1 sync).
        // LiteReadable (byte streams) auto-wrapped by collectPipelineChain.
        utils_stats.tier0_pipeline++;
        const chain = [];
        let current = this;
        while (current) {
          const nr = current[kNodeReadable];
          chain.push(nr instanceof LiteReadable ? _wrapLiteForPipeline(nr, current) : nr);
          current = current[kUpstream];
        }
        chain.reverse();
        // Clear all upstream links
        current = this;
        while (current[kUpstream]) {
          const next = current[kUpstream];
          current[kUpstream] = null;
          current._upstreamWritable = null;
          current = next;
        }
        // Start pipeline — data flows source → transforms → last transform's buffer
        (0,external_node_stream_namespaceObject.pipeline)(chain, (err) => {
          if (err) {
            this._errored = true;
            this._storedError = err;
          }
        });
      }
    }

    utils_stats.tier1_getReader++;
    return new FastReadableStreamDefaultReader(this);
  }

  /**
   * tee() — Pure JS implementation of ReadableStreamDefaultTee
   * Preserves error identity and cancel reason aggregation.
   */
  tee() {
    if (this[kLock]) {
      throw new TypeError('ReadableStream is locked');
    }

    // For native-only streams, or byte streams with pull (which may use
    // byobRequest on the source controller), delegate to native tee.
    // Byte streams without pull (start+enqueue pattern, e.g. React Flight)
    // use the fast JS readLoop below.
    if (this[kNativeOnly] || (this._isByteStream && this._pullFn)) {
      // Use native prototype method to avoid recursion for self-referential kMaterialized.
      const nativeStream = this[kNativeOnly]
        ? materialize_materializeReadable(this)
        : materializeReadableAsBytes(this);
      const [b1, b2] = NativeReadableStream.prototype.tee.call(nativeStream);
      return [
        _initNativeReadableShell(Object.create(FastReadableStream.prototype), b1),
        _initNativeReadableShell(Object.create(FastReadableStream.prototype), b2),
      ];
    }

    const isByteTee = this._isByteStream;
    // For byte streams: use FastReadableStreamDefaultReader directly to bypass
    // getReader()'s native delegation (we need _readWithCallbacks on the reader).
    // For default-type: use getReader() to preserve existing behavior.
    const reader = isByteTee ? new FastReadableStreamDefaultReader(this) : this.getReader();
    let canceled1 = false;
    let canceled2 = false;
    let reason1, reason2;
    let branch1Controller, branch2Controller;
    let cancelResolve;
    const cancelPromise = new Promise((resolve) => {
      cancelResolve = resolve;
    });

    function cancel1Algorithm(reason) {
      canceled1 = true;
      reason1 = reason;
      if (canceled2) {
        const compositeReason = [reason1, reason2];
        const cancelResult = reader.cancel(compositeReason);
        cancelResolve(cancelResult);
      }
      return cancelPromise;
    }

    function cancel2Algorithm(reason) {
      canceled2 = true;
      reason2 = reason;
      if (canceled1) {
        const compositeReason = [reason1, reason2];
        const cancelResult = reader.cancel(compositeReason);
        cancelResolve(cancelResult);
      }
      return cancelPromise;
    }

    // Branch source config — byte tee creates byte-type branches
    const branchSource = isByteTee
      ? { type: 'bytes' }
      : {};

    const branch1 = new FastReadableStream(
      Object.assign(branchSource, {
        start(c) {
          branch1Controller = c;
        },
        pull() {
          return readLoop();
        },
        cancel(reason) {
          return cancel1Algorithm(reason);
        },
      }),
      { highWaterMark: 0 },
    );

    const branch2 = new FastReadableStream(
      Object.assign(isByteTee ? { type: 'bytes' } : {}, {
        start(c) {
          branch2Controller = c;
        },
        pull() {
          return readLoop();
        },
        cancel(reason) {
          return cancel2Algorithm(reason);
        },
      }),
      { highWaterMark: 0 },
    );

    let reading = false;
    let readAgain = false;
    function readLoop() {
      if (reading) {
        // For byte tee: don't set readAgain — extra source pulls break WPT pull-count tests.
        // For default-type: set readAgain so concurrent drain works.
        if (!isByteTee) readAgain = true;
        // Return undefined (not RESOLVED_UNDEFINED) — RESOLVED_UNDEFINED is a thenable
        // which would cause the branch's pullFn to set pullLock and schedule infinite
        // re-reads via microtasks while reading is still true.
        return;
      }
      reading = true;
      // Use _readWithCallbacks to avoid {value,done} objects in promise resolution.
      // Promise.resolve({value,done}) triggers ECMAScript thenable check on the object,
      // which is observable when Object.prototype.then is patched (WPT then-interception test).
      return reader._readWithCallbacks(
        isByteTee
          ? (value) => {
              // Byte tee: use _enqueueInternal (skips buffer.transfer) and clone for branch2
              if (!canceled1 && !canceled2) {
                try { branch1Controller[kEnqueueInternal](value); } catch {}
                try { branch2Controller[kEnqueueInternal](value.slice(0)); } catch {}
              } else if (!canceled1) {
                try { branch1Controller[kEnqueueInternal](value); } catch {}
              } else if (!canceled2) {
                try { branch2Controller[kEnqueueInternal](value); } catch {}
              }
              reading = false;
            }
          : (value) => {
              const ra = readAgain;
              readAgain = false;
              try {
                if (!canceled1 && branch1Controller) branch1Controller.enqueue(value);
              } catch {}
              try {
                if (!canceled2 && branch2Controller) branch2Controller.enqueue(value);
              } catch {}
              reading = false;
              if (ra) readLoop();
            },
        () => {
          reading = false;
          // For byte tee: close pending BYOB pull-intos before close
          // (close doesn't auto-resolve them; respond(0) path doesn't apply in tee context)
          if (isByteTee) {
            try { if (!canceled1 && branch1Controller) branch1Controller[kClosePendingPullIntos]?.(); } catch {}
            try { if (!canceled2 && branch2Controller) branch2Controller[kClosePendingPullIntos]?.(); } catch {}
          }
          try {
            if (!canceled1 && branch1Controller) branch1Controller.close();
          } catch {}
          try {
            if (!canceled2 && branch2Controller) branch2Controller.close();
          } catch {}
          // Don't resolve cancelPromise when both branches are already canceled —
          // the cancel algorithm handles cancelResolve with the source's cancel result.
          if (!(canceled1 && canceled2)) cancelResolve(undefined);
        },
        (r) => {
          reading = false;
          try {
            if (!canceled1 && branch1Controller) branch1Controller.error(r);
          } catch {}
          try {
            if (!canceled2 && branch2Controller) branch2Controller.error(r);
          } catch {}
          if (!(canceled1 && canceled2)) cancelResolve(undefined);
        },
      );
    }

    // Propagate source close/errors to both branches
    reader.closed.then(
      () => {
        // Source closed — close both branches
        if (isByteTee) {
          try { if (!canceled1 && branch1Controller) branch1Controller[kClosePendingPullIntos]?.(); } catch {}
          try { if (!canceled2 && branch2Controller) branch2Controller[kClosePendingPullIntos]?.(); } catch {}
        }
        try {
          if (!canceled1 && branch1Controller) branch1Controller.close();
        } catch {}
        try {
          if (!canceled2 && branch2Controller) branch2Controller.close();
        } catch {}
        if (!(canceled1 && canceled2)) cancelResolve(undefined);
      },
      (r) => {
        // Source errored — error both branches
        try {
          if (!canceled1 && branch1Controller) branch1Controller.error(r);
        } catch {}
        try {
          if (!canceled2 && branch2Controller) branch2Controller.error(r);
        } catch {}
        if (!(canceled1 && canceled2)) cancelResolve(undefined);
      },
    );

    return [branch1, branch2];
  }

  /**
   * Internal cancel — bypasses lock check (called by reader.cancel())
   */
  _cancelInternal(reason) {
    // For native-only streams, delegate.
    // Use native prototype method to avoid recursion for self-referential kMaterialized.
    if (this[kNativeOnly]) {
      return NativeReadableStream.prototype.cancel.call(materialize_materializeReadable(this), reason);
    }

    // Per spec: if errored, reject immediately
    if (this._errored) {
      return Promise.reject(this._storedError);
    }
    // Per spec: if already closed, resolve immediately
    if (this._closed) {
      return Promise.resolve(undefined);
    }

    // Per spec: set state to "closed" synchronously BEFORE calling cancel
    this._closed = true;

    // Fulfill pending BYOB reads with {done: true, value: undefined}
    if (this._controller && this._controller[kCancelPendingPullIntos]) {
      this._controller[kCancelPendingPullIntos]();
    }

    // Per spec: resolve reader's closedPromise synchronously
    const reader = this[kLock];
    if (reader && reader._resolveClosedFromCancel) {
      reader._resolveClosedFromCancel();
    }

    // Call underlyingSource.cancel and return its result
    let cancelResult;
    try {
      cancelResult = this._cancel ? this._cancel(reason) : undefined;
    } catch (e) {
      if (this[kNodeReadable] && !this[kNodeReadable].destroyed) {
        this[kNodeReadable].destroy(null);
      }
      return Promise.reject(e);
    }
    // Skip destroy if cancel handler signals not to (e.g., transform during flush)
    if (cancelResult !== kSkipDestroy) {
      if (this[kNodeReadable] && !this[kNodeReadable].destroyed) {
        this[kNodeReadable].destroy(null);
      }
    }
    const resolvedResult = cancelResult === kSkipDestroy ? undefined : cancelResult;
    return Promise.resolve(resolvedResult).then(() => undefined);
  }

  /**
   * cancel(reason) — public API, checks lock
   */
  cancel(reason) {
    if (this[kLock]) {
      return Promise.reject(new TypeError('ReadableStream is locked'));
    }
    return this._cancelInternal(reason);
  }

  get locked() {
    if (this[kNativeOnly]) {
      // Self-referential shell (patch.js): native internal slots on `this` — use native getter
      if (this[kMaterialized] === this) return _nativeLockedGetter.call(this);
      // Wrapper shell: delegate to the wrapped native stream
      if (this[kMaterialized]) return this[kMaterialized].locked;
    }
    return this[kLock] !== null;
  }

  // Async iteration support — uses our reader for proper cancel wiring
  values(options) {
    // For kNativeOnly streams, delegate to native values() for C++ iterator speed
    if (this[kNativeOnly]) {
      return NativeReadableStream.prototype.values.call(materialize_materializeReadable(this), options);
    }

    const preventCancel = !!(options && options.preventCancel);
    const reader = this.getReader();

    const iterator = Object.create(_getAsyncIteratorPrototype());
    iterator[kIterReader] = reader;
    iterator[kIterDone] = false;
    iterator[kIterPreventCancel] = preventCancel;
    iterator[kIterOngoing] = null;

    return iterator;
  }

  [Symbol.asyncIterator](options) {
    return this.values(options);
  }
}

// Place NativeReadableStream.prototype in the prototype chain so that
// Function.prototype[Symbol.hasInstance].call(NativeReadableStream, fastInstance)
// returns true. This satisfies undici's WebIDL brand check on Node 24+
// (webidl.is.ReadableStream) which uses a prototype chain walk that bypasses
// our Symbol.hasInstance override.
Object.setPrototypeOf(FastReadableStream.prototype, NativeReadableStream.prototype);

// Shadow Node.js internal symbols that exist as getters on NativeReadableStream.prototype.
// These access C++ internal slots and would throw on Fast instances. Undici's extractBody
// calls isDisturbed/isErrored which read these symbols.
const _kDisturbed = Symbol.for('nodejs.stream.disturbed');
const _kErrored = Symbol.for('nodejs.stream.errored');
const _kReadable = Symbol.for('nodejs.stream.readable');

Object.defineProperty(FastReadableStream.prototype, _kDisturbed, {
  get() { return this[kLock] !== null; },
  configurable: true,
});
Object.defineProperty(FastReadableStream.prototype, _kErrored, {
  get() { return this._errored ? (this._storedError || true) : false; },
  configurable: true,
});
Object.defineProperty(FastReadableStream.prototype, _kReadable, {
  get() { return (this._closed || this._errored) ? false : true; },
  configurable: true,
});

// Suppress structured clone/transfer symbols inherited from NativeReadableStream.prototype.
// Fast streams don't support structured clone transfer — these inherited getters would
// access C++ internal slots and throw.
for (const sym of Object.getOwnPropertySymbols(NativeReadableStream.prototype)) {
  const desc = sym.description;
  if (desc && (desc.includes('transfer') || desc.includes('deserialize'))) {
    Object.defineProperty(FastReadableStream.prototype, sym, {
      value: undefined, configurable: true, writable: true,
    });
  }
}

;// CONCATENATED MODULE: ../../node_modules/.pnpm/experimental-fast-webstreams@0.0.18/node_modules/experimental-fast-webstreams/src/transform.js
/**
 * FastTransformStream — WHATWG TransformStream API backed by Node.js Transform.
 *
 * The .readable and .writable getters return shell FastReadableStream/FastWritableStream
 * instances that share the same underlying Node Transform (Transform extends Duplex).
 */








/**
 * Error the transform's writable side via the proper state machine.
 * Uses _writableControllerError which transitions through erroring → errored,
 * properly handling in-flight writes and pending aborts.
 */
function _errorTransformWritable(transformSelf, reason) {
  const writable = transformSelf.writable;

  // For transform shells: clear in-flight write that may never complete
  // (Node transform callbacks don't fire after destroy).
  // Must clear BEFORE _controllerError so _finishErroring can run.
  // But DON'T clear if we're inside an active transform callback —
  // the callback will fire and should handle the write rejection.
  if (writable._isTransformShell && writable[kInFlightWriteRequest] && !transformSelf._inTransformCallback) {
    const req = writable[kInFlightWriteRequest];
    writable[kInFlightWriteRequest] = null;
    req.reject(reason);
  }

  _controllerError(writable, reason);
}

class FastTransformStream {
  #readable = null;
  #writable = null;

  constructor(transformer = {}, writableStrategy, readableStrategy) {
    if (transformer === null) {
      transformer = {};
    }

    const transform = transformer.transform;
    const flush = transformer.flush;
    const start = transformer.start;
    const cancel = transformer.cancel;
    const readableType = transformer.readableType;
    const writableType = transformer.writableType;

    if (readableType !== undefined) {
      throw new RangeError(`Invalid readableType: ${readableType}`);
    }
    if (writableType !== undefined) {
      throw new RangeError(`Invalid writableType: ${writableType}`);
    }

    if (transform !== undefined && typeof transform !== 'function') {
      throw new TypeError('transform must be a function');
    }
    if (flush !== undefined && typeof flush !== 'function') {
      throw new TypeError('flush must be a function');
    }
    if (start !== undefined && typeof start !== 'function') {
      throw new TypeError('start must be a function');
    }

    // If either strategy has a custom size(), delegate to native
    if (
      (writableStrategy && typeof writableStrategy.size === 'function') ||
      (readableStrategy && typeof readableStrategy.size === 'function')
    ) {
      utils_stats.nativeOnlyTransform++;
      const native = new NativeTransformStream(transformer, writableStrategy, readableStrategy);
      this[kNodeTransform] = null;
      this.#readable = _initNativeReadableShell(Object.create(FastReadableStream.prototype), native.readable);
      this.#writable = _initNativeWritableShell(Object.create(FastWritableStream.prototype), native.writable);
      return;
    }

    const readableHWM = resolveHWM(readableStrategy, 0);
    const writableHWM = resolveHWM(writableStrategy);
    let controller;
    let startPromise = null;
    const self = this;

    const nodeTransform = new external_node_stream_namespaceObject.Transform({
      objectMode: true,
      readableHighWaterMark: readableHWM === Infinity ? 0x7fffffff : readableHWM,
      writableHighWaterMark: writableHWM === Infinity ? 0x7fffffff : writableHWM,
      transform(chunk, encoding, callback) {
        const doTransform = () => {
          if (!transform) {
            callback(null, chunk);
            return;
          }
          try {
            const result = Reflect.apply(transform, transformer, [chunk, controller]);
            if (isThenable(result)) {
              result.then(() => callback(), callback);
            } else {
              callback();
            }
          } catch (e) {
            callback(e);
          }
        };
        if (startPromise) {
          startPromise.then(doTransform, callback);
        } else {
          doTransform();
        }
      },
      flush(callback) {
        // If cancel was already called (from readable.cancel()), skip flush
        if (self._cancelCalled) {
          callback();
          return;
        }
        self._flushStarted = true;
        const doFlush = () => {
          if (!flush) {
            callback();
            return;
          }
          try {
            const result = Reflect.apply(flush, transformer, [controller]);
            if (isThenable(result)) {
              result.then(() => callback(), callback);
            } else {
              callback();
            }
          } catch (e) {
            callback(e);
          }
        };
        if (startPromise) {
          startPromise.then(doFlush, callback);
        } else {
          doFlush();
        }
      },
      destroy(err, callback) {
        // Only call cancel from destroy if there's no pending abort that will
        // handle it via sinkAbort (which needs to catch thrown errors).
        const writable = self.writable;
        const hasPendingAbort = writable && writable[kPendingAbortRequest];
        if (err && cancel && typeof cancel === 'function' && !self._cancelCalled && !hasPendingAbort) {
          self._cancelCalled = true;
          try {
            const result = Reflect.apply(cancel, transformer, [err]);
            if (isThenable(result)) {
              result.then(
                () => callback(err),
                () => callback(err),
              );
              return;
            }
          } catch {
            // ignore errors from cancel in destroy
          }
        }
        callback(err);
      },
    });

    // Prevent unhandled 'error' events from crashing
    nodeTransform.on('error', noop);

    controller = new FastTransformStreamDefaultController(nodeTransform);
    controller._setTransformStream(this);

    utils_stats.transformCreated++;
    this[kNodeTransform] = nodeTransform;

    this._transformerCancel = cancel || null;
    this._transformer = transformer;
    this._cancelCalled = false;
    this._cancelPromise = null;
    this._flushStarted = false;
    this._inTransformCallback = false;
    this._controller = controller;

    // Method for controller.terminate() and controller.error() to error the writable side
    this._errorWritable = (reason) => _errorTransformWritable(this, reason);

    // Track start completion for writable shell's kStarted
    this._startCompleted = false;

    const onStartCompleted = () => {
      startPromise = null;
      self._startCompleted = true;
      // Per spec: after start, update backpressure based on readable desiredSize.
      // If readable has room (desiredSize > 0), clear backpressure to allow writes.
      // Do this BEFORE advancing the queue so write processing sees correct backpressure.
      if (self._controller) {
        self._controller._updateBackpressure();
      }
      // If writable shell was already created, set kStarted and advance queue
      if (self.#writable && !self.#writable[kStarted]) {
        self.#writable[kStarted] = true;
        _advanceQueueIfNeeded(self.#writable);
      }
    };

    if (start) {
      const startResult = Reflect.apply(start, transformer, [controller]);
      if (isThenable(startResult)) {
        startPromise = startResult;
        startResult.then(
          () => {
            queueMicrotask(onStartCompleted);
          },
          (err) => {
            const e = err || new Error('start() failed');
            // Error both sides per spec
            if (self._controller) {
              try {
                self._controller.error(e);
              } catch {}
            }
            if (!nodeTransform.destroyed) nodeTransform.destroy(e);
            queueMicrotask(onStartCompleted);
          },
        );
      } else {
        // Sync start — defer completion via microtask (per spec)
        queueMicrotask(onStartCompleted);
      }
    } else {
      queueMicrotask(onStartCompleted);
    }
  }

  get readable() {
    if (!this.#readable) {
      const transform = this[kNodeTransform];
      const cancelFn = this._transformerCancel;
      const transformerObj = this._transformer;

      this.#readable = Object.create(FastReadableStream.prototype);
      // Property order must match FastReadableStream constructor for monomorphic hidden class
      this.#readable[kNodeReadable] = transform;
      this.#readable[kLock] = null;
      this.#readable[kMaterialized] = null;
      this.#readable[kUpstream] = null;
      this.#readable[kNativeOnly] = false;
      this.#readable._closed = false;
      this.#readable._errored = false;
      // _cancel and _storedError set below; _onPull set below
      this.#readable._cancel = null; // replaced below
      this.#readable._storedError = undefined;

      // Wire pull notification: clears transform backpressure when reader demands data
      const transformSelf = this;
      this.#readable._onPull = () => {
        if (transformSelf._controller) {
          transformSelf._controller._updateBackpressure();
        }
      };

      // Wire cancel: readable.cancel() → transformer.cancel() + error writable
      this.#readable._cancel = (reason) => {
        // Mark controller as errored (prevents enqueue after cancel)
        if (transformSelf._controller && transformSelf._controller._markErrored) {
          transformSelf._controller._markErrored();
        }

        // If flush is already in progress, skip cancel and don't error writable.
        // Return a special signal to _cancelInternal to NOT destroy the node stream.
        if (transformSelf._flushStarted) {
          return kSkipDestroy;
        }

        // Capture writable error state BEFORE cancel handler runs
        const errorBefore = transformSelf.writable[kStoredError];

        let cancelResult;
        if (cancelFn && !transformSelf._cancelCalled) {
          transformSelf._cancelCalled = true;
          try {
            cancelResult = Reflect.apply(cancelFn, transformerObj, [reason]);
          } catch (e) {
            // Sync throw: error writable immediately
            _errorTransformWritable(transformSelf, e);
            return Promise.reject(e);
          }
        }

        // Capture writable error state AFTER cancel handler ran.
        // Only if the cancel handler CAUSED a new error (e.g., by calling
        // writable.abort()), should we propagate it.
        const errorAfterCancel = transformSelf.writable[kStoredError];
        const cancelCausedError = errorAfterCancel !== errorBefore;

        // Per spec (TransformStreamDefaultSourceCancelAlgorithm step 7):
        // After cancel resolves, if writable is errored due to the cancel handler,
        // throw the writable's stored error.
        const checkWritableError = () => {
          const writable = transformSelf.writable;
          const writableState = writable[kWritableState];
          if (
            cancelCausedError &&
            (writableState === 'errored' || writableState === 'erroring') &&
            writable[kStoredError] !== undefined
          ) {
            throw writable[kStoredError];
          }
          // Error writable with cancel reason if not already errored
          _errorTransformWritable(transformSelf, reason);
        };

        let cancelPromise;
        if (isThenable(cancelResult)) {
          cancelPromise = cancelResult.then(checkWritableError, (e) => {
            _errorTransformWritable(transformSelf, e);
            throw e;
          });
        } else {
          // Sync cancel: defer writable error check to next microtask
          cancelPromise = Promise.resolve().then(checkWritableError);
        }
        transformSelf._cancelPromise = cancelPromise;
        return cancelPromise;
      };
    }
    return this.#readable;
  }

  get writable() {
    if (!this.#writable) {
      const nodeTransform = this[kNodeTransform];
      this.#writable = Object.create(FastWritableStream.prototype);
      this.#writable[kNodeWritable] = nodeTransform;
      this.#writable[kLock] = null;
      this.#writable[kMaterialized] = null;
      this.#writable[kNativeOnly] = false;

      // Initialize state machine fields for the writable shell
      this.#writable[kWritableState] = 'writable';
      this.#writable[kStoredError] = undefined;
      this.#writable[kPendingAbortRequest] = null;
      this.#writable[kInFlightWriteRequest] = null;
      this.#writable[kInFlightCloseRequest] = null;
      this.#writable[kWriteRequests] = [];
      this.#writable[kCloseRequest] = null;
      // Per spec: kStarted reflects start completion. If start already completed, set true.
      this.#writable[kStarted] = this._startCompleted;
      this.#writable._startPromise = null;
      this.#writable._hwm = nodeTransform.writableHighWaterMark;
      this.#writable._sinkWrite = null;
      this.#writable._sinkClose = null;
      this.#writable._controller = null;
      this.#writable._isTransformShell = true;
      // Store original _transform and install stable dispatch wrapper (avoids per-write monkey-patching)
      this.#writable._origTransform = nodeTransform._transform;
      this.#writable._transformWriteCallback = null;
      const writableShell = this.#writable;
      nodeTransform._transform = function (c, enc, cb) {
        if (writableShell._transformWriteCallback) {
          writableShell._transformWriteCallback(null, null, cb);
        } else {
          writableShell._origTransform.call(this, c, enc, cb);
        }
      };
      this.#writable._transformReadable = () => this.readable;
      this.#writable._transformStream = this;
      this.#writable._transformBackpressure = true;
      this.#writable._transformBackpressureResolve = null;

      // Wire transformer.cancel as the abort handler for the writable side
      const transformSelf = this;
      if (this._transformerCancel) {
        const cancelFn = this._transformerCancel;
        const transformerObj = this._transformer;
        this.#writable._sinkAbort = (reason) => {
          if (transformSelf._cancelCalled) {
            // Cancel already running from readable.cancel() — throw stored error so abort rejects
            const storedError = transformSelf.writable[kStoredError];
            if (storedError !== undefined) throw storedError;
            return undefined;
          }
          transformSelf._cancelCalled = true;
          // Per spec: also error the readable side
          const readable = transformSelf.readable;
          const readableErrorBefore = readable._storedError;
          try {
            const result = Reflect.apply(cancelFn, transformerObj, [reason]);
            // Normal path: error readable with abort reason
            if (readable && readable._errored !== true) {
              const ctrl = transformSelf._controller;
              if (ctrl)
                try {
                  ctrl.error(reason);
                } catch {}
            }
            // For async cancel: after it resolves, check if cancel called controller.error()
            if (isThenable(result)) {
              return result.then(() => {
                if (readable._errored && readable._storedError !== readableErrorBefore) {
                  throw readable._storedError;
                }
              });
            }
            return result;
          } catch (e) {
            // Cancel threw: error readable with THROWN error
            if (readable && readable._errored !== true) {
              const ctrl = transformSelf._controller;
              if (ctrl)
                try {
                  ctrl.error(e);
                } catch {}
            }
            throw e; // Propagate to abort rejection
          }
        };
        this.#writable._underlyingSink = transformerObj;
      } else {
        this.#writable._sinkAbort = null;
        this.#writable._underlyingSink = {};
      }
    }
    return this.#writable;
  }
}

;// CONCATENATED MODULE: ../../node_modules/.pnpm/experimental-fast-webstreams@0.0.18/node_modules/experimental-fast-webstreams/src/index.js









;// CONCATENATED MODULE: ../../node_modules/.pnpm/experimental-fast-webstreams@0.0.18/node_modules/experimental-fast-webstreams/src/patch.js
/**
 * Global patcher: replaces the built-in ReadableStream, WritableStream,
 * and TransformStream with fast alternatives.
 *
 * IMPORTANT: The native constructors are captured by src/natives.js at import
 * time, BEFORE this module can overwrite globalThis. Our internal code imports
 * from natives.js, so it continues to use the real originals.
 *
 * Usage:
 *   import { patchGlobalWebStreams, unpatchGlobalWebStreams } from 'experimental-fast-webstreams';
 *   patchGlobalWebStreams();    // globalThis.ReadableStream is now FastReadableStream, etc.
 *   unpatchGlobalWebStreams();  // restores the original native constructors
 */







// Capture the original Response.body getter for wrapping.
const _origBodyGetter = typeof Response !== 'undefined'
  ? Object.getOwnPropertyDescriptor(Response.prototype, 'body')?.get
  : null;
const _bodyCache = new WeakMap();

// Save original Symbol.hasInstance descriptors for unpatch.
// getOwnPropertyDescriptor returns undefined if there's no OWN hasInstance
// (inherited from Function.prototype). Fall back to the default so native
// objects still pass instanceof checks (needed for Response, fetch, etc.).
const _defaultHasInstance = { value: Function.prototype[Symbol.hasInstance], configurable: true };
const _origHasInstanceRS = Object.getOwnPropertyDescriptor(NativeReadableStream, Symbol.hasInstance) || _defaultHasInstance;
const _origHasInstanceWS = Object.getOwnPropertyDescriptor(NativeWritableStream, Symbol.hasInstance) || _defaultHasInstance;
const _origHasInstanceTS = Object.getOwnPropertyDescriptor(NativeTransformStream, Symbol.hasInstance) || _defaultHasInstance;

// Save original native prototype methods for patching/unpatching.
// React's renderToReadableStream() returns a native ReadableStream (created via
// node:stream/web, not globalThis.ReadableStream). Its .pipeThrough() is the
// native method, bypassing our fast path entirely. By patching the native prototype,
// we intercept these calls when the target is a FastTransformStream/FastWritableStream.
const _origNativePipeThrough = NativeReadableStream.prototype.pipeThrough;
const _origNativePipeTo = NativeReadableStream.prototype.pipeTo;

/**
 * Replace the global stream constructors with fast alternatives.
 *
 * Also overrides Symbol.hasInstance on the native constructors so that
 * `fastStream instanceof NativeReadableStream` returns true. This is
 * required because Node.js internals (e.g. Readable.fromWeb, HTTP response
 * streaming) hold references to the original native constructors and use
 * instanceof checks.
 */
// Wrapper constructor for globalThis.ReadableStream.
// Byte streams with pull (e.g. undici/fetch) depend on C++ internal slots of
// ReadableByteStreamController. We create a native stream wrapped as a
// kNativeOnly Fast shell so downstream consumers get the fast path.
function _PatchedReadableStream(underlyingSource, strategy) {
  if (
    underlyingSource != null &&
    (typeof underlyingSource === 'object' || typeof underlyingSource === 'function') &&
    underlyingSource.type === 'bytes' &&
    typeof underlyingSource.pull === 'function'
  ) {
    // Return genuine native stream with Fast methods bolted on.
    // Must keep native internal slots so undici WebIDL brand checks pass
    // (new Response(stream) needs webidl.is.ReadableStream to succeed).
    // Object.create(native) does NOT preserve internal slots — they're
    // per-object, not inherited. Instead, add Fast methods directly.
    const native = new NativeReadableStream(underlyingSource, strategy);
    _initNativeReadableShell(native, native);
    native.getReader = function(opts) { return FastReadableStream.prototype.getReader.call(this, opts); };
    // Delegate to native when counterpart isn't Fast — this object has native
    // internal slots so native pipeThrough/pipeTo work correctly.
    native.pipeTo = function(dest, opts) {
      if (!isFastWritable(dest)) return NativeReadableStream.prototype.pipeTo.call(this, dest, opts);
      return FastReadableStream.prototype.pipeTo.call(this, dest, opts);
    };
    native.pipeThrough = function(t, opts) {
      if (!isFastTransform(t)) return NativeReadableStream.prototype.pipeThrough.call(this, t, opts);
      return FastReadableStream.prototype.pipeThrough.call(this, t, opts);
    };
    native.tee = function() { return FastReadableStream.prototype.tee.call(this); };
    native.cancel = function(r) { return FastReadableStream.prototype.cancel.call(this, r); };
    native._cancelInternal = FastReadableStream.prototype._cancelInternal;
    native.values = function(opts) { return FastReadableStream.prototype.values.call(this, opts); };
    native[Symbol.asyncIterator] = FastReadableStream.prototype[Symbol.asyncIterator];
    const lockedDesc = Object.getOwnPropertyDescriptor(FastReadableStream.prototype, 'locked');
    if (lockedDesc) {
      Object.defineProperty(native, 'locked', {
        get() { return lockedDesc.get.call(this); },
        configurable: true,
      });
    }
    return native;
  }
  return new FastReadableStream(underlyingSource, strategy);
}
_PatchedReadableStream.prototype = FastReadableStream.prototype;
_PatchedReadableStream.from = FastReadableStream.from;
// Must accept native ReadableStream instances too (byte streams with pull
// return genuine native objects). Without this, undici's
// `obj instanceof globalThis.ReadableStream` fails for byte streams because
// native prototype chain doesn't include FastReadableStream.prototype.
Object.defineProperty(_PatchedReadableStream, Symbol.hasInstance, {
  value(instance) {
    return instance instanceof FastReadableStream
      || instance instanceof NativeReadableStream
      || isFastReadable(instance);
  },
  configurable: true,
});

function patchGlobalWebStreams(options) {
  const opts = options || {};
  globalThis.ReadableStream = _PatchedReadableStream;
  if (!opts.skipWritable) {
    globalThis.WritableStream = FastWritableStream;
  }
  if (!opts.skipTransform) {
    globalThis.TransformStream = FastTransformStream;
  }
  globalThis.ByteLengthQueuingStrategy = NativeByteLengthQueuingStrategy;
  globalThis.CountQueuingStrategy = NativeCountQueuingStrategy;

  // Wrap Response.body to return a kNativeOnly FastReadableStream shell.
  // This enables downstream Fast pipeThrough/pipeTo to use deferred resolution
  // → pipeline() instead of falling through to native pipeTo (triple promise/chunk).
  if (_origBodyGetter) {
    Object.defineProperty(Response.prototype, 'body', {
      get() {
        const nativeBody = _origBodyGetter.call(this);
        if (!nativeBody || isFastReadable(nativeBody)) return nativeBody;
        let wrapper = _bodyCache.get(this);
        if (!wrapper) {
          wrapper = _initNativeReadableShell(Object.create(FastReadableStream.prototype), nativeBody);
          _bodyCache.set(this, wrapper);
        }
        return wrapper;
      },
      configurable: true,
      enumerable: true,
    });
  }

  // Patch native ReadableStream.prototype so that native streams (e.g. from
  // React's renderToReadableStream, node:stream/web) use our fast path when
  // piping through FastTransformStreams or to FastWritableStreams.
  // Without this, the entire Next.js 8-transform SSR pipeline runs through
  // native JS promise chains (~2 promises/chunk/hop) instead of Node.js pipeline().
  NativeReadableStream.prototype.pipeThrough = function pipeThrough(transform, options) {
    if (isFastTransform(transform)) {
      // Wrap this native stream in a kNativeOnly shell so our pipeThrough
      // can do deferred resolution → upstream linking → pipeline().
      const shell = isFastReadable(this)
        ? this  // already a Fast stream (e.g. from patched constructor)
        : _initNativeReadableShell(Object.create(FastReadableStream.prototype), this);
      return FastReadableStream.prototype.pipeThrough.call(shell, transform, options);
    }
    return _origNativePipeThrough.call(this, transform, options);
  };
  NativeReadableStream.prototype.pipeTo = function pipeTo(dest, options) {
    if (isFastWritable(dest)) {
      const shell = isFastReadable(this)
        ? this
        : _initNativeReadableShell(Object.create(FastReadableStream.prototype), this);
      return FastReadableStream.prototype.pipeTo.call(shell, dest, options);
    }
    return _origNativePipeTo.call(this, dest, options);
  };

  // Make Fast instances pass instanceof checks against the captured native constructors.
  Object.defineProperty(NativeReadableStream, Symbol.hasInstance, {
    value(instance) {
      if (_origHasInstanceRS) {
        try { if (_origHasInstanceRS.value.call(NativeReadableStream, instance)) return true; } catch {}
      }
      return instance instanceof FastReadableStream || isFastReadable(instance);
    },
    configurable: true,
  });
  if (!opts.skipWritable) {
    Object.defineProperty(NativeWritableStream, Symbol.hasInstance, {
      value(instance) {
        if (_origHasInstanceWS) {
          try { if (_origHasInstanceWS.value.call(NativeWritableStream, instance)) return true; } catch {}
        }
        return instance instanceof FastWritableStream || isFastWritable(instance);
      },
      configurable: true,
    });
  }
  if (!opts.skipTransform) {
    Object.defineProperty(NativeTransformStream, Symbol.hasInstance, {
      value(instance) {
        if (_origHasInstanceTS) {
          try { if (_origHasInstanceTS.value.call(NativeTransformStream, instance)) return true; } catch {}
        }
        return instance instanceof FastTransformStream || isFastTransform(instance);
      },
      configurable: true,
    });
  }
}

/**
 * Restore the original native stream constructors and Symbol.hasInstance.
 */
function unpatchGlobalWebStreams() {
  globalThis.ReadableStream = NativeReadableStream;
  globalThis.WritableStream = NativeWritableStream;
  globalThis.TransformStream = NativeTransformStream;
  globalThis.ByteLengthQueuingStrategy = NativeByteLengthQueuingStrategy;
  globalThis.CountQueuingStrategy = NativeCountQueuingStrategy;

  // Restore native prototype methods
  NativeReadableStream.prototype.pipeThrough = _origNativePipeThrough;
  NativeReadableStream.prototype.pipeTo = _origNativePipeTo;

  // Restore original Response.body getter
  if (_origBodyGetter) {
    Object.defineProperty(Response.prototype, 'body', {
      get: _origBodyGetter,
      configurable: true,
      enumerable: true,
    });
  }

  // Restore original Symbol.hasInstance
  if (_origHasInstanceRS) {
    Object.defineProperty(NativeReadableStream, Symbol.hasInstance, _origHasInstanceRS);
  } else {
    delete NativeReadableStream[Symbol.hasInstance];
  }
  if (_origHasInstanceWS) {
    Object.defineProperty(NativeWritableStream, Symbol.hasInstance, _origHasInstanceWS);
  } else {
    delete NativeWritableStream[Symbol.hasInstance];
  }
  if (_origHasInstanceTS) {
    Object.defineProperty(NativeTransformStream, Symbol.hasInstance, _origHasInstanceTS);
  } else {
    delete NativeTransformStream[Symbol.hasInstance];
  }
}

module.exports = __webpack_exports__;
/******/ })()
;