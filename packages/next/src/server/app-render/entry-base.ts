const {
  renderToReadableStream,
  decodeReply,
  decodeAction,
  // eslint-disable-next-line import/no-extraneous-dependencies
} = require('react-server-dom-webpack/server.edge')

import AppRouter from '../../client/components/app-router'
import LayoutRouter from '../../client/components/layout-router'
import RenderFromTemplateContext from '../../client/components/render-from-template-context'
import { staticGenerationAsyncStorage } from '../../client/components/static-generation-async-storage.external'
import { requestAsyncStorage } from '../../client/components/request-async-storage.external'
import { actionAsyncStorage } from '../../client/components/action-async-storage.external'
import { staticGenerationBailout } from '../../client/components/static-generation-bailout'
import StaticGenerationSearchParamsBailoutProvider from '../../client/components/static-generation-searchparams-bailout-provider'
import { createSearchParamsBailoutProxy } from '../../client/components/searchparams-bailout-proxy'
import * as serverHooks from '../../client/components/hooks-server-context'

import {
  preloadStyle,
  preloadFont,
  preconnect,
} from '../../server/app-render/rsc/preloads'

export {
  AppRouter,
  LayoutRouter,
  RenderFromTemplateContext,
  staticGenerationAsyncStorage,
  requestAsyncStorage,
  actionAsyncStorage,
  staticGenerationBailout,
  createSearchParamsBailoutProxy,
  serverHooks,
  renderToReadableStream,
  decodeReply,
  decodeAction,
  preloadStyle,
  preloadFont,
  preconnect,
  StaticGenerationSearchParamsBailoutProvider,
}
