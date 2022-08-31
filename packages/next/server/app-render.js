'use strict'
Object.defineProperty(exports, '__esModule', {
  value: true,
})
exports.renderToHTMLOrFlight = renderToHTMLOrFlight
var _react = _interopRequireDefault(require('react'))
var _querystring = require('querystring')
var _reactServerDomWebpack = require('next/dist/compiled/react-server-dom-webpack')
var _writerBrowserServer = require('next/dist/compiled/react-server-dom-webpack/writer.browser.server')
var _renderResult = _interopRequireDefault(require('./render-result'))
var _nodeWebStreamsHelper = require('./node-web-streams-helper')
var _utils = require('../shared/lib/router/utils')
var _htmlescape = require('./htmlescape')
var _utils1 = require('./utils')
var _matchSegments = require('../client/components/match-segments')
var _hooksClient = require('../client/components/hooks-client')
function _interopRequireDefault(obj) {
  return obj && obj.__esModule
    ? obj
    : {
        default: obj,
      }
}
// this needs to be required lazily so that `next-server` can set
// the env before we require
const ReactDOMServer = _utils1.shouldUseReactRoot
  ? require('react-dom/server.browser')
  : require('react-dom/server')
/**
 * Interop between "export default" and "module.exports".
 */ function interopDefault(mod) {
  return mod.default || mod
}
const rscCache = new Map()
var // Shadowing check does not work with TypeScript enums
  // eslint-disable-next-line no-shadow
  RecordStatus
;(function (RecordStatus) {
  RecordStatus[(RecordStatus['Pending'] = 0)] = 'Pending'
  RecordStatus[(RecordStatus['Resolved'] = 1)] = 'Resolved'
  RecordStatus[(RecordStatus['Rejected'] = 2)] = 'Rejected'
})(RecordStatus || (RecordStatus = {}))
/**
 * Create data fetching record for Promise.
 */ function createRecordFromThenable(thenable) {
  const record = {
    status: 0,
    value: thenable,
  }
  thenable.then(
    function (value) {
      if (record.status === 0) {
        const resolvedRecord = record
        resolvedRecord.status = 1
        resolvedRecord.value = value
      }
    },
    function (err) {
      if (record.status === 0) {
        const rejectedRecord = record
        rejectedRecord.status = 2
        rejectedRecord.value = err
      }
    }
  )
  return record
}
/**
 * Read record value or throw Promise if it's not resolved yet.
 */ function readRecordValue(record) {
  if (record.status === 1) {
    return record.value
  } else {
    throw record.value
  }
}
/**
 * Preload data fetching record before it is called during React rendering.
 * If the record is already in the cache returns that record.
 */ function preloadDataFetchingRecord(map, key, fetcher) {
  let record = map.get(key)
  if (!record) {
    const thenable = fetcher()
    record = createRecordFromThenable(thenable)
    map.set(key, record)
  }
  return record
}
/**
 * Render Flight stream.
 * This is only used for renderToHTML, the Flight response does not need additional wrappers.
 */ function useFlightResponse(
  writable,
  cachePrefix,
  req,
  serverComponentManifest
) {
  const id = cachePrefix + ',' + _react.default.useId()
  let entry = rscCache.get(id)
  if (!entry) {
    const [renderStream, forwardStream] = (0,
    _nodeWebStreamsHelper).readableStreamTee(req)
    entry = (0, _reactServerDomWebpack).createFromReadableStream(renderStream, {
      moduleMap: serverComponentManifest.__ssr_module_mapping__,
    })
    rscCache.set(id, entry)
    let bootstrapped = false
    // We only attach CSS chunks to the inlined data.
    const forwardReader = forwardStream.getReader()
    const writer = writable.getWriter()
    function process() {
      forwardReader.read().then(({ done, value }) => {
        if (!bootstrapped) {
          bootstrapped = true
          writer.write(
            (0, _nodeWebStreamsHelper).encodeText(
              `<script>(self.__next_s=self.__next_s||[]).push(${(0,
              _htmlescape).htmlEscapeJsonString(
                JSON.stringify([0, id])
              )})</script>`
            )
          )
        }
        if (done) {
          rscCache.delete(id)
          writer.close()
        } else {
          const responsePartial = (0, _nodeWebStreamsHelper).decodeText(value)
          const scripts = `<script>(self.__next_s=self.__next_s||[]).push(${(0,
          _htmlescape).htmlEscapeJsonString(
            JSON.stringify([1, id, responsePartial])
          )})</script>`
          writer.write((0, _nodeWebStreamsHelper).encodeText(scripts))
          process()
        }
      })
    }
    process()
  }
  return entry
}
/**
 * Create a component that renders the Flight stream.
 * This is only used for renderToHTML, the Flight response does not need additional wrappers.
 */ function createServerComponentRenderer(
  ComponentToRender,
  ComponentMod,
  { cachePrefix, transformStream, serverComponentManifest, serverContexts }
) {
  // We need to expose the `__webpack_require__` API globally for
  // react-server-dom-webpack. This is a hack until we find a better way.
  if (ComponentMod.__next_app_webpack_require__ || ComponentMod.__next_rsc__) {
    var ref
    // @ts-ignore
    globalThis.__next_require__ =
      ComponentMod.__next_app_webpack_require__ ||
      ((ref = ComponentMod.__next_rsc__) == null
        ? void 0
        : ref.__webpack_require__)
    // @ts-ignore
    globalThis.__next_chunk_load__ = () => Promise.resolve()
  }
  let RSCStream
  const createRSCStream = () => {
    if (!RSCStream) {
      RSCStream = (0, _writerBrowserServer).renderToReadableStream(
        /*#__PURE__*/ _react.default.createElement(ComponentToRender, null),
        serverComponentManifest,
        {
          context: serverContexts,
        }
      )
    }
    return RSCStream
  }
  const writable = transformStream.writable
  return function ServerComponentWrapper() {
    const reqStream = createRSCStream()
    const response = useFlightResponse(
      writable,
      cachePrefix,
      reqStream,
      serverComponentManifest
    )
    return response.readRoot()
  }
}
/**
 * Shorten the dynamic param in order to make it smaller when transmitted to the browser.
 */ function getShortDynamicParamType(type) {
  switch (type) {
    case 'catchall':
      return 'c'
    case 'optional-catchall':
      return 'oc'
    case 'dynamic':
      return 'd'
    default:
      throw new Error('Unknown dynamic param type')
  }
}
/**
 * Parse dynamic route segment to type of parameter
 */ function getSegmentParam(segment) {
  if (segment.startsWith('[[...') && segment.endsWith(']]')) {
    return {
      type: 'optional-catchall',
      param: segment.slice(5, -2),
    }
  }
  if (segment.startsWith('[...') && segment.endsWith(']')) {
    return {
      type: 'catchall',
      param: segment.slice(4, -1),
    }
  }
  if (segment.startsWith('[') && segment.endsWith(']')) {
    return {
      type: 'dynamic',
      param: segment.slice(1, -1),
    }
  }
  return null
}
/**
 * Get inline <link> tags based on server CSS manifest. Only used when rendering to HTML.
 */ function getCssInlinedLinkTags(
  serverComponentManifest,
  serverCSSManifest,
  filePath
) {
  var ref
  const layoutOrPageCss =
    serverCSSManifest[filePath] ||
    ((ref = serverComponentManifest.__client_css_manifest__) == null
      ? void 0
      : ref[filePath])
  if (!layoutOrPageCss) {
    return []
  }
  const chunks = new Set()
  for (const css of layoutOrPageCss) {
    const mod = serverComponentManifest[css]
    if (mod) {
      for (const chunk of mod.default.chunks) {
        chunks.add(chunk)
      }
    }
  }
  return [...chunks]
}
async function renderToHTMLOrFlight(
  req,
  res,
  pathname,
  query,
  renderOpts,
  isPagesDir
) {
  // @ts-expect-error createServerContext exists in react@experimental + react-dom@experimental
  if (typeof _react.default.createServerContext === 'undefined') {
    throw new Error(
      '"app" directory requires React.createServerContext which is not available in the version of React you are using. Please update to react@experimental and react-dom@experimental.'
    )
  }
  // don't modify original query object
  query = Object.assign({}, query)
  const {
    buildManifest,
    serverComponentManifest,
    serverCSSManifest = {},
    supportsDynamicHTML,
    ComponentMod,
  } = renderOpts
  const isFlight = query.__flight__ !== undefined
  // Handle client-side navigation to pages directory
  if (isFlight && isPagesDir) {
    ;(0, _utils1).stripInternalQueries(query)
    const search = (0, _querystring).stringify(query)
    // Empty so that the client-side router will do a full page navigation.
    const flightData = pathname + (search ? `?${search}` : '')
    return new _renderResult.default(
      (0, _writerBrowserServer)
        .renderToReadableStream(flightData, serverComponentManifest)
        .pipeThrough((0, _nodeWebStreamsHelper).createBufferedTransformStream())
    )
  }
  // TODO-APP: verify the tree is valid
  // TODO-APP: verify query param is single value (not an array)
  // TODO-APP: verify tree can't grow out of control
  /**
   * Router state provided from the client-side router. Used to handle rendering from the common layout down.
   */ const providedFlightRouterState = isFlight
    ? query.__flight_router_state_tree__
      ? JSON.parse(query.__flight_router_state_tree__)
      : {}
    : undefined
  ;(0, _utils1).stripInternalQueries(query)
  const pageIsDynamic = (0, _utils).isDynamicRoute(pathname)
  const LayoutRouter = ComponentMod.LayoutRouter
  const HotReloader = ComponentMod.HotReloader
  const headers = req.headers
  // TODO-APP: fix type of req
  // @ts-expect-error
  const cookies = req.cookies
  /**
   * The tree created in next-app-loader that holds component segments and modules
   */ const loaderTree = ComponentMod.tree
  const tryGetPreviewData =
    process.env.NEXT_RUNTIME === 'edge'
      ? () => false
      : require('./api-utils/node').tryGetPreviewData
  // Reads of this are cached on the `req` object, so this should resolve
  // instantly. There's no need to pass this data down from a previous
  // invoke, where we'd have to consider server & serverless.
  const previewData = tryGetPreviewData(req, res, renderOpts.previewProps)
  const isPreview = previewData !== false
  /**
   * Server Context is specifically only available in Server Components.
   * It has to hold values that can't change while rendering from the common layout down.
   * An example of this would be that `headers` are available but `searchParams` are not because that'd mean we have to render from the root layout down on all requests.
   */ const serverContexts = [
    ['WORKAROUND', null],
    ['HeadersContext', headers],
    ['CookiesContext', cookies],
    ['PreviewDataContext', previewData],
  ]
  /**
   * Used to keep track of in-flight / resolved data fetching Promises.
   */ const dataCache = new Map()
  /**
   * Dynamic parameters. E.g. when you visit `/dashboard/vercel` which is rendered by `/dashboard/[slug]` the value will be {"slug": "vercel"}.
   */ const pathParams = renderOpts.params
  /**
   * Parse the dynamic segment and return the associated value.
   */ const getDynamicParamFromSegment = (
    // [slug] / [[slug]] / [...slug]
    segment
  ) => {
    const segmentParam = getSegmentParam(segment)
    if (!segmentParam) {
      return null
    }
    const key = segmentParam.param
    const value = pathParams[key]
    if (!value) {
      // Handle case where optional catchall does not have a value, e.g. `/dashboard/[...slug]` when requesting `/dashboard`
      if (segmentParam.type === 'optional-catchall') {
        const type = getShortDynamicParamType(segmentParam.type)
        return {
          param: key,
          value: null,
          type: type,
          // This value always has to be a string.
          treeSegment: [key, '', type],
        }
      }
      return null
    }
    const type = getShortDynamicParamType(segmentParam.type)
    return {
      param: key,
      // The value that is passed to user code.
      value: value,
      // The value that is rendered in the router tree.
      treeSegment: [key, Array.isArray(value) ? value.join('/') : value, type],
      type: type,
    }
  }
  const createFlightRouterStateFromLoaderTree = ([
    segment,
    parallelRoutes,
    { loading },
  ]) => {
    const hasLoading = Boolean(loading)
    const dynamicParam = getDynamicParamFromSegment(segment)
    const segmentTree = [dynamicParam ? dynamicParam.treeSegment : segment, {}]
    if (parallelRoutes) {
      segmentTree[1] = Object.keys(parallelRoutes).reduce(
        (existingValue, currentValue) => {
          existingValue[currentValue] = createFlightRouterStateFromLoaderTree(
            parallelRoutes[currentValue]
          )
          return existingValue
        },
        {}
      )
    }
    if (hasLoading) {
      segmentTree[4] = 'loading'
    }
    return segmentTree
  }
  /**
   * Use the provided loader tree to create the React Component tree.
   */ const createComponentTree = async ({
    createSegmentPath,
    loaderTree: [segment, parallelRoutes, { filePath, layout, loading, page }],
    parentParams,
    firstItem,
    rootLayoutIncluded,
  }) => {
    // TODO-APP: enable stylesheet per layout/page
    const stylesheets = getCssInlinedLinkTags(
      serverComponentManifest,
      serverCSSManifest,
      filePath
    )
    const Loading = loading ? await interopDefault(loading()) : undefined
    const isLayout = typeof layout !== 'undefined'
    const isPage = typeof page !== 'undefined'
    const layoutOrPageMod = isLayout
      ? await layout()
      : isPage
      ? await page()
      : undefined
    /**
     * Checks if the current segment is a root layout.
     */ const rootLayoutAtThisLevel = isLayout && !rootLayoutIncluded
    /**
     * Checks if the current segment or any level above it has a root layout.
     */ const rootLayoutIncludedAtThisLevelOrAbove =
      rootLayoutIncluded || rootLayoutAtThisLevel
    /**
     * Check if the current layout/page is a client component
     */ const isClientComponentModule =
      layoutOrPageMod && !layoutOrPageMod.hasOwnProperty('__next_rsc__')
    /**
     * The React Component to render.
     */ const Component = layoutOrPageMod
      ? interopDefault(layoutOrPageMod)
      : undefined
    // Handle dynamic segment params.
    const segmentParam = getDynamicParamFromSegment(segment)
    /**
     * Create object holding the parent params and current params, this is passed to getServerSideProps and getStaticProps.
     */ const currentParams = // Handle null case where dynamic param is optional
      segmentParam && segmentParam.value !== null
        ? {
            ...parentParams,
            [segmentParam.param]: segmentParam.value,
          }
        : parentParams
    // Resolve the segment param
    const actualSegment = segmentParam ? segmentParam.treeSegment : segment
    // This happens outside of rendering in order to eagerly kick off data fetching for layouts / the page further down
    const parallelRouteMap = await Promise.all(
      Object.keys(parallelRoutes).map(async (parallelRouteKey) => {
        const currentSegmentPath = firstItem
          ? [parallelRouteKey]
          : [actualSegment, parallelRouteKey]
        // Create the child component
        const { Component: ChildComponent } = await createComponentTree({
          createSegmentPath: (child) => {
            return createSegmentPath([...currentSegmentPath, ...child])
          },
          loaderTree: parallelRoutes[parallelRouteKey],
          parentParams: currentParams,
          rootLayoutIncluded: rootLayoutIncludedAtThisLevelOrAbove,
        })
        const childSegment = parallelRoutes[parallelRouteKey][0]
        const childSegmentParam = getDynamicParamFromSegment(childSegment)
        const childProp = {
          current: /*#__PURE__*/ _react.default.createElement(
            ChildComponent,
            null
          ),
          segment: childSegmentParam
            ? childSegmentParam.treeSegment
            : childSegment,
        }
        // This is turned back into an object below.
        return [
          parallelRouteKey,
          /*#__PURE__*/ _react.default.createElement(LayoutRouter, {
            parallelRouterKey: parallelRouteKey,
            segmentPath: createSegmentPath(currentSegmentPath),
            loading: Loading
              ? /*#__PURE__*/ _react.default.createElement(Loading, null)
              : undefined,
            childProp: childProp,
            rootLayoutIncluded: rootLayoutIncludedAtThisLevelOrAbove,
          }),
        ]
      })
    )
    // Convert the parallel route map into an object after all promises have been resolved.
    const parallelRouteComponents = parallelRouteMap.reduce(
      (list, [parallelRouteKey, Comp]) => {
        list[parallelRouteKey] = Comp
        return list
      },
      {}
    )
    // When the segment does not have a layout or page we still have to add the layout router to ensure the path holds the loading component
    if (!Component) {
      return {
        Component: () =>
          /*#__PURE__*/ _react.default.createElement(
            _react.default.Fragment,
            null,
            parallelRouteComponents.children
          ),
      }
    }
    const segmentPath = createSegmentPath([actualSegment])
    const dataCacheKey = JSON.stringify(segmentPath)
    let fetcher = null
    // TODO-APP: pass a shared cache from previous getStaticProps/getServerSideProps calls?
    if (!isClientComponentModule && layoutOrPageMod.getServerSideProps) {
      // TODO-APP: recommendation for i18n
      // locales: (renderOpts as any).locales, // always the same
      // locale: (renderOpts as any).locale, // /nl/something -> nl
      // defaultLocale: (renderOpts as any).defaultLocale, // changes based on domain
      const getServerSidePropsContext = {
        headers,
        cookies,
        layoutSegments: segmentPath,
        // TODO-APP: change pathname to actual pathname, it holds the dynamic parameter currently
        ...(isPage
          ? {
              searchParams: query,
              pathname,
            }
          : {}),
        ...(pageIsDynamic
          ? {
              params: currentParams,
            }
          : undefined),
        ...(isPreview
          ? {
              preview: true,
              previewData: previewData,
            }
          : undefined),
      }
      fetcher = () =>
        Promise.resolve(
          layoutOrPageMod.getServerSideProps(getServerSidePropsContext)
        )
    }
    // TODO-APP: implement layout specific caching for getStaticProps
    if (!isClientComponentModule && layoutOrPageMod.getStaticProps) {
      const getStaticPropsContext = {
        layoutSegments: segmentPath,
        ...(isPage
          ? {
              pathname,
            }
          : {}),
        ...(pageIsDynamic
          ? {
              params: currentParams,
            }
          : undefined),
        ...(isPreview
          ? {
              preview: true,
              previewData: previewData,
            }
          : undefined),
      }
      fetcher = () =>
        Promise.resolve(layoutOrPageMod.getStaticProps(getStaticPropsContext))
    }
    if (fetcher) {
      // Kick off data fetching before rendering, this ensures there is no waterfall for layouts as
      // all data fetching required to render the page is kicked off simultaneously
      preloadDataFetchingRecord(dataCache, dataCacheKey, fetcher)
    }
    return {
      Component: () => {
        let props
        // The data fetching was kicked off before rendering (see above)
        // if the data was not resolved yet the layout rendering will be suspended
        if (fetcher) {
          const record = preloadDataFetchingRecord(
            dataCache,
            dataCacheKey,
            fetcher
          )
          // Result of calling getStaticProps or getServerSideProps. If promise is not resolve yet it will suspend.
          const recordValue = readRecordValue(record)
          if (props) {
            props = Object.assign({}, props, recordValue.props)
          } else {
            props = recordValue.props
          }
        }
        return /*#__PURE__*/ _react.default.createElement(
          _react.default.Fragment,
          null,
          stylesheets
            ? stylesheets.map((href) =>
                /*#__PURE__*/ _react.default.createElement('link', {
                  rel: 'stylesheet',
                  href: `/_next/${href}?ts=${Date.now()}`,
                  // `Precedence` is an opt-in signal for React to handle
                  // resource loading and deduplication, etc:
                  // https://github.com/facebook/react/pull/25060
                  // @ts-ignore
                  precedence: 'high',
                  key: href,
                })
              )
            : null,
          /*#__PURE__*/ _react.default.createElement(
            Component,
            Object.assign(
              {},
              props,
              parallelRouteComponents,
              {
                // TODO-APP: params and query have to be blocked parallel route names. Might have to add a reserved name list.
                // Params are always the current params that apply to the layout
                // If you have a `/dashboard/[team]/layout.js` it will provide `team` as a param but not anything further down.
                params: currentParams,
              },
              isPage
                ? {
                    searchParams: query,
                  }
                : {}
            )
          )
        )
      },
    }
  }
  // Handle Flight render request. This is only used when client-side navigating. E.g. when you `router.push('/dashboard')` or `router.reload()`.
  if (isFlight) {
    // TODO-APP: throw on invalid flightRouterState
    /**
     * Use router state to decide at what common layout to render the page.
     * This can either be the common layout between two pages or a specific place to start rendering from using the "refetch" marker in the tree.
     */ const walkTreeWithFlightRouterState = async (
      loaderTreeToFilter,
      parentParams,
      flightRouterState,
      parentRendered
    ) => {
      const [segment, parallelRoutes] = loaderTreeToFilter
      const parallelRoutesKeys = Object.keys(parallelRoutes)
      // Because this function walks to a deeper point in the tree to start rendering we have to track the dynamic parameters up to the point where rendering starts
      // That way even when rendering the subtree getServerSideProps/getStaticProps get the right parameters.
      const segmentParam = getDynamicParamFromSegment(segment)
      const currentParams = // Handle null case where dynamic param is optional
        segmentParam && segmentParam.value !== null
          ? {
              ...parentParams,
              [segmentParam.param]: segmentParam.value,
            }
          : parentParams
      const actualSegment = segmentParam ? segmentParam.treeSegment : segment
      /**
       * Decide if the current segment is where rendering has to start.
       */ const renderComponentsOnThisLevel = // No further router state available
        !flightRouterState || // Segment in router state does not match current segment
        !(0, _matchSegments).matchSegment(
          actualSegment,
          flightRouterState[0]
        ) || // Last item in the tree
        parallelRoutesKeys.length === 0 || // Explicit refresh
        flightRouterState[3] === 'refetch'
      if (!parentRendered && renderComponentsOnThisLevel) {
        return [
          actualSegment,
          // Create router state using the slice of the loaderTree
          createFlightRouterStateFromLoaderTree(loaderTreeToFilter),
          // Create component tree using the slice of the loaderTree
          /*#__PURE__*/ _react.default.createElement(
            (
              await createComponentTree(
                // This ensures flightRouterPath is valid and filters down the tree
                {
                  createSegmentPath: (child) => child,
                  loaderTree: loaderTreeToFilter,
                  parentParams: currentParams,
                  firstItem: true,
                }
              )
            ).Component
          ),
        ]
      }
      // Walk through all parallel routes.
      for (const parallelRouteKey of parallelRoutesKeys) {
        const parallelRoute = parallelRoutes[parallelRouteKey]
        const path = await walkTreeWithFlightRouterState(
          parallelRoute,
          currentParams,
          flightRouterState && flightRouterState[1][parallelRouteKey],
          parentRendered || renderComponentsOnThisLevel
        )
        if (typeof path[path.length - 1] !== 'string') {
          return [actualSegment, parallelRouteKey, ...path]
        }
      }
      return [actualSegment]
    }
    // Flight data that is going to be passed to the browser.
    // Currently a single item array but in the future multiple patches might be combined in a single request.
    const flightData = [
      // TODO-APP: change walk to output without ''
      (
        await walkTreeWithFlightRouterState(
          loaderTree,
          {},
          providedFlightRouterState
        )
      ).slice(1),
    ]
    return new _renderResult.default(
      (0, _writerBrowserServer)
        .renderToReadableStream(flightData, serverComponentManifest, {
          context: serverContexts,
        })
        .pipeThrough((0, _nodeWebStreamsHelper).createBufferedTransformStream())
    )
  }
  // Below this line is handling for rendering to HTML.
  // Create full component tree from root to leaf.
  const { Component: ComponentTree } = await createComponentTree({
    createSegmentPath: (child) => child,
    loaderTree: loaderTree,
    parentParams: {},
    firstItem: true,
  })
  // AppRouter is provided by next-app-loader
  const AppRouter = ComponentMod.AppRouter
  let serverComponentsInlinedTransformStream = new TransformStream()
  // TODO-APP: validate req.url as it gets passed to render.
  const initialCanonicalUrl = req.url
  /**
   * A new React Component that renders the provided React Component
   * using Flight which can then be rendered to HTML.
   */ const ServerComponentsRenderer = createServerComponentRenderer(
    () => {
      const initialTree = createFlightRouterStateFromLoaderTree(loaderTree)
      return /*#__PURE__*/ _react.default.createElement(
        AppRouter,
        {
          hotReloader:
            HotReloader &&
            /*#__PURE__*/ _react.default.createElement(HotReloader, {
              assetPrefix: renderOpts.assetPrefix || '',
            }),
          initialCanonicalUrl: initialCanonicalUrl,
          initialTree: initialTree,
        },
        /*#__PURE__*/ _react.default.createElement(ComponentTree, null)
      )
    },
    ComponentMod,
    {
      cachePrefix: initialCanonicalUrl,
      transformStream: serverComponentsInlinedTransformStream,
      serverComponentManifest,
      serverContexts,
    }
  )
  const flushEffectsCallbacks = new Set()
  function FlushEffects({ children }) {
    // Reset flushEffectsHandler on each render
    flushEffectsCallbacks.clear()
    const addFlushEffects = _react.default.useCallback((handler) => {
      flushEffectsCallbacks.add(handler)
    }, [])
    return /*#__PURE__*/ _react.default.createElement(
      _hooksClient.FlushEffectsContext.Provider,
      {
        value: addFlushEffects,
      },
      children
    )
  }
  /**
   * Rules of Static & Dynamic HTML:
   *
   *    1.) We must generate static HTML unless the caller explicitly opts
   *        in to dynamic HTML support.
   *
   *    2.) If dynamic HTML support is requested, we must honor that request
   *        or throw an error. It is the sole responsibility of the caller to
   *        ensure they aren't e.g. requesting dynamic HTML for an AMP page.
   *
   * These rules help ensure that other existing features like request caching,
   * coalescing, and ISR continue working as intended.
   */ const generateStaticHTML = supportsDynamicHTML !== true
  const bodyResult = async () => {
    const content = /*#__PURE__*/ _react.default.createElement(
      FlushEffects,
      null,
      /*#__PURE__*/ _react.default.createElement(ServerComponentsRenderer, null)
    )
    const flushEffectHandler = () => {
      const flushed = ReactDOMServer.renderToString(
        /*#__PURE__*/ _react.default.createElement(
          _react.default.Fragment,
          null,
          Array.from(flushEffectsCallbacks).map((callback) => callback())
        )
      )
      return flushed
    }
    const renderStream = await (0, _nodeWebStreamsHelper).renderToInitialStream(
      {
        ReactDOMServer,
        element: content,
        streamOptions: {
          // Include hydration scripts in the HTML
          bootstrapScripts: buildManifest.rootMainFiles.map(
            (src) => `${renderOpts.assetPrefix || ''}/_next/` + src
          ),
        },
      }
    )
    return await (0, _nodeWebStreamsHelper).continueFromInitialStream(
      renderStream,
      {
        dataStream:
          serverComponentsInlinedTransformStream == null
            ? void 0
            : serverComponentsInlinedTransformStream.readable,
        generateStaticHTML: generateStaticHTML,
        flushEffectHandler,
        flushEffectsToHead: true,
      }
    )
  }
  return new _renderResult.default(await bodyResult())
}

//# sourceMappingURL=app-render.js.map
