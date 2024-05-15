import { getExpectedRequestStore } from '../../client/components/request-async-storage.external'

export type AfterTask<T = unknown> = Promise<T> | AfterCallback<T>
export type AfterCallback<T = unknown> = () => T | Promise<T>

/**
 * This function allows you to schedule callbacks to be executed after the current request finishes.
 */
export function unstable_after<T>(_task: AfterTask<T>) {
  const callingExpression = 'unstable_after'

  const requestStore = getExpectedRequestStore(callingExpression)

  const { afterContext } = requestStore
  if (!afterContext) {
    throw new Error(
      '`unstable_after()` must be explicitly enabled by setting `experimental.after: true` in your next.config.js.'
    )
  }

  throw new Error('`unstable_after()` is not implemented.')
}
