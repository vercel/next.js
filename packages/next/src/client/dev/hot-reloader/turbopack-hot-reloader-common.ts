import type { TurbopackMessage } from '../../../server/dev/hot-reloader-types'
import type { Update as TurbopackUpdate } from '../../../build/swc/types'

declare global {
  interface Window {
    __NEXT_HMR_TURBOPACK_REPORT_NOISY_NOOP_EVENTS: boolean | undefined
  }
}

// How long to wait before reporting the HMR start, used to suppress irrelevant
// `BUILDING` events. Does not impact reported latency.
const TURBOPACK_HMR_START_DELAY_MS = 100

interface HmrUpdate {
  hasUpdates: boolean
  updatedModules: Set<string>
  startMsSinceEpoch: number
  endMsSinceEpoch: number
}

export class TurbopackHmr {
  #updatedModules: Set<string>
  #startMsSinceEpoch: number | undefined
  #lastUpdateMsSinceEpoch: number | undefined
  #deferredReportHmrStartId: ReturnType<typeof setTimeout> | undefined
  #reportedHmrStart: boolean

  constructor() {
    this.#updatedModules = new Set()
    this.#reportedHmrStart = false
  }

  // HACK: Turbopack tends to generate a lot of irrelevant "BUILDING" actions,
  // as it reports *any* compilation, including fully no-op/cached compilations
  // and those unrelated to HMR. Fixing this would require significant
  // architectural changes.
  //
  // Work around this by deferring any "rebuilding" message by 100ms. If we get
  // a BUILT event within that threshold and nothing has changed, just suppress
  // the message entirely.
  #runDeferredReportHmrStart() {
    if (this.#deferredReportHmrStartId != null) {
      console.log('[Fast Refresh] rebuilding')
      this.#reportedHmrStart = true
      this.#cancelDeferredReportHmrStart()
    }
  }

  #cancelDeferredReportHmrStart() {
    clearTimeout(this.#deferredReportHmrStartId)
    this.#deferredReportHmrStartId = undefined
  }

  onBuilding() {
    this.#lastUpdateMsSinceEpoch = undefined
    this.#cancelDeferredReportHmrStart()
    this.#startMsSinceEpoch = Date.now()

    // report the HMR start after a short delay
    this.#deferredReportHmrStartId = setTimeout(
      () => this.#runDeferredReportHmrStart(),
      // debugging feature: don't defer/suppress noisy no-op HMR update messages
      self.__NEXT_HMR_TURBOPACK_REPORT_NOISY_NOOP_EVENTS
        ? 0
        : TURBOPACK_HMR_START_DELAY_MS
    )
  }

  /** Helper for other `onEvent` methods. */
  #onUpdate() {
    this.#runDeferredReportHmrStart()
    this.#lastUpdateMsSinceEpoch = Date.now()
  }

  onTurbopackMessage(msg: TurbopackMessage) {
    this.#onUpdate()
    const updatedModules = extractModulesFromTurbopackMessage(msg.data)
    for (const module of updatedModules) {
      this.#updatedModules.add(module)
    }
  }

  onServerComponentChanges() {
    this.#onUpdate()
  }

  onReloadPage() {
    this.#onUpdate()
  }

  onPageAddRemove() {
    this.#onUpdate()
  }

  /**
   * @returns `null` if the caller should ignore the update entirely. Returns an
   *   object with `hasUpdates: false` if the caller should report the end of
   *   the HMR in the browser console, but the HMR was a no-op.
   */
  onBuilt(): HmrUpdate | null {
    // Check that we got *any* `TurbopackMessage`, even if
    // `updatedModules` is empty (not everything gets recorded there).
    //
    // There's also a case where `onBuilt` gets called before `onBuilding`,
    // which can happen during initial page load. Ignore that too!
    const hasUpdates =
      this.#lastUpdateMsSinceEpoch != null && this.#startMsSinceEpoch != null
    if (!hasUpdates && !this.#reportedHmrStart) {
      // suppress the update entirely
      this.#cancelDeferredReportHmrStart()
      return null
    }
    this.#runDeferredReportHmrStart()

    const result = {
      hasUpdates,
      updatedModules: this.#updatedModules,
      startMsSinceEpoch: this.#startMsSinceEpoch!,
      endMsSinceEpoch: this.#lastUpdateMsSinceEpoch ?? Date.now(),
    }
    this.#updatedModules = new Set()
    this.#reportedHmrStart = false
    return result
  }
}

function extractModulesFromTurbopackMessage(
  data: TurbopackUpdate | TurbopackUpdate[]
): Set<string> {
  const updatedModules: Set<string> = new Set()

  const updates = Array.isArray(data) ? data : [data]
  for (const update of updates) {
    // TODO this won't capture changes to CSS since they don't result in a "merged" update
    if (
      update.type !== 'partial' ||
      update.instruction.type !== 'ChunkListUpdate' ||
      update.instruction.merged === undefined
    ) {
      continue
    }

    for (const mergedUpdate of update.instruction.merged) {
      for (const name of Object.keys(mergedUpdate.entries)) {
        const res = /(.*)\s+[([].*/.exec(name)
        if (res === null) {
          continue
        }

        updatedModules.add(res[1])
      }
    }
  }

  return updatedModules
}
