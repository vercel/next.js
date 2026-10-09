import {
  createRequestStore,
  type RequestStoreInputs,
} from '../../../server/async-storage/request-store'
import {
  createWorkStore,
  type WorkStoreContext,
} from '../../../server/async-storage/work-store'
import { workAsyncStorage } from '../../../server/app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../../../server/app-render/work-unit-async-storage.external'

/**
 * Invoke a renderer in a real dynamic render request from a clean host context.
 * Nested Next.js request/work scopes are not supported. This module must be
 * compiled into the subject's bundle, so the renderer and request APIs share
 * their AsyncLocalStorage instances.
 *
 * The caller supplies the resolved route/configuration and real request
 * lifecycle callbacks in workContext. It owns stream cancellation, after()
 * completion, and persistent cache lifetime. A fresh request store resets
 * neither persistent caches nor evaluated module state.
 *
 * This is deliberately render-only. Route handlers and actions must enter
 * their phases through their actual Next.js execution paths.
 */
export function runWithRenderRequest<T>(
  inputs: Omit<RequestStoreInputs, 'phase'>,
  workContext: WorkStoreContext,
  render: () => T
): T {
  // createWorkStore captures the current async context for runInCleanSnapshot.
  // Capturing an existing request would restore that request during cache work.
  if (workAsyncStorage.getStore() || workUnitAsyncStorage.getStore()) {
    throw new Error(
      'runWithRenderRequest must be called outside an existing Next.js request or work scope.'
    )
  }

  const requestStore = createRequestStore({ ...inputs, phase: 'render' })
  const workStore = createWorkStore(workContext)

  return workAsyncStorage.run(workStore, () =>
    workUnitAsyncStorage.run(requestStore, render)
  )
}
