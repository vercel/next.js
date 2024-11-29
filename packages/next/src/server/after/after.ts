import { workAsyncStorage } from '../app-render/work-async-storage.external'

export type AfterTask<T = unknown> = Promise<T> | AfterCallback<T>
export type AfterCallback<T = unknown> = () => T | Promise<T>

/**
 * This function allows you to schedule callbacks to be executed after the current request finishes.
 */
export function unstable_after<T>(task: AfterTask<T>): void {
  const workStore = workAsyncStorage.getStore()

  if (!workStore) {
    // TODO(after): the linked docs page talks about *dynamic* APIs, which unstable_after soon won't be anymore
    throw new Error(
      '`unstable_after` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context'
    )
  }

  const { afterContext } = workStore
  if (!afterContext.isEnabled) {
    throw new Error(
      '`unstable_after` must be explicitly enabled by setting `experimental.after: true` in your next.config.js.'
    )
  }

  const originalStack =
    process.env.NODE_ENV === 'development' && typeof task === 'function'
      ? new Error().stack
      : undefined
  return afterContext.after(task, originalStack)
}
