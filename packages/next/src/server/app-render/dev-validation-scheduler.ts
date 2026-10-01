import { unpatchedSetImmediate } from '../node-environment-extensions/fast-set-immediate.external'
import { InvariantError } from '../../shared/lib/invariant-error'

const MAX_ACTIVE_DEV_VALIDATIONS = 100

export interface DevValidationGeneration {
  readonly signal: AbortSignal
  finish(): void
}

export class DevValidationScheduler {
  private readonly currentValidationByDocument = new Map<
    string,
    AbortController
  >()

  constructor(private readonly maxActiveValidations: number) {
    if (maxActiveValidations < 1) {
      throw new InvariantError(
        'DevValidationScheduler requires at least one active validation'
      )
    }
  }

  get size(): number {
    return this.currentValidationByDocument.size
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

    return {
      signal: controller.signal,
      finish: () => {
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
}

// Only active validation work is retained. The hard cap also bounds the
// registry if user code suspends indefinitely and the work never settles.
const devValidationScheduler = new DevValidationScheduler(
  MAX_ACTIVE_DEV_VALIDATIONS
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
 * @returns Whether validation should continue.
 * - `true`: validation should continue
 * - `false` the validation was superseded and should be aborted.
 */
export async function yieldToForegroundRequest(
  validationSignal: AbortSignal
): Promise<boolean> {
  if (validationSignal.aborted) {
    return false
  }

  // Pass through the event-loop poll phase where HTTP requests arrive.
  // Defensively use the unpatched setImmediate (even though this should never run
  // in a context where setImmediate is patched, e.g. in `runInSequentialTasks`)
  await new Promise<void>((resolve) => unpatchedSetImmediate(resolve))
  return !validationSignal.aborted
}
