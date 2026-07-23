import { unpatchedSetImmediate } from '../node-environment-extensions/fast-set-immediate.external'
import { InvariantError } from '../../shared/lib/invariant-error'

const MAX_ACTIVE_DEV_VALIDATIONS = 100

// Each validation re-renders the route (twice with Instant Validation) and
// retains the full working set of those renders until it settles. The sets
// are only bounded per validation, so on large apps a fast sequence of
// requests to distinct documents (a crawler, a link checker, quick
// click-through) can otherwise pile up enough concurrent validation renders
// to run the dev server out of memory.
const MAX_CONCURRENT_DEV_VALIDATIONS = 2

export interface DevValidationGeneration {
  readonly signal: AbortSignal
  /**
   * Wait for a validation slot. Resolves `false` if this generation was
   * superseded while waiting; the caller must skip the validation work then.
   */
  admit(): Promise<boolean>
  finish(): void
}

export class DevValidationScheduler {
  private readonly currentValidationByDocument = new Map<
    string,
    AbortController
  >()
  private runningValidations = 0
  private readonly admissionQueue: Array<(admitted: boolean) => void> = []

  constructor(
    private readonly maxActiveValidations: number,
    private readonly maxConcurrentValidations: number
  ) {
    if (maxActiveValidations < 1 || maxConcurrentValidations < 1) {
      throw new InvariantError(
        'DevValidationScheduler requires at least one active validation'
      )
    }
  }

  get size(): number {
    return this.currentValidationByDocument.size
  }

  get running(): number {
    return this.runningValidations
  }

  begin(htmlRequestId: string): DevValidationGeneration {
    const previousController =
      this.currentValidationByDocument.get(htmlRequestId)
    if (previousController !== undefined) {
      this.currentValidationByDocument.delete(htmlRequestId)
      previousController.abort()
    }

    if (this.currentValidationByDocument.size >= this.maxActiveValidations) {
      const oldestEntry = this.currentValidationByDocument
        .entries()
        .next().value
      if (oldestEntry !== undefined) {
        const [oldestHtmlRequestId, oldestController] = oldestEntry
        this.currentValidationByDocument.delete(oldestHtmlRequestId)
        oldestController.abort()
      }
    }

    const controller = new AbortController()
    this.currentValidationByDocument.set(htmlRequestId, controller)
    let admitted = false

    return {
      signal: controller.signal,
      admit: async () => {
        if (admitted) {
          throw new InvariantError(
            'A dev validation generation may only be admitted once'
          )
        }
        admitted = await this.acquireSlot(controller.signal)
        return admitted
      },
      finish: () => {
        if (admitted) {
          admitted = false
          this.releaseSlot()
        }
        // A superseded generation may settle after its replacement. Only the
        // current generation is allowed to remove this document's entry.
        if (
          this.currentValidationByDocument.get(htmlRequestId) === controller
        ) {
          this.currentValidationByDocument.delete(htmlRequestId)
        }
      },
    }
  }

  private acquireSlot(signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) {
      return Promise.resolve(false)
    }
    if (this.runningValidations < this.maxConcurrentValidations) {
      this.runningValidations++
      return Promise.resolve(true)
    }
    return new Promise<boolean>((resolve) => {
      const waiter = (slotGranted: boolean) => {
        signal.removeEventListener('abort', onAbort)
        if (slotGranted && signal.aborted) {
          // Superseded while the slot was being handed over. Pass it on.
          this.releaseSlot()
          resolve(false)
          return
        }
        resolve(slotGranted)
      }
      const onAbort = () => {
        const index = this.admissionQueue.indexOf(waiter)
        if (index !== -1) {
          this.admissionQueue.splice(index, 1)
          resolve(false)
        }
        // Otherwise the waiter already left the queue and settles itself.
      }
      this.admissionQueue.push(waiter)
      signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  private releaseSlot(): void {
    const next = this.admissionQueue.shift()
    if (next !== undefined) {
      // Hand the slot to the next waiter; `runningValidations` is unchanged.
      next(true)
    } else {
      this.runningValidations--
    }
  }
}

// Only active validation work is retained. The hard cap also bounds the
// registry if user code suspends indefinitely and the work never settles.
const devValidationScheduler = new DevValidationScheduler(
  MAX_ACTIVE_DEV_VALIDATIONS,
  MAX_CONCURRENT_DEV_VALIDATIONS
)

export function beginDevValidation(
  htmlRequestId: string
): DevValidationGeneration {
  return devValidationScheduler.begin(htmlRequestId)
}

/**
 * Give incoming requests a chance to enter app rendering and supersede the
 * current validation before another expensive render attempt starts.
 *
 * The regular global `setImmediate` is patched by staged rendering and can run
 * inside the current timer task. The original immediate is required here so we
 * actually pass through the event-loop poll phase where HTTP requests arrive.
 */
export async function yieldToForegroundRequest(
  validationSignal: AbortSignal
): Promise<boolean> {
  if (validationSignal.aborted) {
    return false
  }

  await new Promise<void>((resolve) => unpatchedSetImmediate(resolve))
  return !validationSignal.aborted
}
