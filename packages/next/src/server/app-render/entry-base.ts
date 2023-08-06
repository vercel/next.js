const { default: AppRouter } =
  require('next/dist/client/components/app-router') as typeof import('../../client/components/app-router')
const { default: LayoutRouter } =
  require('next/dist/client/components/layout-router') as typeof import('../../client/components/layout-router')
const { default: RenderFromTemplateContext } =
  require('next/dist/client/components/render-from-template-context') as typeof import('../../client/components/render-from-template-context')

const { staticGenerationAsyncStorage } =
  require('next/dist/client/components/static-generation-async-storage') as typeof import('../../client/components/static-generation-async-storage')

const { requestAsyncStorage } =
  require('next/dist/client/components/request-async-storage') as typeof import('../../client/components/request-async-storage')
const { actionAsyncStorage } =
  require('next/dist/client/components/action-async-storage') as typeof import('../../client/components/action-async-storage')

const { staticGenerationBailout } =
  require('next/dist/client/components/static-generation-bailout') as typeof import('../../client/components/static-generation-bailout')
const { default: StaticGenerationSearchParamsBailoutProvider } =
  require('next/dist/client/components/static-generation-searchparams-bailout-provider') as typeof import('../../client/components/static-generation-searchparams-bailout-provider')
const { createSearchParamsBailoutProxy } =
  require('next/dist/client/components/searchparams-bailout-proxy') as typeof import('../../client/components/searchparams-bailout-proxy')

const serverHooks =
  require('next/dist/client/components/hooks-server-context') as typeof import('../../client/components/hooks-server-context')

const {
  renderToReadableStream,
  decodeReply,
  decodeAction,
  // eslint-disable-next-line import/no-extraneous-dependencies
} = require('react-server-dom-webpack/server.edge')
const { preloadStyle, preloadFont, preconnect } =
  require('next/dist/server/app-render/rsc/preloads') as typeof import('../../server/app-render/rsc/preloads')

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
