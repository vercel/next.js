import chalk from 'chalk'
import {
  SERVER_DIRECTORY,
  SERVERLESS_DIRECTORY,
  PAGES_MANIFEST,
  CHUNK_GRAPH_MANIFEST,
  PHASE_PRODUCTION_BUILD,
} from 'next-server/constants'
import loadConfig from 'next-server/next-config'
import nanoid from 'next/dist/compiled/nanoid/index.js'
import path from 'path'
import fs from 'fs'
import { promisify } from 'util'
import formatWebpackMessages from '../client/dev-error-overlay/format-webpack-messages'
import { recursiveDelete } from '../lib/recursive-delete'
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
  printTreeView,
  PageInfo,
  isPageStatic,
  hasCustomAppGetInitialProps,
} from './utils'
import getBaseWebpackConfig from './webpack-config'
import {
  exportManifest,
  getPageChunks,
} from './webpack/plugins/chunk-graph-plugin'
import { writeBuildId } from './write-build-id'
import { recursiveReadDir } from '../lib/recursive-readdir'
import mkdirpOrig from 'mkdirp'

const fsUnlink = promisify(fs.unlink)
const fsRmdir = promisify(fs.rmdir)
const fsMove = promisify(fs.rename)
const fsReadFile = promisify(fs.readFile)
const fsWriteFile = promisify(fs.writeFile)
const mkdirp = promisify(mkdirpOrig)

export default async function build(dir: string, conf = null): Promise<void> {
  if (!(await isWriteable(dir))) {
    throw new Error(
      '> Build directory is not writeable. https://err.sh/zeit/next.js/build-dir-not-writeable'
    )
  }

  await verifyTypeScriptSetup(dir)

  const debug =
    process.env.__NEXT_BUILDER_EXPERIMENTAL_DEBUG === 'true' ||
    process.env.__NEXT_BUILDER_EXPERIMENTAL_DEBUG === '1'

  console.log(
    debug
      ? 'Creating a development build ...'
      : 'Creating an optimized production build ...'
  )
  console.log()

  const config = loadConfig(PHASE_PRODUCTION_BUILD, dir, conf)
  const target = process.env.__NEXT_BUILDER_EXPERIMENTAL_TARGET || config.target
  const buildId = debug
    ? 'unoptimized-build'
    : await generateBuildId(config.generateBuildId, nanoid)
  const distDir = path.join(dir, config.distDir)
  const pagesDir = path.join(dir, 'pages')

  const isFlyingShuttle = Boolean(
    config.experimental.flyingShuttle &&
      !process.env.__NEXT_BUILDER_EXPERIMENTAL_PAGE
  )
  const selectivePageBuilding = Boolean(
    isFlyingShuttle || process.env.__NEXT_BUILDER_EXPERIMENTAL_PAGE
  )

  if (selectivePageBuilding && target !== 'serverless') {
    throw new Error(
      `Cannot use ${
        isFlyingShuttle ? 'flying shuttle' : '`now dev`'
      } without the serverless target.`
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
      debug,
      buildId,
      isServer: false,
      config,
      target,
      entrypoints: entrypoints.client,
      selectivePageBuilding,
    }),
    getBaseWebpackConfig(dir, {
      debug,
      buildId,
      isServer: true,
      config,
      target,
      entrypoints: entrypoints.server,
      selectivePageBuilding,
    }),
  ])

  let result: CompilerResult = { warnings: [], errors: [] }
  if (target === 'serverless') {
    if (config.publicRuntimeConfig)
      throw new Error(
        'Cannot use publicRuntimeConfig with target=serverless https://err.sh/zeit/next.js/serverless-publicRuntimeConfig'
      )

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
    target === 'serverless' ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY,
    PAGES_MANIFEST
  )

  const { autoExport } = config.experimental
  const staticPages = new Set<string>()
  const pageInfos = new Map<string, PageInfo>()
  let pagesManifest: any = {}
  let customAppGetInitialProps: boolean | undefined

  if (autoExport) {
    pagesManifest = JSON.parse(await fsReadFile(manifestPath, 'utf8'))
  }

  process.env.NEXT_PHASE = PHASE_PRODUCTION_BUILD

  for (const page of pageKeys) {
    const chunks = getPageChunks(page)

    const actualPage = page === '/' ? '/index' : page
    const size = await getPageSizeInKb(actualPage, distPath, buildId)
    const bundleRelative = path.join(
      target === 'serverless' ? 'pages' : `static/${buildId}/pages`,
      actualPage + '.js'
    )
    const serverBundle = path.join(
      distPath,
      target === 'serverless' ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY,
      bundleRelative
    )

    if (autoExport) {
      pagesManifest[page] = bundleRelative.replace(/\\/g, '/')

      const runtimeEnvConfig = {
        publicRuntimeConfig: config.publicRuntimeConfig,
        serverRuntimeConfig: config.serverRuntimeConfig,
      }
      const nonReservedPage = !page.match(/^\/(_app|_error|_document|api)/)

      if (nonReservedPage && customAppGetInitialProps === undefined) {
        customAppGetInitialProps = hasCustomAppGetInitialProps(
          target === 'serverless'
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
            'Opting out of automatic exporting due to custom `getInitialProps` in `pages/_app`\n'
          )
        }
      }

      if (customAppGetInitialProps === false && nonReservedPage) {
        const isStatic =
          !/[\\\/]\$/.test(path.relative(distPath, serverBundle)) &&
          isPageStatic(serverBundle, runtimeEnvConfig)
        if (isStatic) staticPages.add(page)
      }
    }

    pageInfos.set(page, { size, chunks, serverBundle })
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

  if (autoExport && staticPages.size > 0) {
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
      experimental: {
        ...config.experimental,
        exportTrailingSlash: false,
      },
    }
    await exportApp(dir, exportOptions, exportConfig)
    const toMove = await recursiveReadDir(exportOptions.outdir, /.*\.html$/)

    let serverDir: string = ''
    // remove server bundles that were exported
    for (const page of staticPages) {
      const { serverBundle } = pageInfos.get(page)!
      if (!serverDir) serverDir = path.dirname(serverBundle)
      await fsUnlink(serverBundle)
    }

    for (const file of toMove) {
      const orig = path.join(exportOptions.outdir, file)
      const dest = path.join(serverDir, file)
      const relativeDest = (target === 'serverless'
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
    if (autoExport) await flyingShuttle.mergePagesManifest()
    await flyingShuttle.save(allStaticPages, pageInfos)
  }

  printTreeView(Object.keys(allMappedPages), allPageInfos)
}
