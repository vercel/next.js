export type ScheduledFn<T = void> = () => T | PromiseLike<T>
export type SchedulerFn<T = void> = (cb: ScheduledFn<T>) => void

/**
 * Schedules a function to be called on the next tick after the other promises
 * have been resolved.
 *
 * @param cb the function to schedule
 */
export const scheduleOnNextTick = (cb: ScheduledFn<void>) => {
  // We use Promise.resolve().then() here so that the operation is scheduled at
  // the end of the promise job queue, we then add it to the next process tick
  // to ensure it's evaluated afterwards.
  //
  // This was inspired by the implementation of the DataLoader interface: https://github.com/graphql/dataloader/blob/d336bd15282664e0be4b4a657cb796f09bafbc6b/src/index.js#L213-L255
  //
  Promise.resolve().then(() => {
    if (process.env.NEXT_RUNTIME === 'edge') {
      setTimeout(cb, 0)
    } else {
      process.nextTick(cb)
    }
  })
}

/**
 * Schedules a function to be called using `setImmediate` or `setTimeout` if
 * `setImmediate` is not available (like in the Edge runtime).
 *
 * @param cb the function to schedule
 */
export const scheduleImmediate = (cb: ScheduledFn<void>): void => {
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

/**
 * This utility function is extracted to make it easier to find places where we are doing
 * specific timing tricks to try to schedule work after React has rendered. This is especially
 * important at the moment because Next.js uses the edge builds of React which use setTimeout to
 * schedule work when you might expect that something like setImmediate would do the trick.
 *
 * Long term we should switch to the node versions of React rendering when possible and then
 * update this to use setImmediate rather than setTimeout
 */
export function waitAtLeastOneReactRenderTask(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'edge') {
    return new Promise((r) => setTimeout(r, 0))
  } else {
    return new Promise((r) => setImmediate(r))
  }
}
