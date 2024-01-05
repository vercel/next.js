import type { OutgoingHttpHeader } from 'http'
import type { AppPageRenderResultMetadata } from '../../render-result'

/**
 * This adapter is used to set headers in the `AppPageRenderResultMetadata`
 * object.
 */
export type StaticHeadersAdapter = {
  appendHeader: (name: string, value: string) => void
  setHeader: (name: string, value: OutgoingHttpHeader) => void
}

/**
 * Creates a static headers adapter that can be used to set headers in the
 * `AppPageRenderResultMetadata` object.
 */
export const createStaticHeadersAdapter = (
  metadata: AppPageRenderResultMetadata
): StaticHeadersAdapter => ({
  appendHeader: (name, value) => {
    metadata.headers ??= {}
    const existing = metadata.headers[name]
    if (Array.isArray(existing)) {
      metadata.headers[name] = [...existing, value]
    } else if (typeof existing === 'string') {
      metadata.headers[name] = [existing, value]
    } else if (typeof existing === 'number') {
      metadata.headers[name] = [existing.toString(), value]
    } else {
      metadata.headers[name] = value
    }
  },
  setHeader: (name, value) => {
    metadata.headers ??= {}
    metadata.headers[name] = value
  },
})
