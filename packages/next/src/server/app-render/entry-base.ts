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

import LayoutRouter from '../../client/components/layout-router'
import RenderFromTemplateContext from '../../client/components/render-from-template-context'
import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from './work-unit-async-storage.external'
import { actionAsyncStorage } from '../app-render/action-async-storage.external'
import { ClientPageRoot } from '../../client/components/client-page'
import { ClientSegmentRoot } from '../../client/components/client-segment'
import {
  createServerSearchParamsForServerPage,
  createPrerenderSearchParamsForClientPage,
  createServerSearchParamsForMetadata,
} from '../request/search-params'
import {
  createServerParamsForServerSegment,
  createServerParamsForMetadata,
  createPrerenderParamsForClientSegment,
} from '../request/params'
import * as serverHooks from '../../client/components/hooks-server-context'
import { HTTPAccessFallbackBoundary } from '../../client/components/http-access-fallback/error-boundary'
import { createMetadataComponents } from '../../lib/metadata/metadata'
import { patchFetch as _patchFetch } from '../lib/patch-fetch'
// not being used but needs to be included in the client manifest for /_not-found
import '../../client/components/error-boundary'
import {
  MetadataBoundary,
  ViewportBoundary,
  OutletBoundary,
} from '../../lib/metadata/metadata-boundary'

import { preloadStyle, preloadFont, preconnect } from './rsc/preloads'
import { Postpone } from './rsc/postpone'
import { taintObjectReference } from './rsc/taint'
export { collectSegmentData } from './collect-segment-data'

// patchFetch makes use of APIs such as `React.unstable_postpone` which are only available
// in the experimental channel of React, so export it from here so that it comes from the bundled runtime
function patchFetch() {
  return _patchFetch({
    workAsyncStorage,
    workUnitAsyncStorage,
  })
}

export {
  LayoutRouter,
  RenderFromTemplateContext,
  workAsyncStorage,
  workUnitAsyncStorage,
  actionAsyncStorage,
  createServerSearchParamsForServerPage,
  createServerSearchParamsForMetadata,
  createPrerenderSearchParamsForClientPage,
  createServerParamsForServerSegment,
  createServerParamsForMetadata,
  createPrerenderParamsForClientSegment,
  serverHooks,
  preloadStyle,
  preloadFont,
  preconnect,
  Postpone,
  MetadataBoundary,
  ViewportBoundary,
  OutletBoundary,
  taintObjectReference,
  ClientPageRoot,
  ClientSegmentRoot,
  HTTPAccessFallbackBoundary,
  patchFetch,
  createMetadataComponents,
}
