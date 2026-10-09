import type { TurbopackResult, Update } from '../../build/swc/types'

/** Establish readiness only after the native stream has captured its baseline. */
export async function handleTurbopackHmrSubscription(
  subscription: AsyncIterableIterator<TurbopackResult<Update>>,
  isActive: () => boolean,
  onUpdate: (update: TurbopackResult<Update>) => void,
  onReady: () => void
) {
  // Baseline capture and subscription setup are not atomic. Forward a real
  // first update just like subsequent updates, before announcing readiness.
  const initial = await subscription.next()
  if (initial.done || !isActive()) {
    return
  }
  onUpdate(initial.value)
  if (
    isActive() &&
    (initial.value.value.type === 'issues' ||
      initial.value.value.type === 'partial')
  ) {
    onReady()
  }

  for await (const update of subscription) {
    if (!isActive()) {
      return
    }
    onUpdate(update)
  }
}
