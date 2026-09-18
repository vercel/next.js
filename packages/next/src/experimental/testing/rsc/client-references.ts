import type { ClientReferenceManifest } from '../../../build/webpack/plugins/flight-manifest-plugin'
import type { DeepReadonly } from '../../../shared/lib/deep-readonly'

import type { ObservedClientReference } from './types'
export type { ObservedClientReference } from './types'

export interface ClientReferenceObserver {
  referencesFor(type: unknown): ObservedClientReference[]
  dispose(): void
}

/**
 * Observe exports actually loaded by the real decoder. Never preload otherwise
 * unused modules, replace a namespace, wrap a returned promise, or invoke a
 * component. Keep the record for the entire file so cached modules and repeated
 * decodes can still be identified. Export aliases are retained as candidates;
 * the decoded model does not preserve which alias appeared on the wire.
 */
export function createClientReferenceObserver(
  manifest: DeepReadonly<ClientReferenceManifest>
): ClientReferenceObserver {
  const runtime = globalThis as typeof globalThis & {
    __next_require__?: (id: string | number) => unknown
  }
  const original = runtime.__next_require__
  if (!original) {
    throw new Error(
      'Client reference observation requires the emitted SSR loader.'
    )
  }
  const loaded = new Map<string | number, unknown>()
  let disposed = false
  function record(id: string | number, value: unknown) {
    if (!disposed) loaded.set(id, value)
  }
  function requireObserved(id: string | number): unknown {
    const value = original!.call(runtime, id)
    if (value instanceof Promise) {
      // Observe both outcomes so the additional observer never creates an
      // unhandled rejection. The decoder receives the exact original promise.
      void value.then(
        (exports) => record(id, exports),
        () => {}
      )
    } else {
      record(id, value)
    }
    return value
  }
  runtime.__next_require__ = requireObserved

  return {
    referencesFor(type) {
      if (disposed)
        throw new Error('Client reference observer has been disposed.')
      const references: ObservedClientReference[] = []
      const seen = new Set<string>()
      for (const [moduleId, exports] of Object.entries(
        manifest.ssrModuleMapping
      )) {
        for (const [exportName, entry] of Object.entries(exports)) {
          if (!loaded.has(entry.id)) continue
          const namespace = loaded.get(entry.id)
          const object =
            namespace !== null &&
            (typeof namespace === 'object' || typeof namespace === 'function')
              ? namespace
              : undefined
          const names =
            exportName === '*'
              ? ['*', ...(object ? Object.keys(object) : [])]
              : [exportName]
          for (const name of names) {
            const resolvedName = entry.name === '*' ? name : entry.name
            const value =
              resolvedName === '*'
                ? namespace
                : resolvedName === ''
                  ? object && Reflect.get(object, '__esModule')
                    ? Reflect.get(object, 'default')
                    : namespace
                  : object
                    ? Reflect.get(object, resolvedName)
                    : undefined
            if (!Object.is(value, type)) continue
            const key = JSON.stringify([moduleId, name])
            if (!seen.has(key)) {
              seen.add(key)
              references.push({ moduleId, exportName: name })
            }
          }
        }
      }
      return references
    },
    dispose() {
      if (disposed) return
      disposed = true
      if (runtime.__next_require__ === requireObserved) {
        runtime.__next_require__ = original
      }
      loaded.clear()
    },
  }
}
