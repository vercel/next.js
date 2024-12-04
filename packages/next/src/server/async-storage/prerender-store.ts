import { INFINITE_CACHE } from '../../lib/constants'
import type { PrerenderStoreModern } from '../app-render/work-unit-async-storage.external'

export type PrerenderStoreOptions = Pick<
  Partial<PrerenderStoreModern>,
  | 'implicitTags'
  | 'phase'
  | 'dynamicTracking'
  | 'revalidate'
  | 'expire'
  | 'stale'
  | 'tags'
  | 'prerenderResumeDataCache'
  | 'encryptedBoundArgsCache'
  | 'validating'
> &
  Pick<PrerenderStoreModern, 'renderSignal' | 'controller' | 'cacheSignal'>

export function createPrerenderStore({
  implicitTags = [],
  phase = 'render',
  renderSignal,
  controller,
  cacheSignal,
  dynamicTracking = null,
  revalidate = INFINITE_CACHE,
  expire = INFINITE_CACHE,
  stale = INFINITE_CACHE,
  tags = [...implicitTags],
  prerenderResumeDataCache = null,
  encryptedBoundArgsCache = null,
}: PrerenderStoreOptions): PrerenderStoreModern {
  return {
    type: 'prerender',
    phase,
    implicitTags,
    renderSignal,
    controller,
    cacheSignal,
    dynamicTracking,
    revalidate,
    expire,
    stale,
    tags,
    prerenderResumeDataCache,
    encryptedBoundArgsCache,
  }
}
