// eslint-disable-next-line import/no-extraneous-dependencies
export {
  createTemporaryReferenceSet,
  renderToReadableStream,
  decodeReply,
  decodeAction,
  decodeFormState,
} from 'react-server-dom-webpack/server'

// eslint-disable-next-line import/no-extraneous-dependencies
export { prerender } from 'react-server-dom-webpack/static'

// TODO: Just re-export `* as ReactServer`
export { captureOwnerStack, createElement, Fragment } from 'react'

export { default as LayoutRouter } from '../../client/components/layout-router'
export { default as RenderFromTemplateContext } from '../../client/components/render-from-template-context'
export { workAsyncStorage } from '../app-render/work-async-storage.external'
export { workUnitAsyncStorage } from './work-unit-async-storage.external'
export { actionAsyncStorage } from '../app-render/action-async-storage.external'

export { ClientPageRoot } from '../../client/components/client-page'
export { ClientSegmentRoot } from '../../client/components/client-segment'
export {
  createServerSearchParamsForServerPage,
  createPrerenderSearchParamsForClientPage,
} from '../request/search-params'
export {
  createServerParamsForServerSegment,
  createPrerenderParamsForClientSegment,
} from '../request/params'
export * as serverHooks from '../../client/components/hooks-server-context'
export { HTTPAccessFallbackBoundary } from '../../client/components/http-access-fallback/error-boundary'
export { createMetadataComponents } from '../../lib/metadata/metadata'
export { RootLayoutBoundary } from '../../lib/framework/boundary-components'

export { preloadStyle, preloadFont, preconnect } from './rsc/preloads'
export { Postpone } from './rsc/postpone'
export { taintObjectReference } from './rsc/taint'
export { collectSegmentData } from './collect-segment-data'

import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from './work-unit-async-storage.external'
import { patchFetch as _patchFetch } from '../lib/patch-fetch'

let SegmentViewNode: typeof import('../../next-devtools/userspace/app/segment-explorer-node').SegmentViewNode =
  () => null
let SegmentViewStateNode: typeof import('../../next-devtools/userspace/app/segment-explorer-node').SegmentViewStateNode =
  () => null
if (process.env.NODE_ENV === 'development') {
  const mod =
    require('../../next-devtools/userspace/app/segment-explorer-node') as typeof import('../../next-devtools/userspace/app/segment-explorer-node')
  SegmentViewNode = mod.SegmentViewNode
  SegmentViewStateNode = mod.SegmentViewStateNode
}

// For hot-reloader
declare global {
  var __next__clear_chunk_cache__: (() => void) | null | undefined
  var __turbopack_clear_chunk_cache__: () => void | null | undefined
}
// hot-reloader modules are not bundled so we need to inject `__next__clear_chunk_cache__`
// into globalThis from this file which is bundled.
if (process.env.TURBOPACK) {
  globalThis.__next__clear_chunk_cache__ = __turbopack_clear_chunk_cache__
} else {
  // Webpack does not have chunks on the server
  globalThis.__next__clear_chunk_cache__ = null
}

// patchFetch makes use of APIs such as `React.unstable_postpone` which are only available
// in the experimental channel of React, so export it from here so that it comes from the bundled runtime
export function patchFetch() {
  return _patchFetch({
    workAsyncStorage,
    workUnitAsyncStorage,
  })
}

// Development only
export { SegmentViewNode, SegmentViewStateNode }
