export type ScheduledFn<T = void> = () => T | PromiseLike<T>
export type SchedulerFn<T = void> = (cb: ScheduledFn<T>) => void

/**
 * Schedules a function to be called on the next tick after the other promises
 * have been resolved.
 *
 * @param cb the function to schedule
 */
export const scheduleOnNextTick = <T = void>(cb: ScheduledFn<T>): void => {
  // We use Promise.resolve().then() here so that the operation is scheduled at
  // the end of the promise job queue, we then add it to the next process tick
  // to ensure it's evaluated afterwards.
  //
  // This was inspired by the implementation of the DataLoader interface: https://github.com/graphql/dataloader/blob/d336bd15282664e0be4b4a657cb796f09bafbc6b/src/index.js#L213-L255
  //
  Promise.resolve().then(() => {
    process.nextTick(cb)
  })
}

/**
 * Schedules a function to be called using `setImmediate` or `setTimeout` if
 * `setImmediate` is not available (like in the Edge runtime).
 *
 * @param cb the function to schedule
 */
export const scheduleImmediate = <T = void>(cb: ScheduledFn<T>): void => {
  if (process.env.NEXT_RUNTIME === 'edge') {
    setTimeout(cb, 0)
  } else {
    setImmediate(cb)
  }
}

/**
 * returns a promise than resolves in a future task. There is no guarantee that the task it resolves in
 * will be the next task but if you await it you can at least be sure that the current task is over and
 * most usefully that the entire microtask queue of the current task has been emptied.
 */
export function atLeastOneTask() {
  return new Promise<void>((resolve) => scheduleImmediate(resolve))
}
