'use strict'
Object.defineProperty(exports, '__esModule', {
  value: true,
})
exports.default = void 0
var _async_to_generator =
  require('@swc/helpers/lib/_async_to_generator.js').default
var _extends = require('@swc/helpers/lib/_extends.js').default
var _interop_require_default =
  require('@swc/helpers/lib/_interop_require_default.js').default
var _interop_require_wildcard =
  require('@swc/helpers/lib/_interop_require_wildcard.js').default
var _object_without_properties_loose =
  require('@swc/helpers/lib/_object_without_properties_loose.js').default
var _crypto = _interop_require_default(require('crypto'))
var _fs = _interop_require_default(require('fs'))
var _jestWorker = require('next/dist/compiled/jest-worker')
var _findUp = _interop_require_default(require('next/dist/compiled/find-up'))
var _path = require('path')
var _react = _interop_require_default(require('react'))
var _watchpack = _interop_require_default(
  require('next/dist/compiled/watchpack')
)
var _output = require('../../build/output')
var _constants = require('../../lib/constants')
var _fileExists = require('../../lib/file-exists')
var _findPagesDir = require('../../lib/find-pages-dir')
var _loadCustomRoutes = _interop_require_default(
  require('../../lib/load-custom-routes')
)
var _verifyTypeScriptSetup = require('../../lib/verifyTypeScriptSetup')
var _verifyPartytownSetup = require('../../lib/verify-partytown-setup')
var _constants1 = require('../../shared/lib/constants')
var _nextServer = _interop_require_wildcard(require('../next-server'))
var _routeMatcher = require('../../shared/lib/router/utils/route-matcher')
var _normalizePagePath = require('../../shared/lib/page-path/normalize-page-path')
var _absolutePathToPage = require('../../shared/lib/page-path/absolute-path-to-page')
var _router = _interop_require_default(require('../router'))
var _pathMatch = require('../../shared/lib/router/utils/path-match')
var _pathHasPrefix = require('../../shared/lib/router/utils/path-has-prefix')
var _removePathPrefix = require('../../shared/lib/router/utils/remove-path-prefix')
var _events = require('../../telemetry/events')
var _storage = require('../../telemetry/storage')
var _trace = require('../../trace')
var _hotReloader = _interop_require_default(require('./hot-reloader'))
var _findPageFile = require('../lib/find-page-file')
var _utils = require('../lib/utils')
var _coalescedFunction = require('../../lib/coalesced-function')
var _loadComponents = require('../load-components')
var _utils1 = require('../../shared/lib/utils')
var _middleware = require('next/dist/compiled/@next/react-dev-overlay/dist/middleware')
var Log = _interop_require_wildcard(require('../../build/output/log'))
var _isError = _interop_require_wildcard(require('../../lib/is-error'))
var _routeRegex = require('../../shared/lib/router/utils/route-regex')
var _utils2 = require('../../shared/lib/router/utils')
var _entries = require('../../build/entries')
var _getPageStaticInfo = require('../../build/analysis/get-page-static-info')
var _normalizePathSep = require('../../shared/lib/page-path/normalize-path-sep')
var _appPaths = require('../../shared/lib/router/utils/app-paths')
var _utils3 = require('../../build/utils')
var _webpackConfig = require('../../build/webpack-config')
var _loadJsconfig = _interop_require_default(
  require('../../build/load-jsconfig')
)
// Load ReactDevOverlay only when needed
let ReactDevOverlayImpl
const ReactDevOverlay = (props) => {
  if (ReactDevOverlayImpl === undefined) {
    ReactDevOverlayImpl =
      require('next/dist/compiled/@next/react-dev-overlay/dist/client').ReactDevOverlay
  }
  return ReactDevOverlayImpl(props)
}
class DevServer extends _nextServer.default {
  getStaticPathsWorker() {
    if (this.staticPathsWorker) {
      return this.staticPathsWorker
    }
    this.staticPathsWorker = new _jestWorker.Worker(
      require.resolve('./static-paths-worker'),
      {
        maxRetries: 1,
        numWorkers: this.nextConfig.experimental.cpus,
        enableWorkerThreads: this.nextConfig.experimental.workerThreads,
        forkOptions: {
          env: _extends({}, process.env, {
            // discard --inspect/--inspect-brk flags from process.env.NODE_OPTIONS. Otherwise multiple Node.js debuggers
            // would be started if user launch Next.js in debugging mode. The number of debuggers is linked to
            // the number of workers Next.js tries to launch. The only worker users are interested in debugging
            // is the main Next.js one
            NODE_OPTIONS: (0, _utils).getNodeOptionsWithoutInspect(),
          }),
        },
      }
    )
    this.staticPathsWorker.getStdout().pipe(process.stdout)
    this.staticPathsWorker.getStderr().pipe(process.stderr)
    return this.staticPathsWorker
  }
  getBuildId() {
    return 'development'
  }
  addExportPathMapRoutes() {
    var _this = this
    return _async_to_generator(function* () {
      // Makes `next export` exportPathMap work in development mode.
      // So that the user doesn't have to define a custom server reading the exportPathMap
      if (_this.nextConfig.exportPathMap) {
        console.log('Defining routes from exportPathMap')
        const exportPathMap = yield _this.nextConfig.exportPathMap(
          {},
          {
            dev: true,
            dir: _this.dir,
            outDir: null,
            distDir: _this.distDir,
            buildId: _this.buildId,
          }
        ) // In development we can't give a default path mapping
        for (const path in exportPathMap) {
          const { page, query = {} } = exportPathMap[path]
          _this.router.addFsRoute({
            match: (0, _pathMatch).getPathMatch(path),
            type: 'route',
            name: `${path} exportpathmap route`,
            fn: _async_to_generator(function* (req, res, _params, parsedUrl) {
              const { query: urlQuery } = parsedUrl
              Object.keys(urlQuery)
                .filter((key) => query[key] === undefined)
                .forEach((key) =>
                  console.warn(
                    `Url '${path}' defines a query parameter '${key}' that is missing in exportPathMap`
                  )
                )
              const mergedQuery = _extends({}, urlQuery, query)
              yield _this.render(req, res, page, mergedQuery, parsedUrl, true)
              return {
                finished: true,
              }
            }),
          })
        }
      }
    })()
  }
  startWatcher() {
    var _this = this
    return _async_to_generator(function* () {
      if (_this.webpackWatcher) {
        return
      }
      const regexPageExtension = new RegExp(
        `\\.+(?:${_this.nextConfig.pageExtensions.join('|')})$`
      )
      let resolved = false
      return new Promise(
        _async_to_generator(function* (resolve, reject) {
          // Watchpack doesn't emit an event for an empty directory
          _fs.default.readdir(_this.pagesDir, (_, files) => {
            if (files == null ? void 0 : files.length) {
              return
            }
            if (!resolved) {
              resolve()
              resolved = true
            }
          })
          const wp = (_this.webpackWatcher = new _watchpack.default({
            ignored:
              /([/\\]node_modules[/\\]|[/\\]\.next[/\\]|[/\\]\.git[/\\])/,
          }))
          const pages = [_this.pagesDir]
          const app = _this.appDir ? [_this.appDir] : []
          const directories = [...pages, ...app]
          const files1 = (0, _utils3).getPossibleMiddlewareFilenames(
            (0, _path).join(_this.pagesDir, '..'),
            _this.nextConfig.pageExtensions
          )
          let nestedMiddleware = []
          const envFiles = [
            '.env.development.local',
            '.env.local',
            '.env.development',
            '.env',
          ].map((file) => (0, _path).join(_this.dir, file))
          files1.push(...envFiles)
          // tsconfig/jsonfig paths hot-reloading
          const tsconfigPaths = [
            (0, _path).join(_this.dir, 'tsconfig.json'),
            (0, _path).join(_this.dir, 'jsconfig.json'),
          ]
          files1.push(...tsconfigPaths)
          wp.watch({
            directories: [_this.dir],
            startTime: 0,
          })
          const fileWatchTimes = new Map()
          let enabledTypeScript = _this.usingTypeScript
          wp.on(
            'aggregated',
            _async_to_generator(function* () {
              let middlewareMatcher
              const routedPages = []
              const knownFiles = wp.getTimeInfoEntries()
              const appPaths1 = {}
              const edgeRoutesSet = new Set()
              let envChange = false
              let tsconfigChange = false
              for (const [fileName, meta] of knownFiles) {
                if (
                  !files1.includes(fileName) &&
                  !directories.some((dir) => fileName.startsWith(dir))
                ) {
                  continue
                }
                const watchTime = fileWatchTimes.get(fileName)
                const watchTimeChange =
                  watchTime &&
                  watchTime !== (meta == null ? void 0 : meta.timestamp)
                fileWatchTimes.set(fileName, meta.timestamp)
                if (envFiles.includes(fileName)) {
                  if (watchTimeChange) {
                    envChange = true
                  }
                  continue
                }
                if (tsconfigPaths.includes(fileName)) {
                  if (fileName.endsWith('tsconfig.json')) {
                    enabledTypeScript = true
                  }
                  if (watchTimeChange) {
                    tsconfigChange = true
                  }
                  continue
                }
                if (
                  (meta == null ? void 0 : meta.accuracy) === undefined ||
                  !regexPageExtension.test(fileName)
                ) {
                  continue
                }
                const isAppPath = Boolean(
                  _this.appDir &&
                    (0, _normalizePathSep)
                      .normalizePathSep(fileName)
                      .startsWith(
                        (0, _normalizePathSep).normalizePathSep(_this.appDir)
                      )
                )
                const rootFile = (0, _absolutePathToPage).absolutePathToPage(
                  fileName,
                  {
                    pagesDir: _this.dir,
                    extensions: _this.nextConfig.pageExtensions,
                  }
                )
                const staticInfo = yield (0,
                _getPageStaticInfo).getPageStaticInfo({
                  pageFilePath: fileName,
                  nextConfig: _this.nextConfig,
                  page: rootFile,
                })
                if ((0, _utils3).isMiddlewareFile(rootFile)) {
                  var ref
                  _this.actualMiddlewareFile = rootFile
                  middlewareMatcher =
                    ((ref = staticInfo.middleware) == null
                      ? void 0
                      : ref.pathMatcher) || new RegExp('.*')
                  edgeRoutesSet.add('/')
                  continue
                }
                if (fileName.endsWith('.ts') || fileName.endsWith('.tsx')) {
                  enabledTypeScript = true
                }
                let pageName = (0, _absolutePathToPage).absolutePathToPage(
                  fileName,
                  {
                    pagesDir: isAppPath ? _this.appDir : _this.pagesDir,
                    extensions: _this.nextConfig.pageExtensions,
                    keepIndex: isAppPath,
                  }
                )
                if (isAppPath) {
                  if (!(0, _findPageFile).isLayoutsLeafPage(fileName)) {
                    continue
                  }
                  const originalPageName = pageName
                  pageName = (0, _appPaths).normalizeAppPath(pageName) || '/'
                  if (!appPaths1[pageName]) {
                    appPaths1[pageName] = []
                  }
                  appPaths1[pageName].push(originalPageName)
                  if (routedPages.includes(pageName)) {
                    continue
                  }
                } else {
                  // /index is preserved for root folder
                  pageName = pageName.replace(/\/index$/, '') || '/'
                }
                /**
                 * If there is a middleware that is not declared in the root we will
                 * warn without adding it so it doesn't make its way into the system.
                 */ if (/[\\\\/]_middleware$/.test(pageName)) {
                  nestedMiddleware.push(pageName)
                  continue
                }
                yield (0, _entries).runDependingOnPageType({
                  page: pageName,
                  pageRuntime: staticInfo.runtime,
                  onClient: () => {},
                  onServer: () => {
                    routedPages.push(pageName)
                  },
                  onEdgeServer: () => {
                    routedPages.push(pageName)
                    edgeRoutesSet.add(pageName)
                  },
                })
              }
              if (!_this.usingTypeScript && enabledTypeScript) {
                // we tolerate the error here as this is best effort
                // and the manual install command will be shown
                yield _this
                  .verifyTypeScript()
                  .then(() => {
                    tsconfigChange = true
                  })
                  .catch(() => {})
              }
              if (envChange || tsconfigChange) {
                var ref1, ref2, ref3
                if (envChange) {
                  _this.loadEnvConfig({
                    dev: true,
                    forceReload: true,
                  })
                }
                let tsconfigResult
                if (tsconfigChange) {
                  try {
                    tsconfigResult = yield (0, _loadJsconfig).default(
                      _this.dir,
                      _this.nextConfig
                    )
                  } catch (_) {
                    /* do we want to log if there are syntax errors in tsconfig  while editing? */
                  }
                }
                ;(ref1 = _this.hotReloader) == null
                  ? void 0
                  : (ref2 = ref1.activeConfigs) == null
                  ? void 0
                  : ref2.forEach((config, idx) => {
                      const isClient = idx === 0
                      const isNodeServer = idx === 1
                      const isEdgeServer = idx === 2
                      const hasRewrites =
                        _this.customRoutes.rewrites.afterFiles.length > 0 ||
                        _this.customRoutes.rewrites.beforeFiles.length > 0 ||
                        _this.customRoutes.rewrites.fallback.length > 0
                      if (tsconfigChange) {
                        var ref13, ref5
                        ;(ref13 = config.resolve) == null
                          ? void 0
                          : (ref5 = ref13.plugins) == null
                          ? void 0
                          : ref5.forEach((plugin) => {
                              // look for the JsConfigPathsPlugin and update with
                              // the latest paths/baseUrl config
                              if (
                                plugin &&
                                plugin.jsConfigPlugin &&
                                tsconfigResult
                              ) {
                                var ref, ref7, ref8
                                const { resolvedBaseUrl, jsConfig } =
                                  tsconfigResult
                                const currentResolvedBaseUrl =
                                  plugin.resolvedBaseUrl
                                const resolvedUrlIndex =
                                  (ref = config.resolve) == null
                                    ? void 0
                                    : (ref7 = ref.modules) == null
                                    ? void 0
                                    : ref7.findIndex(
                                        (item) =>
                                          item === currentResolvedBaseUrl
                                      )
                                if (
                                  resolvedBaseUrl &&
                                  resolvedBaseUrl !== currentResolvedBaseUrl
                                ) {
                                  var ref9, ref10
                                  // remove old baseUrl and add new one
                                  if (
                                    resolvedUrlIndex &&
                                    resolvedUrlIndex > -1
                                  ) {
                                    var ref11, ref12
                                    ;(ref11 = config.resolve) == null
                                      ? void 0
                                      : (ref12 = ref11.modules) == null
                                      ? void 0
                                      : ref12.splice(resolvedUrlIndex, 1)
                                  }
                                  ;(ref9 = config.resolve) == null
                                    ? void 0
                                    : (ref10 = ref9.modules) == null
                                    ? void 0
                                    : ref10.push(resolvedBaseUrl)
                                }
                                if (
                                  (jsConfig == null
                                    ? void 0
                                    : (ref8 = jsConfig.compilerOptions) == null
                                    ? void 0
                                    : ref8.paths) &&
                                  resolvedBaseUrl
                                ) {
                                  Object.keys(plugin.paths).forEach((key) => {
                                    delete plugin.paths[key]
                                  })
                                  Object.assign(
                                    plugin.paths,
                                    jsConfig.compilerOptions.paths
                                  )
                                  plugin.resolvedBaseUrl = resolvedBaseUrl
                                }
                              }
                            })
                      }
                      if (envChange) {
                        var ref6
                        ;(ref6 = config.plugins) == null
                          ? void 0
                          : ref6.forEach((plugin) => {
                              // we look for the DefinePlugin definitions so we can
                              // update them on the active compilers
                              if (
                                plugin &&
                                typeof plugin.definitions === 'object' &&
                                plugin.definitions.__NEXT_DEFINE_ENV
                              ) {
                                var ref, ref15
                                const newDefine = (0,
                                _webpackConfig).getDefineEnv({
                                  dev: true,
                                  config: _this.nextConfig,
                                  distDir: _this.distDir,
                                  isClient,
                                  hasRewrites,
                                  hasReactRoot:
                                    (ref = _this.hotReloader) == null
                                      ? void 0
                                      : ref.hasReactRoot,
                                  isNodeServer,
                                  isEdgeServer,
                                  hasServerComponents:
                                    (ref15 = _this.hotReloader) == null
                                      ? void 0
                                      : ref15.hasServerComponents,
                                })
                                Object.keys(plugin.definitions).forEach(
                                  (key) => {
                                    if (!(key in newDefine)) {
                                      delete plugin.definitions[key]
                                    }
                                  }
                                )
                                Object.assign(plugin.definitions, newDefine)
                              }
                            })
                      }
                    })
                ;(ref3 = _this.hotReloader) == null ? void 0 : ref3.invalidate()
              }
              if (nestedMiddleware.length > 0) {
                Log.error(
                  new _utils3.NestedMiddlewareError(
                    nestedMiddleware,
                    _this.dir,
                    _this.pagesDir
                  ).message
                )
                nestedMiddleware = []
              }
              _this.appPathRoutes = Object.fromEntries(
                // Make sure to sort parallel routes to make the result deterministic.
                Object.entries(appPaths1).map(([k, v]) => [k, v.sort()])
              )
              _this.edgeFunctions = []
              const edgeRoutes = Array.from(edgeRoutesSet)
              ;(0, _utils2).getSortedRoutes(edgeRoutes).forEach((page) => {
                let appPaths = _this.getOriginalAppPaths(page)
                if (typeof appPaths === 'string') {
                  page = appPaths
                }
                const isRootMiddleware = page === '/' && !!middlewareMatcher
                const middlewareRegex = isRootMiddleware
                  ? {
                      re: middlewareMatcher,
                      groups: {},
                    }
                  : (0, _routeRegex).getMiddlewareRegex(page, {
                      catchAll: false,
                    })
                const routeItem = {
                  match: (0, _routeMatcher).getRouteMatcher(middlewareRegex),
                  page,
                  re: middlewareRegex.re,
                }
                if (isRootMiddleware) {
                  _this.middleware = routeItem
                } else {
                  _this.edgeFunctions.push(routeItem)
                }
              })
              try {
                var ref4
                // we serve a separate manifest with all pages for the client in
                // dev mode so that we can match a page after a rewrite on the client
                // before it has been built and is populated in the _buildManifest
                const sortedRoutes = (0, _utils2).getSortedRoutes(routedPages)
                if (
                  !((ref4 = _this.sortedRoutes) == null
                    ? void 0
                    : ref4.every((val, idx) => val === sortedRoutes[idx]))
                ) {
                  // emit the change so clients fetch the update
                  _this.hotReloader.send(undefined, {
                    devPagesManifest: true,
                  })
                }
                _this.sortedRoutes = sortedRoutes
                _this.dynamicRoutes = _this.sortedRoutes
                  .filter(_utils2.isDynamicRoute)
                  .map((page) => ({
                    page,
                    match: (0, _routeMatcher).getRouteMatcher(
                      (0, _routeRegex).getRouteRegex(page)
                    ),
                  }))
                _this.router.setDynamicRoutes(_this.dynamicRoutes)
                _this.router.setCatchallMiddleware(
                  _this.generateCatchAllMiddlewareRoute(true)
                )
                if (!resolved) {
                  resolve()
                  resolved = true
                }
              } catch (e) {
                if (!resolved) {
                  reject(e)
                  resolved = true
                } else {
                  console.warn('Failed to reload dynamic routes:', e)
                }
              }
            })
          )
        })
      )
    })()
  }
  stopWatcher() {
    var _this = this
    return _async_to_generator(function* () {
      if (!_this.webpackWatcher) {
        return
      }
      _this.webpackWatcher.close()
      _this.webpackWatcher = null
    })()
  }
  verifyTypeScript() {
    var _this = this
    return _async_to_generator(function* () {
      if (_this.verifyingTypeScript) {
        return
      }
      try {
        _this.verifyingTypeScript = true
        const verifyResult = yield (0,
        _verifyTypeScriptSetup).verifyTypeScriptSetup({
          dir: _this.dir,
          intentDirs: [_this.pagesDir, _this.appDir].filter(Boolean),
          typeCheckPreflight: false,
          tsconfigPath: _this.nextConfig.typescript.tsconfigPath,
          disableStaticImages: _this.nextConfig.images.disableStaticImages,
        })
        if (verifyResult.version) {
          _this.usingTypeScript = true
        }
      } finally {
        _this.verifyingTypeScript = false
      }
    })()
  }
  prepare() {
    var _this = this,
      _superprop_get_prepare = () => super.prepare
    return _async_to_generator(function* () {
      ;(0, _trace).setGlobal('distDir', _this.distDir)
      ;(0, _trace).setGlobal('phase', _constants1.PHASE_DEVELOPMENT_SERVER)
      yield _this.verifyTypeScript()
      _this.customRoutes = yield (0, _loadCustomRoutes).default(
        _this.nextConfig
      )
      // reload router
      const { redirects, rewrites, headers } = _this.customRoutes
      if (
        rewrites.beforeFiles.length ||
        rewrites.afterFiles.length ||
        rewrites.fallback.length ||
        redirects.length ||
        headers.length
      ) {
        _this.router = new _router.default(_this.generateRoutes())
      }
      _this.hotReloader = new _hotReloader.default(_this.dir, {
        pagesDir: _this.pagesDir,
        distDir: _this.distDir,
        config: _this.nextConfig,
        previewProps: _this.getPreviewProps(),
        buildId: _this.buildId,
        rewrites,
        appDir: _this.appDir,
      })
      yield _superprop_get_prepare().call(_this)
      yield _this.addExportPathMapRoutes()
      yield _this.hotReloader.start(true)
      yield _this.startWatcher()
      _this.setDevReady()
      if (_this.nextConfig.experimental.nextScriptWorkers) {
        yield (0, _verifyPartytownSetup).verifyPartytownSetup(
          _this.dir,
          (0, _path).join(_this.distDir, _constants1.CLIENT_STATIC_FILES_PATH)
        )
      }
      const telemetry = new _storage.Telemetry({
        distDir: _this.distDir,
      })
      telemetry.record(
        (0, _events).eventCliSession(_this.distDir, _this.nextConfig, {
          webpackVersion: 5,
          cliCommand: 'dev',
          isSrcDir: (0, _path)
            .relative(_this.dir, _this.pagesDir)
            .startsWith('src'),
          hasNowJson: !!(yield (0, _findUp).default('now.json', {
            cwd: _this.dir,
          })),
          isCustomServer: _this.isCustomServer,
        })
      )
      // This is required by the tracing subsystem.
      ;(0, _trace).setGlobal('telemetry', telemetry)
      process.on('unhandledRejection', (reason) => {
        _this
          .logErrorWithOriginalStack(reason, 'unhandledRejection')
          .catch(() => {})
      })
      process.on('uncaughtException', (err) => {
        _this
          .logErrorWithOriginalStack(err, 'uncaughtException')
          .catch(() => {})
      })
    })()
  }
  close() {
    var _this = this
    return _async_to_generator(function* () {
      yield _this.stopWatcher()
      yield _this.getStaticPathsWorker().end()
      if (_this.hotReloader) {
        yield _this.hotReloader.stop()
      }
    })()
  }
  hasPage(pathname) {
    var _this = this
    return _async_to_generator(function* () {
      let normalizedPath
      try {
        normalizedPath = (0, _normalizePagePath).normalizePagePath(pathname)
      } catch (err) {
        console.error(err)
        // if normalizing the page fails it means it isn't valid
        // so it doesn't exist so don't throw and return false
        // to ensure we return 404 instead of 500
        return false
      }
      if ((0, _utils3).isMiddlewareFile(normalizedPath)) {
        return (0, _findPageFile)
          .findPageFile(
            _this.dir,
            normalizedPath,
            _this.nextConfig.pageExtensions
          )
          .then(Boolean)
      }
      // check appDir first if enabled
      if (_this.appDir) {
        const pageFile = yield (0, _findPageFile).findPageFile(
          _this.appDir,
          normalizedPath,
          _this.nextConfig.pageExtensions
        )
        if (pageFile) return true
      }
      const pageFile = yield (0, _findPageFile).findPageFile(
        _this.pagesDir,
        normalizedPath,
        _this.nextConfig.pageExtensions
      )
      return !!pageFile
    })()
  }
  _beforeCatchAllRender(req, res, params, parsedUrl) {
    var _this = this
    return _async_to_generator(function* () {
      const { pathname } = parsedUrl
      const pathParts = params.path || []
      const path = `/${pathParts.join('/')}`
      // check for a public file, throwing error if there's a
      // conflicting page
      let decodedPath
      try {
        decodedPath = decodeURIComponent(path)
      } catch (_) {
        throw new _utils1.DecodeError('failed to decode param')
      }
      if (yield _this.hasPublicFile(decodedPath)) {
        if (yield _this.hasPage(pathname)) {
          const err = new Error(
            `A conflicting public file and page file was found for path ${pathname} https://nextjs.org/docs/messages/conflicting-public-file-page`
          )
          res.statusCode = 500
          yield _this.renderError(err, req, res, pathname, {})
          return true
        }
        yield _this.servePublic(req, res, pathParts)
        return true
      }
      return false
    })()
  }
  setupWebSocketHandler(server, _req) {
    if (!this.addedUpgradeListener) {
      var ref17
      this.addedUpgradeListener = true
      server =
        server ||
        ((ref17 = _req == null ? void 0 : _req.originalRequest.socket) == null
          ? void 0
          : ref17.server)
      if (!server) {
        // this is very unlikely to happen but show an error in case
        // it does somehow
        Log.error(
          `Invalid IncomingMessage received, make sure http.createServer is being used to handle requests.`
        )
      } else {
        const { basePath } = this.nextConfig
        server.on('upgrade', (req, socket, head) => {
          var ref
          let assetPrefix = (this.nextConfig.assetPrefix || '').replace(
            /^\/+/,
            ''
          )
          // assetPrefix can be a proxy server with a url locally
          // if so, it's needed to send these HMR requests with a rewritten url directly to /_next/webpack-hmr
          // otherwise account for a path-like prefix when listening to socket events
          if (assetPrefix.startsWith('http')) {
            assetPrefix = ''
          } else if (assetPrefix) {
            assetPrefix = `/${assetPrefix}`
          }
          if (
            (ref = req.url) == null
              ? void 0
              : ref.startsWith(
                  `${basePath || assetPrefix || ''}/_next/webpack-hmr`
                )
          ) {
            var ref16
            ;(ref16 = this.hotReloader) == null
              ? void 0
              : ref16.onHMR(req, socket, head)
          } else {
            this.handleUpgrade(req, socket, head)
          }
        })
      }
    }
  }
  runMiddleware(params) {
    var _this = this,
      _superprop_get_runMiddleware = () => super.runMiddleware
    return _async_to_generator(function* () {
      try {
        const result = yield _superprop_get_runMiddleware().call(
          _this,
          _extends({}, params, {
            onWarning: (warn) => {
              _this.logErrorWithOriginalStack(warn, 'warning')
            },
          })
        )
        if ('finished' in result) {
          return result
        }
        result.waitUntil.catch((error) => {
          _this.logErrorWithOriginalStack(error, 'unhandledRejection')
        })
        return result
      } catch (error) {
        if (error instanceof _utils1.DecodeError) {
          throw error
        }
        /**
         * We only log the error when it is not a MiddlewareNotFound error as
         * in that case we should be already displaying a compilation error
         * which is what makes the module not found.
         */ if (!(error instanceof _utils1.MiddlewareNotFoundError)) {
          _this.logErrorWithOriginalStack(error)
        }
        const err = (0, _isError).getProperError(error)
        err.middleware = true
        const { request, response, parsedUrl } = params
        /**
         * When there is a failure for an internal Next.js request from
         * middleware we bypass the error without finishing the request
         * so we can serve the required chunks to render the error.
         */ if (
          request.url.includes('/_next/static') ||
          request.url.includes('/__nextjs_original-stack-frame')
        ) {
          return {
            finished: false,
          }
        }
        response.statusCode = 500
        _this.renderError(err, request, response, parsedUrl.pathname)
        return {
          finished: true,
        }
      }
    })()
  }
  runEdgeFunction(params) {
    var _this = this,
      _superprop_get_runEdgeFunction = () => super.runEdgeFunction
    return _async_to_generator(function* () {
      try {
        return _superprop_get_runEdgeFunction().call(
          _this,
          _extends({}, params, {
            onWarning: (warn) => {
              _this.logErrorWithOriginalStack(warn, 'warning')
            },
          })
        )
      } catch (error) {
        if (error instanceof _utils1.DecodeError) {
          throw error
        }
        _this.logErrorWithOriginalStack(error, 'warning')
        const err = (0, _isError).getProperError(error)
        const { req, res, page } = params
        res.statusCode = 500
        _this.renderError(err, req, res, page)
        return null
      }
    })()
  }
  run(req, res, parsedUrl) {
    var _this = this,
      _superprop_get_run = () => super.run
    return _async_to_generator(function* () {
      yield _this.devReady
      _this.setupWebSocketHandler(undefined, req)
      const { basePath } = _this.nextConfig
      let originalPathname = null
      if (
        basePath &&
        (0, _pathHasPrefix).pathHasPrefix(parsedUrl.pathname || '/', basePath)
      ) {
        // strip basePath before handling dev bundles
        // If replace ends up replacing the full url it'll be `undefined`, meaning we have to default it to `/`
        originalPathname = parsedUrl.pathname
        parsedUrl.pathname = (0, _removePathPrefix).removePathPrefix(
          parsedUrl.pathname || '/',
          basePath
        )
      }
      const { pathname } = parsedUrl
      if (pathname.startsWith('/_next')) {
        if (
          yield (0, _fileExists).fileExists(
            (0, _path).join(_this.publicDir, '_next')
          )
        ) {
          throw new Error(_constants.PUBLIC_DIR_MIDDLEWARE_CONFLICT)
        }
      }
      const { finished = false } = yield _this.hotReloader.run(
        req.originalRequest,
        res.originalResponse,
        parsedUrl
      )
      if (finished) {
        return
      }
      if (originalPathname) {
        // restore the path before continuing so that custom-routes can accurately determine
        // if they should match against the basePath or not
        parsedUrl.pathname = originalPathname
      }
      try {
        return yield _superprop_get_run().call(_this, req, res, parsedUrl)
      } catch (error) {
        res.statusCode = 500
        const err = (0, _isError).getProperError(error)
        try {
          _this.logErrorWithOriginalStack(err).catch(() => {})
          return yield _this.renderError(err, req, res, pathname, {
            __NEXT_PAGE:
              ((0, _isError).default(err) && err.page) || pathname || '',
          })
        } catch (internalErr) {
          console.error(internalErr)
          res.body('Internal Server Error').send()
        }
      }
    })()
  }
  logErrorWithOriginalStack(err, type) {
    var _this = this
    return _async_to_generator(function* () {
      let usedOriginalStack = false
      if ((0, _isError).default(err) && err.stack) {
        try {
          const frames = (0, _middleware).parseStack(err.stack)
          const frame = frames.find(({ file }) => {
            return (
              !(file == null ? void 0 : file.startsWith('eval')) &&
              !(file == null ? void 0 : file.includes('web/adapter')) &&
              !(file == null ? void 0 : file.includes('sandbox/context'))
            )
          })
          if (frame.lineNumber && (frame == null ? void 0 : frame.file)) {
            var ref, ref19, ref20, ref21, ref22, ref23
            const moduleId = frame.file.replace(
              /^(webpack-internal:\/\/\/|file:\/\/)/,
              ''
            )
            const src = (0, _middleware).getErrorSource(err)
            const compilation =
              src === _constants1.COMPILER_NAMES.edgeServer
                ? (ref = _this.hotReloader) == null
                  ? void 0
                  : (ref19 = ref.edgeServerStats) == null
                  ? void 0
                  : ref19.compilation
                : (ref20 = _this.hotReloader) == null
                ? void 0
                : (ref21 = ref20.serverStats) == null
                ? void 0
                : ref21.compilation
            const source = yield (0, _middleware).getSourceById(
              !!((ref22 = frame.file) == null
                ? void 0
                : ref22.startsWith(_path.sep)) ||
                !!((ref23 = frame.file) == null
                  ? void 0
                  : ref23.startsWith('file:')),
              moduleId,
              compilation
            )
            const originalFrame = yield (0,
            _middleware).createOriginalStackFrame({
              line: frame.lineNumber,
              column: frame.column,
              source,
              frame,
              modulePath: moduleId,
              rootDirectory: _this.dir,
              errorMessage: err.message,
              compilation,
            })
            if (originalFrame) {
              const { originalCodeFrame, originalStackFrame } = originalFrame
              const { file, lineNumber, column, methodName } =
                originalStackFrame
              Log[type === 'warning' ? 'warn' : 'error'](
                `${file} (${lineNumber}:${column}) @ ${methodName}`
              )
              if (src === _constants1.COMPILER_NAMES.edgeServer) {
                err = err.message
              }
              if (type === 'warning') {
                Log.warn(err)
              } else if (type) {
                Log.error(`${type}:`, err)
              } else {
                Log.error(err)
              }
              console[type === 'warning' ? 'warn' : 'error'](originalCodeFrame)
              usedOriginalStack = true
            }
          }
        } catch (_) {
          // failed to load original stack using source maps
          // this un-actionable by users so we don't show the
          // internal error and only show the provided stack
        }
      }
      if (!usedOriginalStack) {
        if (type === 'warning') {
          Log.warn(err)
        } else if (type) {
          Log.error(`${type}:`, err)
        } else {
          Log.error(err)
        }
      }
    })()
  }
  // override production loading of routes-manifest
  getCustomRoutes() {
    // actual routes will be loaded asynchronously during .prepare()
    return {
      redirects: [],
      rewrites: {
        beforeFiles: [],
        afterFiles: [],
        fallback: [],
      },
      headers: [],
    }
  }
  getPreviewProps() {
    if (this._devCachedPreviewProps) {
      return this._devCachedPreviewProps
    }
    return (this._devCachedPreviewProps = {
      previewModeId: _crypto.default.randomBytes(16).toString('hex'),
      previewModeSigningKey: _crypto.default.randomBytes(32).toString('hex'),
      previewModeEncryptionKey: _crypto.default.randomBytes(32).toString('hex'),
    })
  }
  getPagesManifest() {
    return undefined
  }
  getAppPathsManifest() {
    return undefined
  }
  getMiddleware() {
    return this.middleware
  }
  getEdgeFunctions() {
    var _edgeFunctions
    return (_edgeFunctions = this.edgeFunctions) != null ? _edgeFunctions : []
  }
  getServerComponentManifest() {
    return undefined
  }
  getServerCSSManifest() {
    return undefined
  }
  hasMiddleware() {
    var _this = this
    return _async_to_generator(function* () {
      return _this.hasPage(_this.actualMiddlewareFile)
    })()
  }
  ensureMiddleware() {
    var _this = this
    return _async_to_generator(function* () {
      return _this.hotReloader.ensurePage({
        page: _this.actualMiddlewareFile,
      })
    })()
  }
  ensureEdgeFunction({ page, appPaths }) {
    var _this = this
    return _async_to_generator(function* () {
      return _this.hotReloader.ensurePage({
        page,
        appPaths,
      })
    })()
  }
  generateRoutes() {
    const _ref = super.generateRoutes(),
      { fsRoutes } = _ref,
      otherRoutes = _object_without_properties_loose(_ref, ['fsRoutes'])
    var _this = this
    // In development we expose all compiled files for react-error-overlay's line show feature
    // We use unshift so that we're sure the routes is defined before Next's default routes
    fsRoutes.unshift({
      match: (0, _pathMatch).getPathMatch('/_next/development/:path*'),
      type: 'route',
      name: '_next/development catchall',
      fn: _async_to_generator(function* (req, res, params) {
        const p = (0, _path).join(_this.distDir, ...(params.path || []))
        yield _this.serveStatic(req, res, p)
        return {
          finished: true,
        }
      }),
    })
    var _this1 = this
    fsRoutes.unshift({
      match: (0, _pathMatch).getPathMatch(
        `/_next/${_constants1.CLIENT_STATIC_FILES_PATH}/${this.buildId}/${_constants1.DEV_CLIENT_PAGES_MANIFEST}`
      ),
      type: 'route',
      name: `_next/${_constants1.CLIENT_STATIC_FILES_PATH}/${this.buildId}/${_constants1.DEV_CLIENT_PAGES_MANIFEST}`,
      fn: _async_to_generator(function* (_req, res) {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res
          .body(
            JSON.stringify({
              pages: _this1.sortedRoutes,
            })
          )
          .send()
        return {
          finished: true,
        }
      }),
    })
    var _this2 = this
    fsRoutes.unshift({
      match: (0, _pathMatch).getPathMatch(
        `/_next/${_constants1.CLIENT_STATIC_FILES_PATH}/${this.buildId}/${_constants1.DEV_MIDDLEWARE_MANIFEST}`
      ),
      type: 'route',
      name: `_next/${_constants1.CLIENT_STATIC_FILES_PATH}/${this.buildId}/${_constants1.DEV_MIDDLEWARE_MANIFEST}`,
      fn: _async_to_generator(function* (_req, res) {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res
          .body(
            JSON.stringify(
              _this2.middleware
                ? {
                    location: _this2.middleware.re.source,
                  }
                : {}
            )
          )
          .send()
        return {
          finished: true,
        }
      }),
    })
    var _this3 = this
    fsRoutes.push({
      match: (0, _pathMatch).getPathMatch('/:path*'),
      type: 'route',
      name: 'catchall public directory route',
      fn: _async_to_generator(function* (req, res, params, parsedUrl) {
        const { pathname } = parsedUrl
        if (!pathname) {
          throw new Error('pathname is undefined')
        }
        // Used in development to check public directory paths
        if (yield _this3._beforeCatchAllRender(req, res, params, parsedUrl)) {
          return {
            finished: true,
          }
        }
        return {
          finished: false,
        }
      }),
    })
    return _extends(
      {
        fsRoutes,
      },
      otherRoutes
    )
  }
  // In development public files are not added to the router but handled as a fallback instead
  generatePublicRoutes() {
    return []
  }
  // In development dynamic routes cannot be known ahead of time
  getDynamicRoutes() {
    return []
  }
  _filterAmpDevelopmentScript(html, event) {
    if (event.code !== 'DISALLOWED_SCRIPT_TAG') {
      return true
    }
    const snippetChunks = html.split('\n')
    let snippet
    if (
      !(snippet = html.split('\n')[event.line - 1]) ||
      !(snippet = snippet.substring(event.col))
    ) {
      return true
    }
    snippet = snippet + snippetChunks.slice(event.line).join('\n')
    snippet = snippet.substring(0, snippet.indexOf('</script>'))
    return !snippet.includes('data-amp-development-mode-only')
  }
  getStaticPaths(pathname) {
    var _this = this
    return _async_to_generator(function* () {
      // we lazy load the staticPaths to prevent the user
      // from waiting on them for the page to load in dev mode
      const __getStaticPaths = _async_to_generator(function* () {
        const {
          configFileName,
          publicRuntimeConfig,
          serverRuntimeConfig,
          httpAgentOptions,
        } = _this.nextConfig
        const { locales, defaultLocale } = _this.nextConfig.i18n || {}
        const paths = yield _this.getStaticPathsWorker().loadStaticPaths(
          _this.distDir,
          pathname,
          !_this.renderOpts.dev && _this._isLikeServerless,
          {
            configFileName,
            publicRuntimeConfig,
            serverRuntimeConfig,
          },
          httpAgentOptions,
          locales,
          defaultLocale
        )
        return paths
      })
      const { paths: staticPaths, fallback } = (yield (0,
      _coalescedFunction).withCoalescedInvoke(__getStaticPaths)(
        `staticPaths-${pathname}`,
        []
      )).value
      return {
        staticPaths,
        fallbackMode:
          fallback === 'blocking'
            ? 'blocking'
            : fallback === true
            ? 'static'
            : false,
      }
    })()
  }
  ensureApiPage(pathname) {
    var _this = this
    return _async_to_generator(function* () {
      return _this.hotReloader.ensurePage({
        page: pathname,
      })
    })()
  }
  findPageComponents({
    pathname,
    query = {},
    params = null,
    isAppDir = false,
    appPaths,
  }) {
    var _this = this,
      _superprop_get_getServerComponentManifest = () =>
        super.getServerComponentManifest,
      _superprop_get_getServerCSSManifest = () => super.getServerCSSManifest,
      _superprop_get_findPageComponents = () => super.findPageComponents
    return _async_to_generator(function* () {
      yield _this.devReady
      const compilationErr = yield _this.getCompilationError(pathname)
      if (compilationErr) {
        // Wrap build errors so that they don't get logged again
        throw new _nextServer.WrappedBuildError(compilationErr)
      }
      try {
        yield _this.hotReloader.ensurePage({
          page: pathname,
          appPaths,
        })
        const serverComponents = _this.nextConfig.experimental.serverComponents
        // When the new page is compiled, we need to reload the server component
        // manifest.
        if (serverComponents) {
          _this.serverComponentManifest =
            _superprop_get_getServerComponentManifest().call(_this)
          _this.serverCSSManifest =
            _superprop_get_getServerCSSManifest().call(_this)
        }
        return _superprop_get_findPageComponents().call(_this, {
          pathname,
          query,
          params,
          isAppDir,
        })
      } catch (err) {
        if (err.code !== 'ENOENT') {
          throw err
        }
        return null
      }
    })()
  }
  getFallbackErrorComponents() {
    var _this = this
    return _async_to_generator(function* () {
      yield _this.hotReloader.buildFallbackError()
      // Build the error page to ensure the fallback is built too.
      // TODO: See if this can be moved into hotReloader or removed.
      yield _this.hotReloader.ensurePage({
        page: '/_error',
      })
      return yield (0, _loadComponents).loadDefaultErrorComponents(
        _this.distDir
      )
    })()
  }
  setImmutableAssetCacheControl(res) {
    res.setHeader('Cache-Control', 'no-store, must-revalidate')
  }
  servePublic(req, res, pathParts) {
    const p = (0, _path).join(this.publicDir, ...pathParts)
    return this.serveStatic(req, res, p)
  }
  hasPublicFile(path) {
    var _this = this
    return _async_to_generator(function* () {
      try {
        const info = yield _fs.default.promises.stat(
          (0, _path).join(_this.publicDir, path)
        )
        return info.isFile()
      } catch (_) {
        return false
      }
    })()
  }
  getCompilationError(page) {
    var _this = this
    return _async_to_generator(function* () {
      const errors = yield _this.hotReloader.getCompilationErrors(page)
      if (errors.length === 0) return
      // Return the very first error we found.
      return errors[0]
    })()
  }
  isServeableUrl(untrustedFileUrl) {
    // This method mimics what the version of `send` we use does:
    // 1. decodeURIComponent:
    //    https://github.com/pillarjs/send/blob/0.17.1/index.js#L989
    //    https://github.com/pillarjs/send/blob/0.17.1/index.js#L518-L522
    // 2. resolve:
    //    https://github.com/pillarjs/send/blob/de073ed3237ade9ff71c61673a34474b30e5d45b/index.js#L561
    let decodedUntrustedFilePath
    try {
      // (1) Decode the URL so we have the proper file name
      decodedUntrustedFilePath = decodeURIComponent(untrustedFileUrl)
    } catch (e) {
      return false
    }
    // (2) Resolve "up paths" to determine real request
    const untrustedFilePath = (0, _path).resolve(decodedUntrustedFilePath)
    // don't allow null bytes anywhere in the file path
    if (untrustedFilePath.indexOf('\0') !== -1) {
      return false
    }
    // During development mode, files can be added while the server is running.
    // Checks for .next/static, .next/server, static and public.
    // Note that in development .next/server is available for error reporting purposes.
    // see `packages/next/server/next-server.ts` for more details.
    if (
      untrustedFilePath.startsWith(
        (0, _path).join(this.distDir, 'static') + _path.sep
      ) ||
      untrustedFilePath.startsWith(
        (0, _path).join(this.distDir, 'server') + _path.sep
      ) ||
      untrustedFilePath.startsWith(
        (0, _path).join(this.dir, 'static') + _path.sep
      ) ||
      untrustedFilePath.startsWith(
        (0, _path).join(this.dir, 'public') + _path.sep
      )
    ) {
      return true
    }
    return false
  }
  constructor(options) {
    var ref, ref24
    super(
      _extends({}, options, {
        dev: true,
      })
    )
    this.addedUpgradeListener = false
    this.renderOpts.dev = true
    this.renderOpts.ErrorDebug = ReactDevOverlay
    this.devReady = new Promise((resolve) => {
      this.setDevReady = resolve
    })
    var ref25
    this.renderOpts.ampSkipValidation =
      (ref25 =
        (ref = this.nextConfig.experimental) == null
          ? void 0
          : (ref24 = ref.amp) == null
          ? void 0
          : ref24.skipValidation) != null
        ? ref25
        : false
    this.renderOpts.ampValidator = (html, pathname) => {
      const validatorPath =
        this.nextConfig.experimental &&
        this.nextConfig.experimental.amp &&
        this.nextConfig.experimental.amp.validator
      const AmpHtmlValidator = require('next/dist/compiled/amphtml-validator')
      return AmpHtmlValidator.getInstance(validatorPath).then((validator) => {
        const result = validator.validateString(html)
        ;(0, _output).ampValidation(
          pathname,
          result.errors
            .filter((e) => e.severity === 'ERROR')
            .filter((e) => this._filterAmpDevelopmentScript(html, e)),
          result.errors.filter((e) => e.severity !== 'ERROR')
        )
      })
    }
    if (_fs.default.existsSync((0, _path).join(this.dir, 'static'))) {
      console.warn(
        `The static directory has been deprecated in favor of the public directory. https://nextjs.org/docs/messages/static-dir-deprecated`
      )
    }
    // setup upgrade listener eagerly when we can otherwise
    // it will be done on the first request via req.socket.server
    if (options.httpServer) {
      this.setupWebSocketHandler(options.httpServer)
    }
    this.isCustomServer = !options.isNextDevCommand
    // TODO: hot-reload root/pages dirs?
    const { pages: pagesDir, appDir } = (0, _findPagesDir).findPagesDir(
      this.dir,
      this.nextConfig.experimental.appDir
    )
    this.pagesDir = pagesDir
    this.appDir = appDir
  }
}
exports.default = DevServer

//# sourceMappingURL=next-dev-server.js.map
