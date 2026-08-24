/**
 * Agent-scoped HMR batching (experimental).
 *
 * An AI coding agent edits a project in many small steps: rename a component,
 * then update its three call sites, then add the prop it now needs. Every one
 * of those writes is a file change, so the dev server compiles it and pushes an
 * HMR update. The preview in the browser therefore walks through every
 * intermediate state the agent passed through — including the ones that only
 * make sense half-finished — and the human watching it sees a flicker of
 * broken renders and error overlays that nobody asked to look at. Meanwhile the
 * agent, which is the party that could actually act on a compile error, only
 * learns about it if it thinks to go read the error state.
 *
 * A batch inverts that. The agent opens one around a multi-step edit, and for
 * as long as it is open every message that would change what the browser is
 * showing is held back instead of delivered, so the preview keeps rendering
 * the last output that compiled. When the agent closes the batch:
 *
 * - if the code compiles, the held messages are flushed as one coalesced burst,
 *   so the preview goes straight from the last good state to the new good state
 *   and never renders anything in between;
 * - if it does not compile, nothing is flushed — the preview stays on the last
 *   good state — and the errors are returned to the agent as the result of
 *   closing the batch, which is the moment it can still do something about
 *   them.
 *
 * Held messages are never dropped. A batch that ends on a compile error keeps
 * its queue, and the next clean compile drains it, so the browser always
 * catches up rather than being left permanently stale.
 *
 * This is deliberately inert unless a batch is open: with no batch, every
 * message takes exactly the path it took before. The only entry point is the
 * MCP tooling in `../mcp/tools/hmr-batch.ts`, which is registered only when
 * `experimental.agentHmrBatching` is set.
 */

import type {
  BuiltMessage,
  CompilationError,
  HmrMessageSentToBrowser,
  ServerErrorMessage,
  SyncMessage,
} from './hot-reloader-types'
import { HMR_MESSAGE_SENT_TO_BROWSER } from './hot-reloader-types'

/**
 * What an open batch does with a message.
 *
 * - `hold`: applying it changes what the browser renders, so it waits for the
 *   batch to end.
 * - `drop`: a transient signal that the flush at the end of the batch
 *   supersedes, so replaying it would only produce a stale flash.
 * - `pass`: unrelated to the rendered output (per-request plumbing, devtools
 *   state), so batching it would break features for no benefit.
 */
export type BatchDisposition = 'hold' | 'drop' | 'pass'

/**
 * Every message type, classified. A `Record` over the full union rather than a
 * `switch` with a default, so that adding an HMR message type does not silently
 * inherit `pass`: TypeScript reports the missing key and whoever adds it has to
 * decide whether it moves the preview.
 */
const BATCH_DISPOSITIONS: Record<
  HmrMessageSentToBrowser['type'],
  BatchDisposition
> = {
  // Applying new code, refetching, or reloading: all of these visibly move the
  // preview off the last good state.
  [HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_MESSAGE]: 'hold',
  [HMR_MESSAGE_SENT_TO_BROWSER.BUILT]: 'hold',
  [HMR_MESSAGE_SENT_TO_BROWSER.SYNC]: 'hold',
  [HMR_MESSAGE_SENT_TO_BROWSER.RELOAD_PAGE]: 'hold',
  [HMR_MESSAGE_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES]: 'hold',
  [HMR_MESSAGE_SENT_TO_BROWSER.STATIC_PARAMS_CHANGED]: 'hold',
  [HMR_MESSAGE_SENT_TO_BROWSER.MIDDLEWARE_CHANGES]: 'hold',
  [HMR_MESSAGE_SENT_TO_BROWSER.CLIENT_CHANGES]: 'hold',
  [HMR_MESSAGE_SENT_TO_BROWSER.SERVER_ONLY_CHANGES]: 'hold',
  [HMR_MESSAGE_SENT_TO_BROWSER.ADDED_PAGE]: 'hold',
  [HMR_MESSAGE_SENT_TO_BROWSER.REMOVED_PAGE]: 'hold',
  [HMR_MESSAGE_SENT_TO_BROWSER.DEV_PAGES_MANIFEST_UPDATE]: 'hold',
  // Raises the error overlay over the preview. Held so the agent, not the human
  // watching the preview, is the one who gets told.
  [HMR_MESSAGE_SENT_TO_BROWSER.SERVER_ERROR]: 'hold',

  // "Compiling…" for work the agent is driving. The flush at the end of the
  // batch reports the outcome, so replaying this would only flash an indicator
  // for a build that already finished.
  [HMR_MESSAGE_SENT_TO_BROWSER.BUILDING]: 'drop',

  // Per-request plumbing, devtools state, and indicators. None of them change
  // what the page renders, and holding them would break those features during
  // a batch for no benefit.
  [HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_CONNECTED]: 'pass',
  [HMR_MESSAGE_SENT_TO_BROWSER.ISR_MANIFEST]: 'pass',
  [HMR_MESSAGE_SENT_TO_BROWSER.CACHE_INDICATOR]: 'pass',
  [HMR_MESSAGE_SENT_TO_BROWSER.DEVTOOLS_CONFIG]: 'pass',
  [HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_CURRENT_ERROR_STATE]: 'pass',
  [HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_PAGE_METADATA]: 'pass',
  [HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_INSIGHTS_UPDATE]: 'pass',
  [HMR_MESSAGE_SENT_TO_BROWSER.REACT_DEBUG_CHUNK]: 'pass',
  [HMR_MESSAGE_SENT_TO_BROWSER.ERRORS_TO_SHOW_IN_BROWSER]: 'pass',
}

export function getBatchDisposition(
  type: HmrMessageSentToBrowser['type']
): BatchDisposition {
  // A message type the dev server sends but this table has not seen (only
  // reachable if the two get out of sync) is treated as unrelated to the
  // preview, which is the behaviour it had before batching existed.
  return BATCH_DISPOSITIONS[type] ?? 'pass'
}

/**
 * Message types that carry the whole current state, so that only the last one
 * matters and earlier copies can be dropped. Everything else is queued without
 * coalescing, because dropping an earlier copy would lose information:
 * Turbopack updates are incremental module patches that all have to be applied,
 * and `SERVER_ONLY_CHANGES` / `ADDED_PAGE` / `REMOVED_PAGE` each name a
 * different page.
 */
const COALESCING_MESSAGE_TYPES: ReadonlySet<HmrMessageSentToBrowser['type']> =
  new Set([
    HMR_MESSAGE_SENT_TO_BROWSER.BUILT,
    HMR_MESSAGE_SENT_TO_BROWSER.SYNC,
    HMR_MESSAGE_SENT_TO_BROWSER.RELOAD_PAGE,
    HMR_MESSAGE_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES,
    HMR_MESSAGE_SENT_TO_BROWSER.STATIC_PARAMS_CHANGED,
    HMR_MESSAGE_SENT_TO_BROWSER.MIDDLEWARE_CHANGES,
    HMR_MESSAGE_SENT_TO_BROWSER.CLIENT_CHANGES,
    HMR_MESSAGE_SENT_TO_BROWSER.DEV_PAGES_MANIFEST_UPDATE,
  ])

function getCoalesceKey(message: HmrMessageSentToBrowser): string | null {
  return COALESCING_MESSAGE_TYPES.has(message.type)
    ? String(message.type)
    : null
}

export interface AgentHmrBatchSettleOptions {
  /**
   * How long the compilation has to be quiet before the batch is considered
   * settled. The agent's last write and the recompile it triggers are not
   * synchronous with the call that closes the batch, so closing without
   * waiting would report "no errors" for a build that had not started.
   */
  quietMs?: number
  /**
   * How long to wait for a recompile to start at all. Some batches genuinely
   * change nothing the bundler cares about; those pay this once and return.
   */
  graceMs?: number
  /** Upper bound on the total settle wait. */
  maxWaitMs?: number
  /** Poll interval while waiting. */
  pollMs?: number
}

const DEFAULT_SETTLE: Required<AgentHmrBatchSettleOptions> = {
  quietMs: 300,
  graceMs: 2_000,
  maxWaitMs: 30_000,
  pollMs: 25,
}

/** Default lifetime of a batch before the watchdog closes it. */
export const DEFAULT_BATCH_TIMEOUT_MS = 30_000
export const MIN_BATCH_TIMEOUT_MS = 1_000
export const MAX_BATCH_TIMEOUT_MS = 300_000

/**
 * Cap on how many messages a single batch holds. A batch is a bounded editing
 * window, so hitting this means something is wrong (a runaway watcher loop, an
 * agent that never closes its batch and left the watchdog to do it). Growing
 * without bound would be worse than a flash of an intermediate state, so the
 * queue is flushed and the batch reports that it happened.
 */
export const MAX_QUEUED_MESSAGES = 512

export type AgentHmrBatchStatus =
  /** Held messages were delivered: the preview is on the new state. */
  | 'flushed'
  /** The batch ended on a compile error: the preview is on the last good state. */
  | 'withheld'
  /** Nothing to end. */
  | 'no-batch'
  /** `experimental.agentHmrBatching` is not enabled. */
  | 'disabled'

export interface AgentHmrBatchResult {
  status: AgentHmrBatchStatus
  batchId: string | null
  durationMs: number
  /** The watchdog closed this batch because the agent never did. */
  timedOut: boolean
  /**
   * Whether a compile result was observed while the batch was open. `false`
   * means the edits did not reach the bundler, so an empty `errors` is the
   * absence of evidence rather than a clean build.
   */
  compiled: boolean
  errors: CompilationError[]
  warnings: CompilationError[]
  heldMessageCount: number
  /** Counts per HMR message type, for debugging what a batch actually held. */
  heldMessageTypes: Record<string, number>
  droppedMessageCount: number
  /**
   * Whether the browser was kept on a single state for the whole batch. False
   * if the queue cap forced an early flush mid-batch.
   */
  previewPreserved: boolean
}

export interface AgentHmrBatchBeginResult {
  status: 'opened' | 'already-open' | 'disabled'
  batchId: string | null
  timeoutMs: number
}

export interface AgentHmrBatchStatusResult {
  enabled: boolean
  open: boolean
  batchId: string | null
  openedForMs: number | null
  heldMessageCount: number
  heldMessageTypes: Record<string, number>
  /** Messages held from a previous batch that ended on a compile error. */
  pendingFromPreviousBatch: number
  errors: CompilationError[]
  warnings: CompilationError[]
}

interface QueuedMessage {
  coalesceKey: string | null
  type: HmrMessageSentToBrowser['type']
  deliver: () => void
}

export interface AgentHmrBatchDeps {
  now?: () => number
  /**
   * Whether the bundler currently has a compilation in flight. Used to settle
   * a batch before reporting its errors; without it, settling falls back to
   * the quiet period alone.
   */
  isCompiling?: () => boolean
  logger?: Pick<Console, 'warn'>
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

function hasErrorsField(
  message: HmrMessageSentToBrowser
): message is BuiltMessage | SyncMessage {
  return (
    message.type === HMR_MESSAGE_SENT_TO_BROWSER.BUILT ||
    message.type === HMR_MESSAGE_SENT_TO_BROWSER.SYNC
  )
}

function describeServerError(message: ServerErrorMessage): CompilationError {
  let parsed: unknown
  try {
    parsed = JSON.parse(message.errorJSON)
  } catch {
    // The payload is opaque to us; report it verbatim rather than losing it.
    return { message: message.errorJSON }
  }

  const error = parsed as { message?: unknown; stack?: unknown }
  return {
    message:
      typeof error?.message === 'string' ? error.message : message.errorJSON,
    stack: typeof error?.stack === 'string' ? error.stack : undefined,
  }
}

export class AgentHmrBatchController {
  private enabled = false
  private batchId: string | null = null
  private openedAt = 0
  private batchCounter = 0

  /**
   * Held messages in delivery order. Keyed so a coalescing message can replace
   * its predecessor; entries that must not coalesce get a synthetic key. A
   * `Map` iterates in insertion order, and re-inserting moves an entry to the
   * end, which is what coalescing should do: the surviving copy is the newest,
   * so it belongs after everything queued since the copy it replaces.
   */
  private queue = new Map<string, QueuedMessage>()
  private queueSequence = 0
  private heldMessageTypes = new Map<HmrMessageSentToBrowser['type'], number>()
  private droppedMessageCount = 0
  private forcedFlush = false

  /**
   * Latest compile result seen while the batch was open. `SERVER_ERROR`
   * messages are appended to `errors` because they are also something the
   * agent needs to hear about, and they are cleared with the rest on the next
   * compile result.
   */
  private errors: CompilationError[] = []
  private warnings: CompilationError[] = []
  private serverErrors: CompilationError[] = []
  private sawCompileResult = false

  /** Bumped by any message crossing the gate; used to detect a quiet period. */
  private activityCount = 0
  private lastActivityAt = 0
  private activityCountAtOpen = 0

  private resumeCallbacks = new Set<() => void>()
  private watchdog: unknown = null
  /**
   * Result of a batch the watchdog closed, held until an `end` call collects
   * it. Without this, an agent that closed its batch late would be told there
   * was no batch, and never learn that its edits were released without it.
   */
  private pendingTimeoutResult: AgentHmrBatchResult | null = null

  private readonly now: () => number
  private readonly logger: Pick<Console, 'warn'>
  private readonly setTimer: (fn: () => void, ms: number) => unknown
  private readonly clearTimer: (handle: unknown) => void
  private isCompiling: (() => boolean) | undefined

  constructor(deps: AgentHmrBatchDeps = {}) {
    this.now = deps.now ?? Date.now
    this.logger = deps.logger ?? console
    this.isCompiling = deps.isCompiling
    this.setTimer =
      deps.setTimer ??
      ((fn, ms) => {
        const handle = setTimeout(fn, ms)
        // A dev-server watchdog must not be a reason for the process to stay
        // alive.
        handle.unref?.()
        return handle
      })
    this.clearTimer =
      deps.clearTimer ?? ((handle) => clearTimeout(handle as any))
  }

  /**
   * Wired from the hot reloader once the bundler exists. `enabled` mirrors
   * `experimental.agentHmrBatching`.
   */
  configure({
    enabled,
    isCompiling,
  }: {
    enabled?: boolean
    isCompiling?: () => boolean
  }): void {
    if (enabled !== undefined) {
      this.enabled = enabled
    }
    if (isCompiling !== undefined) {
      this.isCompiling = isCompiling
    }
  }

  /**
   * True while a batch is holding browser-visible updates. Callers that
   * maintain their own outbound queue (the Turbopack hot reloader keeps
   * per-client message and update queues) check this and skip their flush,
   * leaving the messages where they already are, and register an `onResume`
   * callback so the batch can drive that flush when it ends.
   */
  isHolding(): boolean {
    return this.batchId !== null
  }

  /**
   * Registers a flush for a queue this controller does not own. Called on
   * every batch flush, before the controller's own queue is drained, so that
   * bundler-level updates land ahead of the `BUILT` that concludes them —
   * the order they arrive in outside a batch.
   */
  onResume(callback: () => void): () => void {
    this.resumeCallbacks.add(callback)
    return () => {
      this.resumeCallbacks.delete(callback)
    }
  }

  /**
   * The gate every HMR delivery point calls.
   *
   * Returns `true` when an open batch has taken the message over and the
   * caller must not deliver it; `false` when the caller should deliver it now.
   * `deliver` is invoked later, on flush, so it should read whatever state it
   * needs at call time rather than closing over a stale snapshot.
   *
   * @param coalesceKey Overrides the default coalescing. Pass a stable key for
   * a delivery step that fans out to several clients so it collapses as one
   * unit; pass `null` to queue every occurrence.
   */
  intercept(
    message: HmrMessageSentToBrowser,
    deliver: () => void,
    { coalesceKey }: { coalesceKey?: string | null } = {}
  ): boolean {
    const disposition = getBatchDisposition(message.type)

    if (disposition === 'pass') {
      // Per-request plumbing and devtools state stream continuously and say
      // nothing about the compilation, so they are neither recorded as
      // activity nor allowed to influence a batch.
      return false
    }

    this.recordFromMessage(message)

    const key =
      coalesceKey !== undefined ? coalesceKey : getCoalesceKey(message)

    if (this.batchId === null) {
      if (key !== null) {
        // This message is about to be delivered, and it carries the whole
        // current state for its key. A copy still queued behind a batch that
        // ended on a compile error is therefore stale — replaying it would
        // flash the superseded state (an error overlay for an error the agent
        // has already fixed) before this message corrects it.
        this.queue.delete(key)
      }
      // Anything else still queued catches up first, so the browser sees the
      // module updates it missed before the message that concludes them.
      this.drainIfClean()
      return false
    }

    if (disposition === 'drop') {
      this.droppedMessageCount++
      return true
    }

    this.enqueue({ coalesceKey: key, type: message.type, deliver })
    return true
  }

  /**
   * Records compilation state without gating anything. For hosts that have a
   * better error source than the messages crossing the gate.
   */
  recordCompileResult(
    errors: readonly CompilationError[],
    warnings: readonly CompilationError[] = []
  ): void {
    this.sawCompileResult = true
    this.errors = [...errors]
    this.warnings = [...warnings]
    // A fresh compile result supersedes the errors from the previous one.
    this.serverErrors = []
  }

  begin({ timeoutMs }: { timeoutMs?: number } = {}): AgentHmrBatchBeginResult {
    if (!this.enabled) {
      return { status: 'disabled', batchId: null, timeoutMs: 0 }
    }

    const clampedTimeout = Math.min(
      MAX_BATCH_TIMEOUT_MS,
      Math.max(MIN_BATCH_TIMEOUT_MS, timeoutMs ?? DEFAULT_BATCH_TIMEOUT_MS)
    )

    if (this.batchId !== null) {
      // Batches do not nest: a second `begin` from an agent that lost track of
      // its own state should not silently discard the outer batch's queue.
      return {
        status: 'already-open',
        batchId: this.batchId,
        timeoutMs: clampedTimeout,
      }
    }

    this.batchId = `hmr-batch-${++this.batchCounter}`
    this.openedAt = this.now()
    this.activityCountAtOpen = this.activityCount
    // Anchor the quiet period to the batch opening, so that settling cannot
    // read a long-idle dev server as "this edit already finished compiling".
    this.lastActivityAt = this.openedAt
    this.heldMessageTypes.clear()
    this.droppedMessageCount = 0
    this.forcedFlush = false
    this.sawCompileResult = false

    this.watchdog = this.setTimer(() => {
      this.watchdog = null
      if (this.batchId === null) {
        return
      }
      this.logger.warn(
        `[agent-hmr-batch] batch ${this.batchId} was not closed within ${clampedTimeout}ms; ` +
          `releasing held HMR updates. The agent that opened it may have exited without calling end_hmr_batch.`
      )
      this.close({ timedOut: true })
    }, clampedTimeout)

    return {
      status: 'opened',
      batchId: this.batchId,
      timeoutMs: clampedTimeout,
    }
  }

  /**
   * Closes the batch, waiting for the compilation triggered by the agent's
   * edits to settle first so the reported errors describe the code the agent
   * just wrote.
   */
  async end({
    settle,
  }: {
    settle?: AgentHmrBatchSettleOptions | false
  } = {}): Promise<AgentHmrBatchResult> {
    if (this.batchId === null) {
      return (
        this.consumePendingTimeoutResult() ??
        this.emptyResult(this.enabled ? 'no-batch' : 'disabled')
      )
    }

    if (settle !== false) {
      await this.waitForSettle({ ...DEFAULT_SETTLE, ...settle })
    }

    if (this.batchId === null) {
      // The watchdog fired while we were settling. It already closed the batch
      // and produced a result; report that rather than a second, emptier one.
      return this.consumePendingTimeoutResult() ?? this.emptyResult('no-batch')
    }

    return this.close({ timedOut: false })
  }

  status(): AgentHmrBatchStatusResult {
    const open = this.batchId !== null
    return {
      enabled: this.enabled,
      open,
      batchId: this.batchId,
      openedForMs: open ? this.now() - this.openedAt : null,
      heldMessageCount: open ? this.queue.size : 0,
      heldMessageTypes: open ? this.heldMessageTypesAsRecord() : {},
      pendingFromPreviousBatch: open ? 0 : this.queue.size,
      errors: this.currentErrors(),
      warnings: [...this.warnings],
    }
  }

  /** Test seam: drops all state without delivering anything. */
  resetForTesting(): void {
    if (this.watchdog !== null) {
      this.clearTimer(this.watchdog)
      this.watchdog = null
    }
    this.batchId = null
    this.queue.clear()
    this.heldMessageTypes.clear()
    this.droppedMessageCount = 0
    this.forcedFlush = false
    this.errors = []
    this.warnings = []
    this.serverErrors = []
    this.sawCompileResult = false
    this.resumeCallbacks.clear()
    this.pendingTimeoutResult = null
  }

  private consumePendingTimeoutResult(): AgentHmrBatchResult | null {
    const result = this.pendingTimeoutResult
    this.pendingTimeoutResult = null
    return result
  }

  private emptyResult(status: AgentHmrBatchStatus): AgentHmrBatchResult {
    return {
      status,
      batchId: null,
      durationMs: 0,
      timedOut: false,
      compiled: false,
      errors: [],
      warnings: [],
      heldMessageCount: 0,
      heldMessageTypes: {},
      droppedMessageCount: 0,
      previewPreserved: true,
    }
  }

  private currentErrors(): CompilationError[] {
    return [...this.errors, ...this.serverErrors]
  }

  private heldMessageTypesAsRecord(): Record<string, number> {
    const record: Record<string, number> = {}
    for (const [type, count] of this.heldMessageTypes) {
      record[String(type)] = count
    }
    return record
  }

  private recordFromMessage(message: HmrMessageSentToBrowser): void {
    this.activityCount++
    this.lastActivityAt = this.now()

    if (hasErrorsField(message)) {
      this.recordCompileResult(message.errors, message.warnings)
    } else if (message.type === HMR_MESSAGE_SENT_TO_BROWSER.SERVER_ERROR) {
      this.serverErrors = [...this.serverErrors, describeServerError(message)]
    }
  }

  private enqueue(entry: QueuedMessage): void {
    this.heldMessageTypes.set(
      entry.type,
      (this.heldMessageTypes.get(entry.type) ?? 0) + 1
    )

    const key = entry.coalesceKey ?? `#uncoalesced:${this.queueSequence++}`

    // Re-insert rather than overwrite in place, so the surviving copy is
    // ordered by when it was last produced.
    this.queue.delete(key)
    this.queue.set(key, entry)

    if (this.queue.size > MAX_QUEUED_MESSAGES) {
      this.logger.warn(
        `[agent-hmr-batch] batch ${this.batchId} held more than ${MAX_QUEUED_MESSAGES} HMR messages; ` +
          `flushing early to bound memory. The preview may briefly show an intermediate state.`
      )
      this.forcedFlush = true
      this.flushQueue()
    }
  }

  /**
   * Delivers everything queued. Bundler-owned queues go first so their module
   * updates precede the `BUILT` that reports the compilation as finished.
   */
  private flushQueue(): void {
    for (const resume of this.resumeCallbacks) {
      try {
        resume()
      } catch (error) {
        this.logger.warn(
          `[agent-hmr-batch] a resume callback threw while flushing: ${error}`
        )
      }
    }

    const queued = [...this.queue.values()]
    this.queue.clear()

    for (const entry of queued) {
      try {
        entry.deliver()
      } catch (error) {
        this.logger.warn(
          `[agent-hmr-batch] failed to deliver a held HMR message: ${error}`
        )
      }
    }
  }

  /**
   * Lets a queue withheld by a failed batch catch up once the code compiles
   * again. Without this, a batch that ended on an error would leave the
   * browser permanently behind.
   */
  private drainIfClean(): void {
    if (this.queue.size === 0) {
      // Nothing of ours to release. A host-owned queue drains on its own
      // schedule; it has its own error gate.
      return
    }
    if (this.currentErrors().length > 0) {
      return
    }
    this.flushQueue()
  }

  private close({ timedOut }: { timedOut: boolean }): AgentHmrBatchResult {
    const batchId = this.batchId!
    const durationMs = this.now() - this.openedAt
    const heldMessageTypes = this.heldMessageTypesAsRecord()
    const heldMessageCount = this.queue.size
    const droppedMessageCount = this.droppedMessageCount
    const errors = this.currentErrors()
    const warnings = [...this.warnings]
    const previewPreserved = !this.forcedFlush

    if (this.watchdog !== null) {
      this.clearTimer(this.watchdog)
      this.watchdog = null
    }

    // Closing before flushing: the flush must run outside the batch so that
    // any message it produces takes the normal path.
    this.batchId = null

    let status: AgentHmrBatchStatus
    if (errors.length > 0) {
      // Hold the line. The preview stays on the last state that compiled, and
      // the queue survives for the next clean compile to release.
      status = 'withheld'
    } else {
      status = 'flushed'
      this.flushQueue()
    }

    const result: AgentHmrBatchResult = {
      status,
      batchId,
      durationMs,
      timedOut,
      compiled: this.sawCompileResult,
      errors,
      warnings,
      heldMessageCount,
      heldMessageTypes,
      droppedMessageCount,
      previewPreserved,
    }

    if (timedOut) {
      this.pendingTimeoutResult = result
    }

    return result
  }

  private async waitForSettle(
    settle: Required<AgentHmrBatchSettleOptions>
  ): Promise<void> {
    const { quietMs, graceMs, maxWaitMs, pollMs } = settle
    const start = this.now()
    const deadline = start + maxWaitMs

    // The write that triggers the recompile races the call that closes the
    // batch, so give the watcher a moment to notice it. Once anything has
    // crossed the gate there is real activity to wait on instead.
    const graceDeadline = Math.min(start + graceMs, deadline)
    while (
      this.activityCount === this.activityCountAtOpen &&
      this.now() < graceDeadline &&
      this.batchId !== null
    ) {
      await sleep(pollMs)
    }

    while (this.now() < deadline && this.batchId !== null) {
      const compiling = this.isCompiling?.() ?? false
      if (!compiling && this.now() - this.lastActivityAt >= quietMs) {
        return
      }
      await sleep(pollMs)
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const handle = setTimeout(resolve, ms)
    handle.unref?.()
  })
}

let controller: AgentHmrBatchController | undefined

/**
 * Process-wide controller. The dev server runs one bundler per process, and
 * the MCP tools that open and close batches live in that same process, so a
 * singleton is the whole scope of a batch.
 */
export function getAgentHmrBatchController(): AgentHmrBatchController {
  if (!controller) {
    controller = new AgentHmrBatchController()
  }
  return controller
}
