import type {
  PrerenderStoreModern,
  WorkUnitStore,
} from '../app-render/work-unit-async-storage.external'

export type UseCacheRenderContext =
  | {
      readonly type: 'prerender'
      readonly workUnitStore: PrerenderStoreModern
      readonly dynamicAccessAbortController: AbortController
    }
  | {
      readonly type: 'other'
      readonly workUnitStore:
        | Exclude<WorkUnitStore, PrerenderStoreModern>
        | undefined
    }
