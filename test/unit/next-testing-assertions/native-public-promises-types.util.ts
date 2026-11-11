import type { TestContext } from 'next/experimental/testing/vitest'

/** Native queue element variance follows the pinned TaskPopulated declaration. */
export function nativePublicPromiseTypes(context: TestContext) {
  let queue: Promise<string>[] | undefined = context.task.promises
  context.task.promises?.push(Promise.resolve('native queue'))
  // @ts-expect-error The native queue accepts Promises rather than booleans.
  context.task.promises?.push(false)
  // @ts-expect-error Pinned TestContext keeps task properties readonly.
  context.task.promises = [Promise.resolve(17)]
  // @ts-expect-error The public native queue itself remains an Array.
  queue = Promise.resolve([])
  return queue
}
