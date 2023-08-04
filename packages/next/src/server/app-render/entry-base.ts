// const { default: AppRouter } =
//   require('next/dist/client/components/app-router') as typeof import('../../client/components/app-router')
// const { default: LayoutRouter } =
//   require('next/dist/client/components/layout-router') as typeof import('../../client/components/layout-router')
// const { default: RenderFromTemplateContext } =
//   require('next/dist/client/components/render-from-template-context') as typeof import('../../client/components/render-from-template-context')

// const { staticGenerationAsyncStorage } =
//   require('next/dist/client/components/static-generation-async-storage.shared-runtime') as typeof import('../../client/components/static-generation-async-storage.shared-runtime')

// const { requestAsyncStorage } =
//   require('next/dist/client/components/request-async-storage.shared-runtime') as typeof import('../../client/components/request-async-storage.shared-runtime')
// const { actionAsyncStorage } =
//   require('next/dist/client/components/action-async-storage.shared-runtime') as typeof import('../../client/components/action-async-storage.shared-runtime')

// const { staticGenerationBailout } =
//   require('next/dist/client/components/static-generation-bailout') as typeof import('../../client/components/static-generation-bailout')
// const { default: StaticGenerationSearchParamsBailoutProvider } =
//   require('next/dist/client/components/static-generation-searchparams-bailout-provider') as typeof import('../../client/components/static-generation-searchparams-bailout-provider')
// const { createSearchParamsBailoutProxy } =
//   require('next/dist/client/components/searchparams-bailout-proxy') as typeof import('../../client/components/searchparams-bailout-proxy')

// const serverHooks =
//   require('next/dist/client/components/hooks-server-context') as typeof import('../../client/components/hooks-server-context')

const {
  renderToReadableStream,
  decodeReply,
  decodeAction,
  // eslint-disable-next-line import/no-extraneous-dependencies
} = require('react-server-dom-webpack/server.edge')
// const { preloadStyle, preloadFont, preconnect } =
//   require('next/dist/server/app-render/rsc/preloads') as typeof import('../../server/app-render/rsc/preloads')

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
