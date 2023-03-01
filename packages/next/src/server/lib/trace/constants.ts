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
  generateStaticRoutes = 'NextNodeServer.generateStaticRoutes',
  generateFsStaticRoutes = 'NextNodeServer.generateFsStaticRoutes',
  generatePublicRoutes = 'NextNodeServer.generatePublicRoutes',
  generateImageRoutes = 'NextNodeServer.generateImageRoutes.route',
  sendRenderResult = 'NextNodeServer.sendRenderResult',
  sendStatic = 'NextNodeServer.sendStatic',
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

  // nested inner span, does not require parent scope name
  route = 'route',
  onProxyReq = 'onProxyReq',
  apiResolver = 'apiResolver',
}

enum StartServerSpan {
  startServer = 'startServer.startServer',
}

enum RenderSpan {
  getServerSideProps = 'Render.getServerSideProps',
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

type SpanNames =
  | `${BaseServerSpan}`
  | `${LoadComponentsSpan}`
  | `${NextServerSpan}`
  | `${StartServerSpan}`
  | `${NextNodeServerSpan}`
  | `${RenderSpan}`
  | `${RouterSpan}`
  | `${AppRenderSpan}`

// This list is used to filter out spans that are not relevant to the user
export const NextVanillaSpanAllowlist = [
  NextServerSpan.getRequestHandler,
  NextNodeServerSpan.findPageComponents,
  BaseServerSpan.renderToResponse,
  RenderSpan.getServerSideProps,
  AppRenderSpan.fetch,
]

export {
  BaseServerSpan,
  LoadComponentsSpan,
  NextServerSpan,
  NextNodeServerSpan,
  StartServerSpan,
  SpanNames,
  RenderSpan,
  RouterSpan,
  AppRenderSpan,
}
