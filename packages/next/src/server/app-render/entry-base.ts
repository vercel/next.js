// eslint-disable-next-line import/no-extraneous-dependencies
export {
  renderToReadableStream,
  decodeReply,
  decodeAction,
  decodeFormState,
} from 'react-server-dom-webpack/server.edge'

import AppRouter from '../../client/components/app-router'
import LayoutRouter from '../../client/components/layout-router'
import RenderFromTemplateContext from '../../client/components/render-from-template-context'
import { staticGenerationAsyncStorage } from '../../client/components/static-generation-async-storage.external'
import { requestAsyncStorage } from '../../client/components/request-async-storage.external'
import { actionAsyncStorage } from '../../client/components/action-async-storage.external'
import { ClientPageRoot } from '../../client/components/client-page'
import {
  createUntrackedSearchParams,
  createDynamicallyTrackedSearchParams,
} from '../../client/components/search-params'
import * as serverHooks from '../../client/components/hooks-server-context'
import { NotFoundBoundary } from '../../client/components/not-found-boundary'
import { patchFetch as _patchFetch } from '../lib/patch-fetch'
// not being used but needs to be included in the client manifest for /_not-found
import '../../client/components/error-boundary'

import {
  preloadStyle,
  preloadFont,
  preconnect,
} from '../../server/app-render/rsc/preloads'
import { Postpone } from '../../server/app-render/rsc/postpone'
import { taintObjectReference } from '../../server/app-render/rsc/taint'

import * as React from 'react'
import {
  patchCacheScopeSupportIntoReact,
  createCacheScope,
} from '../after/react-cache'

patchCacheScopeSupportIntoReact(React)

// patchFetch makes use of APIs such as `React.unstable_postpone` which are only available
// in the experimental channel of React, so export it from here so that it comes from the bundled runtime
function patchFetch() {
  return _patchFetch({ serverHooks, staticGenerationAsyncStorage })
}

export {
  AppRouter,
  LayoutRouter,
  RenderFromTemplateContext,
  staticGenerationAsyncStorage,
  requestAsyncStorage,
  actionAsyncStorage,
  createUntrackedSearchParams,
  createDynamicallyTrackedSearchParams,
  serverHooks,
  preloadStyle,
  preloadFont,
  preconnect,
  Postpone,
  taintObjectReference,
  ClientPageRoot,
  NotFoundBoundary,
  patchFetch,
  createCacheScope,
}
