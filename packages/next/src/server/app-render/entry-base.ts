// eslint-disable-next-line import/no-extraneous-dependencies
export {
  createTemporaryReferenceSet,
  renderToReadableStream,
  decodeReply,
  decodeAction,
  decodeFormState,
} from 'react-server-dom-webpack/server.edge'

// eslint-disable-next-line import/no-extraneous-dependencies
export { unstable_prerender as prerender } from 'react-server-dom-webpack/static.edge'

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
// Not being directly used but should be included in the client manifest for /_not-found
// * ErrorBoundary -> client/components/error-boundary
// * GlobalError -> client/components/global-error
import '../../client/components/error-boundary'
import '../../client/components/builtin/global-error'
export {
  MetadataBoundary,
  ViewportBoundary,
  OutletBoundary,
} from '../../client/components/metadata/metadata-boundary'

export { preloadStyle, preloadFont, preconnect } from './rsc/preloads'
export { Postpone } from './rsc/postpone'
export { taintObjectReference } from './rsc/taint'
export { collectSegmentData } from './collect-segment-data'

import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from './work-unit-async-storage.external'
import { patchFetch as _patchFetch } from '../lib/patch-fetch'

let SegmentViewNode: typeof import('../../next-devtools/userspace/app/segment-explorer').SegmentViewNode =
  () => null
if (process.env.NODE_ENV === 'development') {
  SegmentViewNode = (
    require('../../next-devtools/userspace/app/segment-explorer') as typeof import('../../next-devtools/userspace/app/segment-explorer')
  ).SegmentViewNode
}

// patchFetch makes use of APIs such as `React.unstable_postpone` which are only available
// in the experimental channel of React, so export it from here so that it comes from the bundled runtime
function patchFetch() {
  return _patchFetch({
    workAsyncStorage,
    workUnitAsyncStorage,
  })
}

export {
  patchFetch,
  // Development only
  SegmentViewNode,
}
