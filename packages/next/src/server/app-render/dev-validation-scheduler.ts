import { unpatchedSetImmediate } from '../node-environment-extensions/fast-set-immediate.external'

// Validation is diagnostic work. Once another app render starts, completing an
// older validation can only delay the render whose result the user is waiting
// for. Keep one generation per dev server so a new request can supersede it.
const currentValidationByServer = new WeakMap<object, AbortController>()

export function beginDevValidationRequest(
  devServerOwner: object | undefined
): AbortSignal | undefined {
  if (devServerOwner === undefined) {
    return undefined
  }

  const previousController = currentValidationByServer.get(devServerOwner)
  if (previousController !== undefined) {
    previousController.abort()
  }

  const controller = new AbortController()
  currentValidationByServer.set(devServerOwner, controller)
  return controller.signal
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
  validationSignal: AbortSignal | undefined
): Promise<boolean> {
  if (validationSignal?.aborted) {
    return false
  }

  await new Promise<void>((resolve) => unpatchedSetImmediate(resolve))
  return validationSignal?.aborted !== true
}
