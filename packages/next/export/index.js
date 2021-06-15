'use strict'

exports.__esModule = true
exports.default = exportApp

var _chalk = _interopRequireDefault(require('chalk'))

var _findUp = _interopRequireDefault(require('next/dist/compiled/find-up'))

var _fs = require('fs')

var _jestWorker = require('jest-worker')

var _path = require('path')

var _util = require('util')

var _index = require('../build/output/index')

var Log = _interopRequireWildcard(require('../build/output/log'))

var _spinner = _interopRequireDefault(require('../build/spinner'))

var _constants = require('../lib/constants')

var _recursiveCopy = require('../lib/recursive-copy')

var _recursiveDelete = require('../lib/recursive-delete')

var _constants2 = require('../next-server/lib/constants')

var _config = _interopRequireWildcard(require('../next-server/server/config'))

var _events = require('../telemetry/events')

var _ciInfo = require('../telemetry/ci-info')

var _storage = require('../telemetry/storage')

var _normalizePagePath = require('../next-server/server/normalize-page-path')

var _env = require('@next/env')

var _require = require('../next-server/server/require')

var _trace = require('../telemetry/trace')

function _getRequireWildcardCache() {
  if (typeof WeakMap !== 'function') return null
  var cache = new WeakMap()
  _getRequireWildcardCache = function () {
    return cache
  }
  return cache
}

function _interopRequireWildcard(obj) {
  if (obj && obj.__esModule) {
    return obj
  }
  if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
    return { default: obj }
  }
  var cache = _getRequireWildcardCache()
  if (cache && cache.has(obj)) {
    return cache.get(obj)
  }
  var newObj = {}
  var hasPropertyDescriptor =
    Object.defineProperty && Object.getOwnPropertyDescriptor
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      var desc = hasPropertyDescriptor
        ? Object.getOwnPropertyDescriptor(obj, key)
        : null
      if (desc && (desc.get || desc.set)) {
        Object.defineProperty(newObj, key, desc)
      } else {
        newObj[key] = obj[key]
      }
    }
  }
  newObj.default = obj
  if (cache) {
    cache.set(obj, newObj)
  }
  return newObj
}

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj }
}

const exists = (0, _util.promisify)(_fs.exists)

function divideSegments(number, segments) {
  const result = []

  while (number > 0 && segments > 0) {
    const dividedNumber =
      number < segments ? number : Math.floor(number / segments)
    number -= dividedNumber
    segments--
    result.push(dividedNumber)
  }

  return result
}

const createProgress = (total, label) => {
  const segments = divideSegments(total, 4)

  if (total === 0) {
    throw new Error('invariant: progress total can not be zero')
  }

  let currentSegmentTotal = segments.shift()
  let currentSegmentCount = 0
  let curProgress = 0
  let progressSpinner = (0, _spinner.default)(
    `${label} (${curProgress}/${total})`,
    {
      spinner: {
        frames: [
          '[    ]',
          '[=   ]',
          '[==  ]',
          '[=== ]',
          '[ ===]',
          '[  ==]',
          '[   =]',
          '[    ]',
          '[   =]',
          '[  ==]',
          '[ ===]',
          '[====]',
          '[=== ]',
          '[==  ]',
          '[=   ]',
        ],
        interval: 80,
      },
    }
  )
  return () => {
    curProgress++
    currentSegmentCount++ // Make sure we only log once per fully generated segment

    if (currentSegmentCount !== currentSegmentTotal) {
      return
    }

    currentSegmentTotal = segments.shift()
    currentSegmentCount = 0
    const newText = `${label} (${curProgress}/${total})`

    if (progressSpinner) {
      progressSpinner.text = newText
    } else {
      console.log(newText)
    }

    if (curProgress === total && progressSpinner) {
      progressSpinner.stop()
      console.log(newText)
    }
  }
}

async function exportApp(dir, options, configuration) {
  const nextExportSpan = (0, _trace.trace)('next-export')
  return nextExportSpan.traceAsyncFn(async () => {
    var _nextConfig$amp,
      _nextConfig$experimen,
      _nextConfig$experimen2,
      _nextConfig$experimen3

    dir = (0, _path.resolve)(dir) // attempt to load global env values so they are available in next.config.js

    nextExportSpan
      .traceChild('load-dotenv')
      .traceFn(() => (0, _env.loadEnvConfig)(dir, false, Log))
    const nextConfig =
      configuration ||
      (await nextExportSpan
        .traceChild('load-next-config')
        .traceAsyncFn(() =>
          (0, _config.default)(_constants2.PHASE_EXPORT, dir)
        ))
    const threads = options.threads || nextConfig.experimental.cpus
    const distDir = (0, _path.join)(dir, nextConfig.distDir)
    const telemetry = options.buildExport
      ? null
      : new _storage.Telemetry({
          distDir,
        })

    if (telemetry) {
      telemetry.record(
        (0, _events.eventCliSession)(_constants2.PHASE_EXPORT, distDir, {
          webpackVersion: null,
          cliCommand: 'export',
          isSrcDir: null,
          hasNowJson: !!(await (0, _findUp.default)('now.json', {
            cwd: dir,
          })),
          isCustomServer: null,
        })
      )
    }

    const subFolders = nextConfig.trailingSlash && !options.buildExport
    const isLikeServerless = nextConfig.target !== 'server'

    if (!options.silent && !options.buildExport) {
      Log.info(`using build directory: ${distDir}`)
    }

    const buildIdFile = (0, _path.join)(distDir, _constants2.BUILD_ID_FILE)

    if (!(0, _fs.existsSync)(buildIdFile)) {
      throw new Error(
        `Could not find a production build in the '${distDir}' directory. Try building your app with 'next build' before starting the static export. https://nextjs.org/docs/messages/next-export-no-build-id`
      )
    }

    const customRoutesDetected = ['rewrites', 'redirects', 'headers'].filter(
      (config) => typeof nextConfig[config] === 'function'
    )

    if (
      !_ciInfo.hasNextSupport &&
      !options.buildExport &&
      customRoutesDetected.length > 0
    ) {
      Log.warn(
        `rewrites, redirects, and headers are not applied when exporting your application, detected (${customRoutesDetected.join(
          ', '
        )}). See more info here: https://nextjs.org/docs/messages/export-no-custom-routes`
      )
    }

    const buildId = (0, _fs.readFileSync)(buildIdFile, 'utf8')

    const pagesManifest =
      !options.pages &&
      require((0, _path.join)(
        distDir,
        isLikeServerless
          ? _constants2.SERVERLESS_DIRECTORY
          : _constants2.SERVER_DIRECTORY,
        _constants2.PAGES_MANIFEST
      ))

    let prerenderManifest = undefined

    try {
      prerenderManifest = require((0, _path.join)(
        distDir,
        _constants2.PRERENDER_MANIFEST
      ))
    } catch (_) {}

    const excludedPrerenderRoutes = new Set()
    const pages = options.pages || Object.keys(pagesManifest)
    const defaultPathMap = {}
    let hasApiRoutes = false

    for (const page of pages) {
      var _prerenderManifest

      // _document and _app are not real pages
      // _error is exported as 404.html later on
      // API Routes are Node.js functions
      if (page.match(_constants.API_ROUTE)) {
        hasApiRoutes = true
        continue
      }

      if (page === '/_document' || page === '/_app' || page === '/_error') {
        continue
      } // iSSG pages that are dynamic should not export templated version by
      // default. In most cases, this would never work. There is no server that
      // could run `getStaticProps`. If users make their page work lazily, they
      // can manually add it to the `exportPathMap`.

      if (
        (_prerenderManifest = prerenderManifest) != null &&
        _prerenderManifest.dynamicRoutes[page]
      ) {
        excludedPrerenderRoutes.add(page)
        continue
      }

      defaultPathMap[page] = {
        page,
      }
    } // Initialize the output directory

    const outDir = options.outdir

    if (outDir === (0, _path.join)(dir, 'public')) {
      throw new Error(
        `The 'public' directory is reserved in Next.js and can not be used as the export out directory. https://nextjs.org/docs/messages/can-not-output-to-public`
      )
    }

    if (outDir === (0, _path.join)(dir, 'static')) {
      throw new Error(
        `The 'static' directory is reserved in Next.js and can not be used as the export out directory. https://nextjs.org/docs/messages/can-not-output-to-static`
      )
    }

    await (0, _recursiveDelete.recursiveDelete)((0, _path.join)(outDir))
    await _fs.promises.mkdir((0, _path.join)(outDir, '_next', buildId), {
      recursive: true,
    })
    ;(0, _fs.writeFileSync)(
      (0, _path.join)(distDir, _constants2.EXPORT_DETAIL),
      JSON.stringify({
        version: 1,
        outDirectory: outDir,
        success: false,
      }),
      'utf8'
    ) // Copy static directory

    if (
      !options.buildExport &&
      (0, _fs.existsSync)((0, _path.join)(dir, 'static'))
    ) {
      if (!options.silent) {
        Log.info('Copying "static" directory')
      }

      await nextExportSpan
        .traceChild('copy-static-directory')
        .traceAsyncFn(() =>
          (0, _recursiveCopy.recursiveCopy)(
            (0, _path.join)(dir, 'static'),
            (0, _path.join)(outDir, 'static')
          )
        )
    } // Copy .next/static directory

    if (
      !options.buildExport &&
      (0, _fs.existsSync)(
        (0, _path.join)(distDir, _constants2.CLIENT_STATIC_FILES_PATH)
      )
    ) {
      if (!options.silent) {
        Log.info('Copying "static build" directory')
      }

      await nextExportSpan
        .traceChild('copy-next-static-directory')
        .traceAsyncFn(() =>
          (0, _recursiveCopy.recursiveCopy)(
            (0, _path.join)(distDir, _constants2.CLIENT_STATIC_FILES_PATH),
            (0, _path.join)(
              outDir,
              '_next',
              _constants2.CLIENT_STATIC_FILES_PATH
            )
          )
        )
    } // Get the exportPathMap from the config file

    if (typeof nextConfig.exportPathMap !== 'function') {
      if (!options.silent) {
        Log.info(
          `No "exportPathMap" found in "${_constants2.CONFIG_FILE}". Generating map from "./pages"`
        )
      }

      nextConfig.exportPathMap = async (defaultMap) => {
        return defaultMap
      }
    }

    const {
      i18n,
      images: { loader = 'default' },
    } = nextConfig

    if (i18n && !options.buildExport) {
      throw new Error(
        `i18n support is not compatible with next export. See here for more info on deploying: https://nextjs.org/docs/deployment`
      )
    }

    if (!options.buildExport) {
      const { isNextImageImported } = await nextExportSpan
        .traceChild('is-next-image-imported')
        .traceAsyncFn(() =>
          _fs.promises
            .readFile(
              (0, _path.join)(distDir, _constants2.EXPORT_MARKER),
              'utf8'
            )
            .then((text) => JSON.parse(text))
            .catch(() => ({}))
        )

      if (
        isNextImageImported &&
        loader === 'default' &&
        !_ciInfo.hasNextSupport
      ) {
        throw new Error(`Image Optimization using Next.js' default loader is not compatible with \`next export\`.
  Possible solutions:
    - Use \`next start\` to run a server, which includes the Image Optimization API.
    - Use any provider which supports Image Optimization (like Vercel).
    - Configure a third-party loader in \`next.config.js\`.
    - Use the \`loader\` prop for \`next/image\`.
  Read more: https://nextjs.org/docs/messages/export-image-api`)
      }
    } // Start the rendering process

    const renderOpts = {
      dir,
      buildId,
      nextExport: true,
      assetPrefix: nextConfig.assetPrefix.replace(/\/$/, ''),
      distDir,
      dev: false,
      hotReloader: null,
      basePath: nextConfig.basePath,
      canonicalBase:
        ((_nextConfig$amp = nextConfig.amp) == null
          ? void 0
          : _nextConfig$amp.canonicalBase) || '',
      ampValidatorPath:
        ((_nextConfig$experimen = nextConfig.experimental.amp) == null
          ? void 0
          : _nextConfig$experimen.validator) || undefined,
      ampSkipValidation:
        ((_nextConfig$experimen2 = nextConfig.experimental.amp) == null
          ? void 0
          : _nextConfig$experimen2.skipValidation) || false,
      ampOptimizerConfig:
        ((_nextConfig$experimen3 = nextConfig.experimental.amp) == null
          ? void 0
          : _nextConfig$experimen3.optimizer) || undefined,
      locales: i18n == null ? void 0 : i18n.locales,
      locale: i18n == null ? void 0 : i18n.defaultLocale,
      defaultLocale: i18n == null ? void 0 : i18n.defaultLocale,
      domainLocales: i18n == null ? void 0 : i18n.domains,
      trailingSlash: nextConfig.trailingSlash,
      disableOptimizedLoading: nextConfig.experimental.disableOptimizedLoading,
    }
    const { serverRuntimeConfig, publicRuntimeConfig } = nextConfig

    if (Object.keys(publicRuntimeConfig).length > 0) {
      renderOpts.runtimeConfig = publicRuntimeConfig
    } // We need this for server rendering the Link component.

    global.__NEXT_DATA__ = {
      nextExport: true,
    }

    if (!options.silent && !options.buildExport) {
      Log.info(`Launching ${threads} workers`)
    }

    const exportPathMap = await nextExportSpan
      .traceChild('run-export-path-map')
      .traceAsyncFn(() =>
        nextConfig.exportPathMap(defaultPathMap, {
          dev: false,
          dir,
          outDir,
          distDir,
          buildId,
        })
      )

    if (
      !options.buildExport &&
      !exportPathMap['/404'] &&
      !exportPathMap['/404.html']
    ) {
      exportPathMap['/404'] = exportPathMap['/404.html'] = {
        page: '/_error',
      }
    } // make sure to prevent duplicates

    const exportPaths = [
      ...new Set(
        Object.keys(exportPathMap).map((path) =>
          (0, _normalizePagePath.denormalizePagePath)(
            (0, _normalizePagePath.normalizePagePath)(path)
          )
        )
      ),
    ]
    const filteredPaths = exportPaths.filter(
      // Remove API routes
      (route) => !exportPathMap[route].page.match(_constants.API_ROUTE)
    )

    if (filteredPaths.length !== exportPaths.length) {
      hasApiRoutes = true
    }

    if (filteredPaths.length === 0) {
      return
    }

    if (prerenderManifest && !options.buildExport) {
      const fallbackEnabledPages = new Set()

      for (const key of Object.keys(prerenderManifest.dynamicRoutes)) {
        // only error if page is included in path map
        if (!exportPathMap[key] && !excludedPrerenderRoutes.has(key)) {
          continue
        }

        if (prerenderManifest.dynamicRoutes[key].fallback !== false) {
          fallbackEnabledPages.add(key)
        }
      }

      if (fallbackEnabledPages.size) {
        throw new Error(
          `Found pages with \`fallback\` enabled:\n${[
            ...fallbackEnabledPages,
          ].join('\n')}\n${_constants.SSG_FALLBACK_EXPORT_ERROR}\n`
        )
      }
    } // Warn if the user defines a path for an API page

    if (hasApiRoutes) {
      if (!options.silent) {
        Log.warn(
          _chalk.default.yellow(
            `Statically exporting a Next.js application via \`next export\` disables API routes.`
          ) +
            `\n` +
            _chalk.default.yellow(
              `This command is meant for static-only hosts, and is` +
                ' ' +
                _chalk.default.bold(
                  `not necessary to make your application static.`
                )
            ) +
            `\n` +
            _chalk.default.yellow(
              `Pages in your application without server-side data dependencies will be automatically statically exported by \`next build\`, including pages powered by \`getStaticProps\`.`
            ) +
            `\n` +
            _chalk.default.yellow(
              `Learn more: https://nextjs.org/docs/messages/api-routes-static-export`
            )
        )
      }
    }

    const progress =
      !options.silent &&
      createProgress(
        filteredPaths.length,
        `${Log.prefixes.info} ${options.statusMessage || 'Exporting'}`
      )
    const pagesDataDir = options.buildExport
      ? outDir
      : (0, _path.join)(outDir, '_next/data', buildId)
    const ampValidations = {}
    let hadValidationError = false
    const publicDir = (0, _path.join)(dir, _constants2.CLIENT_PUBLIC_FILES_PATH) // Copy public directory

    if (!options.buildExport && (0, _fs.existsSync)(publicDir)) {
      if (!options.silent) {
        Log.info('Copying "public" directory')
      }

      await nextExportSpan
        .traceChild('copy-public-directory')
        .traceAsyncFn(() =>
          (0, _recursiveCopy.recursiveCopy)(publicDir, outDir, {
            filter(path) {
              // Exclude paths used by pages
              return !exportPathMap[path]
            },
          })
        )
    }

    const worker = new _jestWorker.Worker(require.resolve('./worker'), {
      maxRetries: 0,
      numWorkers: threads,
      enableWorkerThreads: nextConfig.experimental.workerThreads,
      exposedMethods: ['default'],
    })
    worker.getStdout().pipe(process.stdout)
    worker.getStderr().pipe(process.stderr)
    let renderError = false
    const errorPaths = []
    await Promise.all(
      filteredPaths.map(async (path) => {
        const pageExportSpan = nextExportSpan.traceChild('export-page')
        pageExportSpan.setAttribute('path', path)
        return pageExportSpan.traceAsyncFn(async () => {
          const result = await worker.default({
            path,
            pathMap: exportPathMap[path],
            distDir,
            outDir,
            pagesDataDir,
            renderOpts,
            serverRuntimeConfig,
            subFolders,
            buildExport: options.buildExport,
            serverless: (0, _config.isTargetLikeServerless)(nextConfig.target),
            optimizeFonts: nextConfig.optimizeFonts,
            optimizeImages: nextConfig.experimental.optimizeImages,
            optimizeCss: nextConfig.experimental.optimizeCss,
            disableOptimizedLoading:
              nextConfig.experimental.disableOptimizedLoading,
            parentSpanId: pageExportSpan.id,
          })

          for (const validation of result.ampValidations || []) {
            const { page, result: ampValidationResult } = validation
            ampValidations[page] = ampValidationResult
            hadValidationError =
              hadValidationError ||
              (Array.isArray(
                ampValidationResult == null
                  ? void 0
                  : ampValidationResult.errors
              ) &&
                ampValidationResult.errors.length > 0)
          }

          renderError = renderError || !!result.error
          if (!!result.error) errorPaths.push(path)

          if (options.buildExport && configuration) {
            if (typeof result.fromBuildExportRevalidate !== 'undefined') {
              configuration.initialPageRevalidationMap[path] =
                result.fromBuildExportRevalidate
            }

            if (result.ssgNotFound === true) {
              configuration.ssgNotFoundPaths.push(path)
            }
          }

          if (progress) progress()
        })
      })
    )
    worker.end() // copy prerendered routes to outDir

    if (!options.buildExport && prerenderManifest) {
      await Promise.all(
        Object.keys(prerenderManifest.routes).map(async (route) => {
          const { srcRoute } = prerenderManifest.routes[route]
          const pageName = srcRoute || route
          const pagePath = (0, _require.getPagePath)(
            pageName,
            distDir,
            isLikeServerless
          )
          const distPagesDir = (0, _path.join)(
            pagePath, // strip leading / and then recurse number of nested dirs
            // to place from base folder
            pageName
              .substr(1)
              .split('/')
              .map(() => '..')
              .join('/')
          )
          route = (0, _normalizePagePath.normalizePagePath)(route)
          const orig = (0, _path.join)(distPagesDir, route)
          const htmlDest = (0, _path.join)(
            outDir,
            `${route}${
              subFolders && route !== '/index' ? `${_path.sep}index` : ''
            }.html`
          )
          const ampHtmlDest = (0, _path.join)(
            outDir,
            `${route}.amp${subFolders ? `${_path.sep}index` : ''}.html`
          )
          const jsonDest = (0, _path.join)(pagesDataDir, `${route}.json`)
          await _fs.promises.mkdir((0, _path.dirname)(htmlDest), {
            recursive: true,
          })
          await _fs.promises.mkdir((0, _path.dirname)(jsonDest), {
            recursive: true,
          })
          await _fs.promises.copyFile(`${orig}.html`, htmlDest)
          await _fs.promises.copyFile(`${orig}.json`, jsonDest)

          if (await exists(`${orig}.amp.html`)) {
            await _fs.promises.mkdir((0, _path.dirname)(ampHtmlDest), {
              recursive: true,
            })
            await _fs.promises.copyFile(`${orig}.amp.html`, ampHtmlDest)
          }
        })
      )
    }

    if (Object.keys(ampValidations).length) {
      console.log((0, _index.formatAmpMessages)(ampValidations))
    }

    if (hadValidationError) {
      throw new Error(
        `AMP Validation caused the export to fail. https://nextjs.org/docs/messages/amp-export-validation`
      )
    }

    if (renderError) {
      throw new Error(
        `Export encountered errors on following paths:\n\t${errorPaths
          .sort()
          .join('\n\t')}`
      )
    }

    ;(0, _fs.writeFileSync)(
      (0, _path.join)(distDir, _constants2.EXPORT_DETAIL),
      JSON.stringify({
        version: 1,
        outDirectory: outDir,
        success: true,
      }),
      'utf8'
    )

    if (telemetry) {
      await telemetry.flush()
    }
  })
}
//# sourceMappingURL=index.js.map
