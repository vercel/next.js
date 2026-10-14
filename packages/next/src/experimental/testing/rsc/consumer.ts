import { getFlightStream } from '../../../server/app-render/use-flight-response'

// This module must be reached through AppProject's next-ssr transition. These
// exports belong to the matching SSR React instance, not the test host's React.
export { isValidElement } from 'react'
export { createClientReferenceObserver } from './client-references'
export { observeServerTree } from './observe'

/**
 * Decode through the normal Next Flight consumer. Invoke inside the same
 * bundle-local request scope as the render, after the execution host registered
 * the artifact's manifests and module/chunk loader. The normal consumer owns
 * decoder selection, manifest lookup and source-map handling. Never load this
 * module directly in the parent test process.
 *
 * The root model may contain lazy children or client component types. Returning
 * it does not execute those client components, finish nested observations, or
 * establish DOM/hydration behavior. Flight/request completion is tracked by the
 * renderer's separate completion handle.
 */
export async function decodeFlight(
  stream: ReadableStream<Uint8Array>
): Promise<unknown> {
  return getFlightStream<unknown>(stream, undefined, undefined, undefined)
}
