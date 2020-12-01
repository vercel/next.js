import chalk from 'chalk'
import findUp from 'next/dist/compiled/find-up'
import {
  promises,
  existsSync,
  exists as existsOrig,
  readFileSync,
  writeFileSync,
} from 'fs'
import Worker from 'jest-worker'
import { cpus } from 'os'
import { dirname, join, resolve, sep } from 'path'
import { promisify } from 'util'
import { AmpPageStatus, formatAmpMessages } from '../build/output/index'
import * as Log from '../build/output/log'
import createSpinner from '../build/spinner'
import { API_ROUTE, SSG_FALLBACK_EXPORT_ERROR } from '../lib/constants'
import { recursiveCopy } from '../lib/recursive-copy'
import { recursiveDelete } from '../lib/recursive-delete'
import {
  BUILD_ID_FILE,
  CLIENT_PUBLIC_FILES_PATH,
  CLIENT_STATIC_FILES_PATH,
  CONFIG_FILE,
  EXPORT_DETAIL,
  EXPORT_MARKER,
  PAGES_MANIFEST,
  PHASE_EXPORT,
  PRERENDER_MANIFEST,
  SERVERLESS_DIRECTORY,
  SERVER_DIRECTORY,
} from '../next-server/lib/constants'
import loadConfig, {
  isTargetLikeServerless,
} from '../next-server/server/config'
import { eventCliSession } from '../telemetry/events'
import { hasNextSupport } from '../telemetry/ci-info'
import { Telemetry } from '../telemetry/storage'
import {
  normalizePagePath,
  denormalizePagePath,
} from '../next-server/server/normalize-page-path'
import { loadEnvConfig } from '@next/env'
import { PrerenderManifest } from '../build'
import type exportPage from './worker'
import { PagesManifest } from '../build/webpack/plugins/pages-manifest-plugin'
import { getPagePath } from '../next-server/server/require'

const exists = promisify(existsOrig)

function divideSegments(number: number, segments: number): number[] {
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

const createProgress = (total: number, label: string) => {
  const segments = divideSegments(total, 4)

  let currentSegmentTotal = segments.shift()
  let currentSegmentCount = 0
  let curProgress = 0
  let progressSpinner = createSpinner(`${label} (${curProgress}/${total})`, {
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
  })

  return () => {
    curProgress++
    currentSegmentCount++

    // Make sure we only log once per fully generated segment
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

type ExportPathMap = {
  [page: string]: { page: string; query?: { [key: string]: string } }
}

interface ExportOptions {
  outdir: string
  silent?: boolean
  threads?: number
  pages?: string[]
  buildExport?: boolean
  statusMessage?: string
}

export default async function exportApp(
  dir: string,
  options: ExportOptions,
  configuration?: any
): Promise<void> {
  dir = resolve(dir)

  // attempt to load global env values so they are available in next.config.js
  loadEnvConfig(dir, false, Log)

  const nextConfig = configuration || loadConfig(PHASE_EXPORT, dir)
  const threads = options.threads || Math.max(cpus().length - 1, 1)
  const distDir = join(dir, nextConfig.distDir)

  const telemetry = options.buildExport ? null : new Telemetry({ distDir })

  if (telemetry) {
    telemetry.record(
      eventCliSession(PHASE_EXPORT, distDir, {
        cliCommand: 'export',
        isSrcDir: null,
        hasNowJson: !!(await findUp('now.json', { cwd: dir })),
        isCustomServer: null,
      })
    )
  }

  const subFolders = nextConfig.trailingSlash
  const isLikeServerless = nextConfig.target !== 'server'

  if (!options.silent && !options.buildExport) {
    Log.info(`using build directory: ${distDir}`)
  }

  if (!existsSync(distDir)) {
    throw new Error(
      `Build directory ${distDir} does not exist. Make sure you run "next build" before running "next start" or "next export".`
    )
  }

  const customRoutesDetected = ['rewrites', 'redirects', 'headers'].filter(
    (config) => typeof nextConfig[config] === 'function'
  )

  if (
    !hasNextSupport &&
    !options.buildExport &&
    customRoutesDetected.length > 0
  ) {
    Log.warn(
      `rewrites, redirects, and headers are not applied when exporting your application, detected (${customRoutesDetected.join(
        ', '
      )}). See more info here: https://err.sh/next.js/export-no-custom-routes`
    )
  }

  const buildId = readFileSync(join(distDir, BUILD_ID_FILE), 'utf8')
  const pagesManifest =
    !options.pages &&
    (require(join(
      distDir,
      isLikeServerless ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY,
      PAGES_MANIFEST
    )) as PagesManifest)

  let prerenderManifest: PrerenderManifest | undefined = undefined
  try {
    prerenderManifest = require(join(distDir, PRERENDER_MANIFEST))
  } catch (_) {}

  const excludedPrerenderRoutes = new Set<string>()
  const pages = options.pages || Object.keys(pagesManifest)
  const defaultPathMap: ExportPathMap = {}
  let hasApiRoutes = false

  for (const page of pages) {
    // _document and _app are not real pages
    // _error is exported as 404.html later on
    // API Routes are Node.js functions

    if (page.match(API_ROUTE)) {
      hasApiRoutes = true
      continue
    }

    if (page === '/_document' || page === '/_app' || page === '/_error') {
      continue
    }

    // iSSG pages that are dynamic should not export templated version by
    // default. In most cases, this would never work. There is no server that
    // could run `getStaticProps`. If users make their page work lazily, they
    // can manually add it to the `exportPathMap`.
    if (prerenderManifest?.dynamicRoutes[page]) {
      excludedPrerenderRoutes.add(page)
      continue
    }

    defaultPathMap[page] = { page }
  }

  // Initialize the output directory
  const outDir = options.outdir

  if (outDir === join(dir, 'public')) {
    throw new Error(
      `The 'public' directory is reserved in Next.js and can not be used as the export out directory. https://err.sh/vercel/next.js/can-not-output-to-public`
    )
  }

  await recursiveDelete(join(outDir))
  await promises.mkdir(join(outDir, '_next', buildId), { recursive: true })

  writeFileSync(
    join(distDir, EXPORT_DETAIL),
    JSON.stringify({
      version: 1,
      outDirectory: outDir,
      success: false,
    }),
    'utf8'
  )

  // Copy static directory
  if (!options.buildExport && existsSync(join(dir, 'static'))) {
    if (!options.silent) {
      Log.info('Copying "static" directory')
    }
    await recursiveCopy(join(dir, 'static'), join(outDir, 'static'))
  }

  // Copy .next/static directory
  if (
    !options.buildExport &&
    existsSync(join(distDir, CLIENT_STATIC_FILES_PATH))
  ) {
    if (!options.silent) {
      Log.info('Copying "static build" directory')
    }
    await recursiveCopy(
      join(distDir, CLIENT_STATIC_FILES_PATH),
      join(outDir, '_next', CLIENT_STATIC_FILES_PATH)
    )
  }

  // Get the exportPathMap from the config file
  if (typeof nextConfig.exportPathMap !== 'function') {
    if (!options.silent) {
      Log.info(
        `No "exportPathMap" found in "${CONFIG_FILE}". Generating map from "./pages"`
      )
    }
    nextConfig.exportPathMap = async (defaultMap: ExportPathMap) => {
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

  const { isNextImageImported } = await promises
    .readFile(join(distDir, EXPORT_MARKER), 'utf8')
    .then((text) => JSON.parse(text))
    .catch(() => ({}))

  if (
    isNextImageImported &&
    loader === 'default' &&
    !options.buildExport &&
    !hasNextSupport
  ) {
    throw new Error(
      `Image Optimization using Next.js' default loader is not compatible with \`next export\`.
Possible solutions:
  - Use \`next start\`, which starts the Image Optimization API.
  - Use Vercel to deploy, which supports Image Optimization.
  - Configure a third-party loader in \`next.config.js\`.
Read more: https://err.sh/next.js/export-image-api`
    )
  }

  // Start the rendering process
  const renderOpts = {
    dir,
    buildId,
    nextExport: true,
    assetPrefix: nextConfig.assetPrefix.replace(/\/$/, ''),
    distDir,
    dev: false,
    hotReloader: null,
    basePath: nextConfig.basePath,
    canonicalBase: nextConfig.amp?.canonicalBase || '',
    ampValidatorPath: nextConfig.experimental.amp?.validator || undefined,
    ampSkipValidation: nextConfig.experimental.amp?.skipValidation || false,
    ampOptimizerConfig: nextConfig.experimental.amp?.optimizer || undefined,
    locales: i18n?.locales,
    locale: i18n.defaultLocale,
    defaultLocale: i18n.defaultLocale,
  }

  const { serverRuntimeConfig, publicRuntimeConfig } = nextConfig

  if (Object.keys(publicRuntimeConfig).length > 0) {
    ;(renderOpts as any).runtimeConfig = publicRuntimeConfig
  }

  // We need this for server rendering the Link component.
  ;(global as any).__NEXT_DATA__ = {
    nextExport: true,
  }

  if (!options.silent && !options.buildExport) {
    Log.info(`Launching ${threads} workers`)
  }
  const exportPathMap = await nextConfig.exportPathMap(defaultPathMap, {
    dev: false,
    dir,
    outDir,
    distDir,
    buildId,
  })

  if (!exportPathMap['/404'] && !exportPathMap['/404.html']) {
    exportPathMap['/404'] = exportPathMap['/404.html'] = {
      page: '/_error',
    }
  }

  // make sure to prevent duplicates
  const exportPaths = [
    ...new Set(
      Object.keys(exportPathMap).map((path) =>
        denormalizePagePath(normalizePagePath(path))
      )
    ),
  ]

  const filteredPaths = exportPaths.filter(
    // Remove API routes
    (route) => !exportPathMap[route].page.match(API_ROUTE)
  )

  if (filteredPaths.length !== exportPaths.length) {
    hasApiRoutes = true
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
        ].join('\n')}\n${SSG_FALLBACK_EXPORT_ERROR}\n`
      )
    }
  }

  // Warn if the user defines a path for an API page
  if (hasApiRoutes) {
    if (!options.silent) {
      Log.warn(
        chalk.yellow(
          `Statically exporting a Next.js application via \`next export\` disables API routes.`
        ) +
          `\n` +
          chalk.yellow(
            `This command is meant for static-only hosts, and is` +
              ' ' +
              chalk.bold(`not necessary to make your application static.`)
          ) +
          `\n` +
          chalk.yellow(
            `Pages in your application without server-side data dependencies will be automatically statically exported by \`next build\`, including pages powered by \`getStaticProps\`.`
          ) +
          `\n` +
          chalk.yellow(
            `Learn more: https://err.sh/vercel/next.js/api-routes-static-export`
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
    : join(outDir, '_next/data', buildId)

  const ampValidations: AmpPageStatus = {}
  let hadValidationError = false

  const publicDir = join(dir, CLIENT_PUBLIC_FILES_PATH)
  // Copy public directory
  if (!options.buildExport && existsSync(publicDir)) {
    if (!options.silent) {
      Log.info('Copying "public" directory')
    }
    await recursiveCopy(publicDir, outDir, {
      filter(path) {
        // Exclude paths used by pages
        return !exportPathMap[path]
      },
    })
  }

  const worker = new Worker(require.resolve('./worker'), {
    maxRetries: 0,
    numWorkers: threads,
    enableWorkerThreads: nextConfig.experimental.workerThreads,
    exposedMethods: ['default'],
  }) as Worker & { default: typeof exportPage }

  worker.getStdout().pipe(process.stdout)
  worker.getStderr().pipe(process.stderr)

  let renderError = false
  const errorPaths: string[] = []

  await Promise.all(
    filteredPaths.map(async (path) => {
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
        serverless: isTargetLikeServerless(nextConfig.target),
        optimizeFonts: nextConfig.experimental.optimizeFonts,
        optimizeImages: nextConfig.experimental.optimizeImages,
      })

      for (const validation of result.ampValidations || []) {
        const { page, result: ampValidationResult } = validation
        ampValidations[page] = ampValidationResult
        hadValidationError =
          hadValidationError ||
          (Array.isArray(ampValidationResult?.errors) &&
            ampValidationResult.errors.length > 0)
      }
      renderError = renderError || !!result.error
      if (!!result.error) errorPaths.push(path)

      if (options.buildExport) {
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
  )

  worker.end()

  // copy prerendered routes to outDir
  if (!options.buildExport && prerenderManifest) {
    await Promise.all(
      Object.keys(prerenderManifest.routes).map(async (route) => {
        const { srcRoute } = prerenderManifest!.routes[route]
        const pageName = srcRoute || route
        const pagePath = getPagePath(pageName, distDir, isLikeServerless)
        const distPagesDir = join(
          pagePath,
          // strip leading / and then recurse number of nested dirs
          // to place from base folder
          pageName
            .substr(1)
            .split('/')
            .map(() => '..')
            .join('/')
        )
        route = normalizePagePath(route)

        const orig = join(distPagesDir, route)
        const htmlDest = join(
          outDir,
          `${route}${
            subFolders && route !== '/index' ? `${sep}index` : ''
          }.html`
        )
        const ampHtmlDest = join(
          outDir,
          `${route}.amp${subFolders ? `${sep}index` : ''}.html`
        )
        const jsonDest = join(pagesDataDir, `${route}.json`)

        await promises.mkdir(dirname(htmlDest), { recursive: true })
        await promises.mkdir(dirname(jsonDest), { recursive: true })
        await promises.copyFile(`${orig}.html`, htmlDest)
        await promises.copyFile(`${orig}.json`, jsonDest)

        if (await exists(`${orig}.amp.html`)) {
          await promises.mkdir(dirname(ampHtmlDest), { recursive: true })
          await promises.copyFile(`${orig}.amp.html`, ampHtmlDest)
        }
      })
    )
  }

  if (Object.keys(ampValidations).length) {
    console.log(formatAmpMessages(ampValidations))
  }
  if (hadValidationError) {
    throw new Error(
      `AMP Validation caused the export to fail. https://err.sh/vercel/next.js/amp-export-validation`
    )
  }

  if (renderError) {
    throw new Error(
      `Export encountered errors on following paths:\n\t${errorPaths
        .sort()
        .join('\n\t')}`
    )
  }

  writeFileSync(
    join(distDir, EXPORT_DETAIL),
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
}
