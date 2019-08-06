import { Sema } from 'async-sema'
import chalk from 'chalk'
import fs from 'fs'
import mkdirpOrig from 'mkdirp'
import {
  CHUNK_GRAPH_MANIFEST,
  PAGES_MANIFEST,
  PHASE_PRODUCTION_BUILD,
  SERVER_DIRECTORY,
  SERVERLESS_DIRECTORY,
} from 'next-server/constants'
import loadConfig, {
  isTargetLikeServerless,
} from 'next-server/dist/server/config'
import nanoid from 'next/dist/compiled/nanoid/index.js'
import path from 'path'
import { promisify } from 'util'
import workerFarm from 'worker-farm'

import formatWebpackMessages from '../client/dev/error-overlay/format-webpack-messages'
import { recursiveDelete } from '../lib/recursive-delete'
import { recursiveReadDir } from '../lib/recursive-readdir'
import { verifyTypeScriptSetup } from '../lib/verifyTypeScriptSetup'
import { CompilerResult, runCompiler } from './compiler'
import { createEntrypoints, createPagesMapping } from './entries'
import { FlyingShuttle } from './flying-shuttle'
import { generateBuildId } from './generate-build-id'
import { isWriteable } from './is-writeable'
import {
  collectPages,
  getCacheIdentifier,
  getFileForPage,
  getPageSizeInKb,
  getSpecifiedPages,
  hasCustomAppGetInitialProps,
  PageInfo,
  printTreeView,
} from './utils'
import getBaseWebpackConfig from './webpack-config'
import {
  exportManifest,
  getPageChunks,
} from './webpack/plugins/chunk-graph-plugin'
import { writeBuildId } from './write-build-id'

const fsUnlink = promisify(fs.unlink)
const fsRmdir = promisify(fs.rmdir)
const fsMove = promisify(fs.rename)
const fsReadFile = promisify(fs.readFile)
const fsWriteFile = promisify(fs.writeFile)
const mkdirp = promisify(mkdirpOrig)

const staticCheckWorker = require.resolve('./static-checker')

export default async function build(dir: string, conf = null): Promise<void> {
  if (!(await isWriteable(dir))) {
    throw new Error(
      '> Build directory is not writeable. https://err.sh/zeit/next.js/build-dir-not-writeable'
    )
  }

  await verifyTypeScriptSetup(dir)

  console.log('Creating an optimized production build ...')
  console.log()

  const config = loadConfig(PHASE_PRODUCTION_BUILD, dir, conf)
  const { target } = config
  const buildId = await generateBuildId(config.generateBuildId, nanoid)
  const distDir = path.join(dir, config.distDir)
  const pagesDir = path.join(dir, 'pages')

  const isFlyingShuttle = Boolean(
    config.experimental.flyingShuttle &&
      !process.env.__NEXT_BUILDER_EXPERIMENTAL_PAGE
  )
  const selectivePageBuilding = Boolean(
    isFlyingShuttle || process.env.__NEXT_BUILDER_EXPERIMENTAL_PAGE
  )

  const isLikeServerless = isTargetLikeServerless(target)

  if (selectivePageBuilding && target !== 'serverless') {
    throw new Error(
      `Cannot use ${
        isFlyingShuttle ? 'flying shuttle' : '`now dev`'
      } without the \`serverless\` target.`
    )
  }

  const selectivePageBuildingCacheIdentifier = selectivePageBuilding
    ? await getCacheIdentifier({
        pagesDirectory: pagesDir,
        env: config.env || {},
      })
    : 'noop'

  let flyingShuttle: FlyingShuttle | undefined
  if (isFlyingShuttle) {
    console.log(chalk.magenta('Building with Flying Shuttle enabled ...'))
    console.log()

    await recursiveDelete(distDir, /^(?!cache(?:[\/\\]|$)).*$/)
    await recursiveDelete(path.join(distDir, 'cache', 'next-minifier'))
    await recursiveDelete(path.join(distDir, 'cache', 'next-babel-loader'))

    flyingShuttle = new FlyingShuttle({
      buildId,
      pagesDirectory: pagesDir,
      distDirectory: distDir,
      cacheIdentifier: selectivePageBuildingCacheIdentifier,
    })
  }

  let pagePaths: string[]
  if (process.env.__NEXT_BUILDER_EXPERIMENTAL_PAGE) {
    pagePaths = await getSpecifiedPages(
      dir,
      process.env.__NEXT_BUILDER_EXPERIMENTAL_PAGE!,
      config.pageExtensions
    )
  } else {
    pagePaths = await collectPages(pagesDir, config.pageExtensions)
  }
  // needed for static exporting since we want to replace with HTML
  // files even when flying shuttle doesn't rebuild the files
  const allPagePaths = [...pagePaths]
  const allStaticPages = new Set<string>()
  let allPageInfos = new Map<string, PageInfo>()

  if (flyingShuttle && (await flyingShuttle.hasShuttle())) {
    allPageInfos = await flyingShuttle.getPageInfos()
    const _unchangedPages = new Set(await flyingShuttle.getUnchangedPages())
    for (const unchangedPage of _unchangedPages) {
      const info = allPageInfos.get(unchangedPage) || ({} as PageInfo)
      if (info.static) allStaticPages.add(unchangedPage)

      const recalled = await flyingShuttle.restorePage(unchangedPage, info)
      if (recalled) {
        continue
      }
      _unchangedPages.delete(unchangedPage)
    }

    const unchangedPages = (await Promise.all(
      [..._unchangedPages].map(async page => {
        if (
          page.endsWith('.amp') &&
          (allPageInfos.get(page.split('.amp')[0]) || ({} as PageInfo)).isAmp
        ) {
          return ''
        }
        const file = await getFileForPage({
          page,
          pagesDirectory: pagesDir,
          pageExtensions: config.pageExtensions,
        })
        if (file) {
          return file
        }

        return Promise.reject(
          new Error(
            `Failed to locate page file: ${page}. ` +
              `Did pageExtensions change? We can't recover from this yet.`
          )
        )
      })
    )).filter(Boolean)

    const pageSet = new Set(pagePaths)
    for (const unchangedPage of unchangedPages) {
      pageSet.delete(unchangedPage)
    }
    pagePaths = [...pageSet]
  }

  const allMappedPages = createPagesMapping(allPagePaths, config.pageExtensions)
  const mappedPages = createPagesMapping(pagePaths, config.pageExtensions)
  const entrypoints = createEntrypoints(
    mappedPages,
    target,
    buildId,
    /* dynamicBuildId */ selectivePageBuilding,
    config
  )
  const configs = await Promise.all([
    getBaseWebpackConfig(dir, {
      buildId,
      isServer: false,
      config,
      target,
      entrypoints: entrypoints.client,
      selectivePageBuilding,
    }),
    getBaseWebpackConfig(dir, {
      buildId,
      isServer: true,
      config,
      target,
      entrypoints: entrypoints.server,
      selectivePageBuilding,
    }),
  ])

  let result: CompilerResult = { warnings: [], errors: [] }
  // TODO: why do we need this?? https://github.com/zeit/next.js/issues/8253
  if (isLikeServerless) {
    const clientResult = await runCompiler(configs[0])
    // Fail build if clientResult contains errors
    if (clientResult.errors.length > 0) {
      result = {
        warnings: [...clientResult.warnings],
        errors: [...clientResult.errors],
      }
    } else {
      const serverResult = await runCompiler(configs[1])
      result = {
        warnings: [...clientResult.warnings, ...serverResult.warnings],
        errors: [...clientResult.errors, ...serverResult.errors],
      }
    }
  } else {
    result = await runCompiler(configs)
  }

  result = formatWebpackMessages(result)

  if (isFlyingShuttle) {
    console.log()

    exportManifest({
      dir: dir,
      fileName: path.join(distDir, CHUNK_GRAPH_MANIFEST),
      selectivePageBuildingCacheIdentifier,
    })
  }

  if (result.errors.length > 0) {
    // Only keep the first error. Others are often indicative
    // of the same problem, but confuse the reader with noise.
    if (result.errors.length > 1) {
      result.errors.length = 1
    }
    const error = result.errors.join('\n\n')

    console.error(chalk.red('Failed to compile.\n'))

    if (
      error.indexOf('private-next-pages') > -1 &&
      error.indexOf('does not contain a default export') > -1
    ) {
      const page_name_regex = /\'private-next-pages\/(?<page_name>[^\']*)\'/
      const parsed = page_name_regex.exec(error)
      const page_name = parsed && parsed.groups && parsed.groups.page_name
      throw new Error(
        `webpack build failed: found page without a React Component as default export in pages/${page_name}\n\nSee https://err.sh/zeit/next.js/page-without-valid-component for more info.`
      )
    }

    console.error(error)
    console.error()

    if (error.indexOf('private-next-pages') > -1) {
      throw new Error(
        '> webpack config.resolve.alias was incorrectly overriden. https://err.sh/zeit/next.js/invalid-resolve-alias'
      )
    }
    throw new Error('> Build failed because of webpack errors')
  } else if (result.warnings.length > 0) {
    console.warn(chalk.yellow('Compiled with warnings.\n'))
    console.warn(result.warnings.join('\n\n'))
    console.warn()
  } else {
    console.log(chalk.green('Compiled successfully.\n'))
  }

  const distPath = path.join(dir, config.distDir)
  const pageKeys = Object.keys(mappedPages)
  const manifestPath = path.join(
    distDir,
    isLikeServerless ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY,
    PAGES_MANIFEST
  )

  const staticPages = new Set<string>()
  const invalidPages = new Set<string>()
  const pageInfos = new Map<string, PageInfo>()
  const pagesManifest = JSON.parse(await fsReadFile(manifestPath, 'utf8'))
  let customAppGetInitialProps: boolean | undefined

  process.env.NEXT_PHASE = PHASE_PRODUCTION_BUILD

  const staticCheckSema = new Sema(config.experimental.cpus, {
    capacity: pageKeys.length,
  })
  const staticCheckWorkers = workerFarm(
    {
      maxConcurrentWorkers: config.experimental.cpus,
    },
    staticCheckWorker,
    ['default']
  )

  await Promise.all(
    pageKeys.map(async page => {
      const chunks = getPageChunks(page)

      const actualPage = page === '/' ? '/index' : page
      const size = await getPageSizeInKb(actualPage, distPath, buildId)
      const bundleRelative = path.join(
        isLikeServerless ? 'pages' : `static/${buildId}/pages`,
        actualPage + '.js'
      )
      const serverBundle = path.join(
        distPath,
        isLikeServerless ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY,
        bundleRelative
      )

      let isStatic = false

      pagesManifest[page] = bundleRelative.replace(/\\/g, '/')

      const runtimeEnvConfig = {
        publicRuntimeConfig: config.publicRuntimeConfig,
        serverRuntimeConfig: config.serverRuntimeConfig,
      }
      const nonReservedPage = !page.match(/^\/(_app|_error|_document|api)/)

      if (nonReservedPage && customAppGetInitialProps === undefined) {
        customAppGetInitialProps = hasCustomAppGetInitialProps(
          isLikeServerless
            ? serverBundle
            : path.join(
                distPath,
                SERVER_DIRECTORY,
                `/static/${buildId}/pages/_app.js`
              ),
          runtimeEnvConfig
        )

        if (customAppGetInitialProps) {
          console.warn(
            chalk.bold.yellow(`Warning: `) +
              chalk.yellow(
                `You have opted-out of Automatic Prerendering due to \`getInitialProps\` in \`pages/_app\`.`
              )
          )
          console.warn(
            'Read more: https://err.sh/next.js/opt-out-automatic-prerendering\n'
          )
        }
      }

      if (nonReservedPage) {
        try {
          await staticCheckSema.acquire()
          const result: any = await new Promise((resolve, reject) => {
            staticCheckWorkers.default(
              { serverBundle, runtimeEnvConfig },
              (error: Error | null, result: any) => {
                if (error) return reject(error)
                resolve(result || {})
              }
            )
          })
          staticCheckSema.release()

          if (result.static && customAppGetInitialProps === false) {
            staticPages.add(page)
            isStatic = true
          }
        } catch (err) {
          if (err.message !== 'INVALID_DEFAULT_EXPORT') throw err
          invalidPages.add(page)
          staticCheckSema.release()
        }
      }

      pageInfos.set(page, { size, chunks, serverBundle, static: isStatic })
    })
  )

  workerFarm.end(staticCheckWorkers)

  if (invalidPages.size > 0) {
    throw new Error(
      `automatic static optimization failed: found page${
        invalidPages.size === 1 ? '' : 's'
      } without a React Component as default export in \n${[...invalidPages]
        .map(pg => `pages${pg}`)
        .join(
          '\n'
        )}\n\nSee https://err.sh/zeit/next.js/page-without-valid-component for more info.\n`
    )
  }

  if (Array.isArray(configs[0].plugins)) {
    configs[0].plugins.some((plugin: any) => {
      if (!plugin.ampPages) {
        return false
      }

      plugin.ampPages.forEach((pg: any) => {
        pageInfos.get(pg)!.isAmp = true
      })
      return true
    })
  }

  await writeBuildId(distDir, buildId, selectivePageBuilding)

  if (staticPages.size > 0) {
    const exportApp = require('../export').default
    const exportOptions = {
      silent: true,
      buildExport: true,
      pages: Array.from(staticPages),
      outdir: path.join(distDir, 'export'),
    }
    const exportConfig = {
      ...config,
      exportPathMap: (defaultMap: any) => defaultMap,
      exportTrailingSlash: false,
    }
    await exportApp(dir, exportOptions, exportConfig)
    const toMove = await recursiveReadDir(exportOptions.outdir, /.*\.html$/)

    let serverDir: string = ''
    // remove server bundles that were exported
    for (const page of staticPages) {
      const { serverBundle } = pageInfos.get(page)!
      if (!serverDir) {
        serverDir = path.join(
          serverBundle.split(/(\/|\\)pages/).shift()!,
          'pages'
        )
      }
      await fsUnlink(serverBundle)
    }

    for (const file of toMove) {
      const orig = path.join(exportOptions.outdir, file)
      const dest = path.join(serverDir, file)
      const relativeDest = (isLikeServerless
        ? path.join('pages', file)
        : path.join('static', buildId, 'pages', file)
      ).replace(/\\/g, '/')

      let page = file.split('.html')[0].replace(/\\/g, '/')
      pagesManifest[page] = relativeDest
      page = page === '/index' ? '/' : page
      pagesManifest[page] = relativeDest
      staticPages.add(page)
      await mkdirp(path.dirname(dest))
      await fsMove(orig, dest)
    }
    // remove temporary export folder
    await recursiveDelete(exportOptions.outdir)
    await fsRmdir(exportOptions.outdir)
    await fsWriteFile(manifestPath, JSON.stringify(pagesManifest), 'utf8')
  }
  staticPages.forEach(pg => allStaticPages.add(pg))
  pageInfos.forEach((info: PageInfo, key: string) => {
    allPageInfos.set(key, info)
  })

  if (flyingShuttle) {
    await flyingShuttle.mergePagesManifest()
    await flyingShuttle.save(allStaticPages, pageInfos)
  }

  printTreeView(Object.keys(allMappedPages), allPageInfos, isLikeServerless)
}
