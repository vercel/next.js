import { cpus } from 'os'
import chalk from 'chalk'
import Worker from 'jest-worker'
import { promisify } from 'util'
import mkdirpModule from 'mkdirp'
import { resolve, join, dirname } from 'path'
import { API_ROUTE } from '../lib/constants'
import { existsSync, readFileSync, copyFile as copyFileOrig } from 'fs'
import { recursiveCopy } from '../lib/recursive-copy'
import { recursiveDelete } from '../lib/recursive-delete'
import { formatAmpMessages } from '../build/output/index'
import loadConfig, {
  isTargetLikeServerless
} from '../next-server/server/config'
import {
  PHASE_EXPORT,
  SERVER_DIRECTORY,
  PAGES_MANIFEST,
  CONFIG_FILE,
  BUILD_ID_FILE,
  PRERENDER_MANIFEST,
  SERVERLESS_DIRECTORY,
  CLIENT_PUBLIC_FILES_PATH,
  CLIENT_STATIC_FILES_PATH
} from '../next-server/lib/constants'
import createSpinner from '../build/spinner'

const mkdirp = promisify(mkdirpModule)
const copyFile = promisify(copyFileOrig)

const createProgress = (total, label = 'Exporting') => {
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
        '[=   ]'
      ],
      interval: 80
    }
  })

  return () => {
    curProgress++

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

export default async function (dir, options, configuration) {
  function log (message) {
    if (options.silent) return
    console.log(message)
  }

  dir = resolve(dir)
  const nextConfig = configuration || loadConfig(PHASE_EXPORT, dir)
  const threads = options.threads || Math.max(cpus().length - 1, 1)
  const distDir = join(dir, nextConfig.distDir)
  const subFolders = nextConfig.exportTrailingSlash
  const isLikeServerless = nextConfig.target !== 'server'

  if (!options.buildExport && isLikeServerless) {
    throw new Error(
      'Cannot export when target is not server. https://err.sh/zeit/next.js/next-export-serverless'
    )
  }

  log(`> using build directory: ${distDir}`)

  if (!existsSync(distDir)) {
    throw new Error(
      `Build directory ${distDir} does not exist. Make sure you run "next build" before running "next start" or "next export".`
    )
  }

  const buildId = readFileSync(join(distDir, BUILD_ID_FILE), 'utf8')
  const pagesManifest =
    !options.pages && require(join(distDir, SERVER_DIRECTORY, PAGES_MANIFEST))

  let prerenderManifest
  try {
    prerenderManifest = require(join(distDir, PRERENDER_MANIFEST))
  } catch (_) {}

  const distPagesDir = join(
    distDir,
    isLikeServerless
      ? SERVERLESS_DIRECTORY
      : join(SERVER_DIRECTORY, 'static', buildId),
    'pages'
  )

  const pages = options.pages || Object.keys(pagesManifest)
  const defaultPathMap = {}

  for (const page of pages) {
    // _document and _app are not real pages
    // _error is exported as 404.html later on
    // API Routes are Node.js functions
    if (
      page === '/_document' ||
      page === '/_app' ||
      page === '/_error' ||
      page.match(API_ROUTE)
    ) {
      continue
    }

    defaultPathMap[page] = { page }
  }

  // Initialize the output directory
  const outDir = options.outdir
  await recursiveDelete(join(outDir))
  await mkdirp(join(outDir, '_next', buildId))

  // Copy static directory
  if (existsSync(join(dir, 'static'))) {
    log('  copying "static" directory')
    await recursiveCopy(join(dir, 'static'), join(outDir, 'static'))
  }

  // Copy .next/static directory
  if (existsSync(join(distDir, CLIENT_STATIC_FILES_PATH))) {
    log('  copying "static build" directory')
    await recursiveCopy(
      join(distDir, CLIENT_STATIC_FILES_PATH),
      join(outDir, '_next', CLIENT_STATIC_FILES_PATH)
    )
  }

  // Get the exportPathMap from the config file
  if (typeof nextConfig.exportPathMap !== 'function') {
    console.log(
      `> No "exportPathMap" found in "${CONFIG_FILE}". Generating map from "./pages"`
    )
    nextConfig.exportPathMap = async defaultMap => {
      return defaultMap
    }
  }

  // Start the rendering process
  const renderOpts = {
    dir,
    buildId,
    nextExport: true,
    assetPrefix: nextConfig.assetPrefix.replace(/\/$/, ''),
    distDir,
    dev: false,
    staticMarkup: false,
    hotReloader: null,
    canonicalBase: (nextConfig.amp && nextConfig.amp.canonicalBase) || '',
    isModern: nextConfig.experimental.modern
  }

  const { serverRuntimeConfig, publicRuntimeConfig } = nextConfig

  if (Object.keys(publicRuntimeConfig).length > 0) {
    renderOpts.runtimeConfig = publicRuntimeConfig
  }

  // We need this for server rendering the Link component.
  global.__NEXT_DATA__ = {
    nextExport: true
  }

  log(`  launching ${threads} workers`)
  const exportPathMap = await nextConfig.exportPathMap(defaultPathMap, {
    dev: false,
    dir,
    outDir,
    distDir,
    buildId
  })
  if (!exportPathMap['/404']) {
    exportPathMap['/404.html'] = exportPathMap['/404.html'] || {
      page: '/_error'
    }
  }
  const exportPaths = Object.keys(exportPathMap)
  const filteredPaths = exportPaths.filter(
    // Remove API routes
    route => !exportPathMap[route].page.match(API_ROUTE)
  )
  const hasApiRoutes = exportPaths.length !== filteredPaths.length

  // Warn if the user defines a path for an API page
  if (hasApiRoutes) {
    log(
      chalk.yellow(
        '  API pages are not supported by next export. https://err.sh/zeit/next.js/api-routes-static-export'
      )
    )
  }

  const progress = !options.silent && createProgress(filteredPaths.length)
  const sprDataDir = options.buildExport ? outDir : join(outDir, '_next/data')

  const ampValidations = {}
  let hadValidationError = false

  const publicDir = join(dir, CLIENT_PUBLIC_FILES_PATH)
  // Copy public directory
  if (
    nextConfig.experimental &&
    nextConfig.experimental.publicDirectory &&
    existsSync(publicDir)
  ) {
    log('  copying "public" directory')
    await recursiveCopy(publicDir, outDir, {
      filter (path) {
        // Exclude paths used by pages
        return !exportPathMap[path]
      }
    })
  }

  const worker = new Worker(require.resolve('./worker'), {
    maxRetries: 0,
    numWorkers: threads,
    enableWorkerThreads: true,
    exposedMethods: ['default']
  })

  worker.getStdout().pipe(process.stdout)
  worker.getStderr().pipe(process.stderr)

  let renderError = false

  await Promise.all(
    filteredPaths.map(async path => {
      const result = await worker.default({
        path,
        pathMap: exportPathMap[path],
        distDir,
        buildId,
        outDir,
        sprDataDir,
        renderOpts,
        serverRuntimeConfig,
        subFolders,
        buildExport: options.buildExport,
        serverless: isTargetLikeServerless(nextConfig.target)
      })

      for (const validation of result.ampValidations || []) {
        const { page, result } = validation
        ampValidations[page] = result
        hadValidationError |=
          Array.isArray(result && result.errors) && result.errors.length > 0
      }
      renderError |= result.error

      if (
        options.buildExport &&
        typeof result.fromBuildExportRevalidate !== 'undefined'
      ) {
        configuration.initialPageRevalidationMap[path] =
          result.fromBuildExportRevalidate
      }
      if (progress) progress()
    })
  )

  worker.end()

  // copy prerendered routes to outDir
  if (!options.buildExport && prerenderManifest) {
    await Promise.all(
      Object.keys(prerenderManifest.routes).map(async route => {
        const orig = join(distPagesDir, route)
        const htmlDest = join(outDir, `${route}.html`)
        const jsonDest = join(sprDataDir, `${route}.json`)

        await mkdirp(dirname(htmlDest))
        await mkdirp(dirname(jsonDest))
        await copyFile(`${orig}.html`, htmlDest)
        await copyFile(`${orig}.json`, jsonDest)
      })
    )
  }

  if (Object.keys(ampValidations).length) {
    console.log(formatAmpMessages(ampValidations))
  }
  if (hadValidationError) {
    throw new Error(
      `AMP Validation caused the export to fail. https://err.sh/zeit/next.js/amp-export-validation`
    )
  }

  if (renderError) {
    throw new Error(`Export encountered errors`)
  }
  // Add an empty line to the console for the better readability.
  log('')
}
