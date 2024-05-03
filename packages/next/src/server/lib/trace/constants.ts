/**
 * Contains predefined constants for the trace span name in next/server.
 *
 * Currently, next/server/tracer is internal implementation only for tracking
 * next.js's implementation only with known span names defined here.
 **/

// eslint typescript has a bug with TS enums
/* eslint-disable no-shadow */

enum BaseServerSpan {
  handleRequest = 'BaseServer.handleRequest',
  run = 'BaseServer.run',
  pipe = 'BaseServer.pipe',
  getStaticHTML = 'BaseServer.getStaticHTML',
  render = 'BaseServer.render',
  renderToResponseWithComponents = 'BaseServer.renderToResponseWithComponents',
  renderToResponse = 'BaseServer.renderToResponse',
  renderToHTML = 'BaseServer.renderToHTML',
  renderError = 'BaseServer.renderError',
  renderErrorToResponse = 'BaseServer.renderErrorToResponse',
  renderErrorToHTML = 'BaseServer.renderErrorToHTML',
  render404 = 'BaseServer.render404',
}

enum LoadComponentsSpan {
  loadDefaultErrorComponents = 'LoadComponents.loadDefaultErrorComponents',
  loadComponents = 'LoadComponents.loadComponents',
}

enum NextServerSpan {
  getRequestHandler = 'NextServer.getRequestHandler',
  getServer = 'NextServer.getServer',
  getServerRequestHandler = 'NextServer.getServerRequestHandler',
  createServer = 'createServer.createServer',
}

enum NextNodeServerSpan {
  compression = 'NextNodeServer.compression',
  getBuildId = 'NextNodeServer.getBuildId',
  createComponentTree = 'NextNodeServer.createComponentTree',
  clientComponentLoading = 'NextNodeServer.clientComponentLoading',
  getLayoutOrPageModule = 'NextNodeServer.getLayoutOrPageModule',
  generateStaticRoutes = 'NextNodeServer.generateStaticRoutes',
  generateFsStaticRoutes = 'NextNodeServer.generateFsStaticRoutes',
  generatePublicRoutes = 'NextNodeServer.generatePublicRoutes',
  generateImageRoutes = 'NextNodeServer.generateImageRoutes.route',
  sendRenderResult = 'NextNodeServer.sendRenderResult',
  proxyRequest = 'NextNodeServer.proxyRequest',
  runApi = 'NextNodeServer.runApi',
  render = 'NextNodeServer.render',
  renderHTML = 'NextNodeServer.renderHTML',
  imageOptimizer = 'NextNodeServer.imageOptimizer',
  getPagePath = 'NextNodeServer.getPagePath',
  getRoutesManifest = 'NextNodeServer.getRoutesManifest',
  findPageComponents = 'NextNodeServer.findPageComponents',
  getFontManifest = 'NextNodeServer.getFontManifest',
  getServerComponentManifest = 'NextNodeServer.getServerComponentManifest',
  getRequestHandler = 'NextNodeServer.getRequestHandler',
  renderToHTML = 'NextNodeServer.renderToHTML',
  renderError = 'NextNodeServer.renderError',
  renderErrorToHTML = 'NextNodeServer.renderErrorToHTML',
  render404 = 'NextNodeServer.render404',
  startResponse = 'NextNodeServer.startResponse',

  // nested inner span, does not require parent scope name
  route = 'route',
  onProxyReq = 'onProxyReq',
  apiResolver = 'apiResolver',
  internalFetch = 'internalFetch',
}

enum StartServerSpan {
  startServer = 'startServer.startServer',
}

enum RenderSpan {
  getServerSideProps = 'Render.getServerSideProps',
  getStaticProps = 'Render.getStaticProps',
  renderToString = 'Render.renderToString',
  renderDocument = 'Render.renderDocument',
  createBodyResult = 'Render.createBodyResult',
}

enum AppRenderSpan {
  renderToString = 'AppRender.renderToString',
  renderToReadableStream = 'AppRender.renderToReadableStream',
  getBodyResult = 'AppRender.getBodyResult',
  fetch = 'AppRender.fetch',
}

enum RouterSpan {
  executeRoute = 'Router.executeRoute',
}

enum NodeSpan {
  runHandler = 'Node.runHandler',
}

enum AppRouteRouteHandlersSpan {
  runHandler = 'AppRouteRouteHandlers.runHandler',
}

enum ResolveMetadataSpan {
  generateMetadata = 'ResolveMetadata.generateMetadata',
  generateViewport = 'ResolveMetadata.generateViewport',
}

enum MiddlewareSpan {
  execute = 'Middleware.execute',
}

type SpanTypes =
  | `${BaseServerSpan}`
  | `${LoadComponentsSpan}`
  | `${NextServerSpan}`
  | `${StartServerSpan}`
  | `${NextNodeServerSpan}`
  | `${RenderSpan}`
  | `${RouterSpan}`
  | `${AppRenderSpan}`
  | `${NodeSpan}`
  | `${AppRouteRouteHandlersSpan}`
  | `${ResolveMetadataSpan}`
  | `${MiddlewareSpan}`

// This list is used to filter out spans that are not relevant to the user
export const NextVanillaSpanAllowlist = [
  MiddlewareSpan.execute,
  BaseServerSpan.handleRequest,
  RenderSpan.getServerSideProps,
  RenderSpan.getStaticProps,
  AppRenderSpan.fetch,
  AppRenderSpan.getBodyResult,
  RenderSpan.renderDocument,
  NodeSpan.runHandler,
  AppRouteRouteHandlersSpan.runHandler,
  ResolveMetadataSpan.generateMetadata,
  ResolveMetadataSpan.generateViewport,
  NextNodeServerSpan.createComponentTree,
  NextNodeServerSpan.findPageComponents,
  NextNodeServerSpan.getLayoutOrPageModule,
  NextNodeServerSpan.startResponse,
  NextNodeServerSpan.clientComponentLoading,
]

// These Spans are allowed to be always logged
// when the otel log prefix env is set
export const LogSpanAllowList = [
  NextNodeServerSpan.findPageComponents,
  NextNodeServerSpan.createComponentTree,
  NextNodeServerSpan.clientComponentLoading,
]

export {
  BaseServerSpan,
  LoadComponentsSpan,
  NextServerSpan,
  NextNodeServerSpan,
  StartServerSpan,
  RenderSpan,
  RouterSpan,
  AppRenderSpan,
  NodeSpan,
  AppRouteRouteHandlersSpan,
  ResolveMetadataSpan,
  MiddlewareSpan,
}

export type { SpanTypes }
