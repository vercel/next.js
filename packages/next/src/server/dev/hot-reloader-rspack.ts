import path from 'path'
import fs from 'fs/promises'
import { createHash } from 'crypto'
import HotReloaderWebpack from './hot-reloader-webpack'
import { BUILT, getEntries } from './on-demand-entry-handler'
import type { NextConfigComplete } from '../config-shared'
import type { __ApiPreviewProps } from '../api-utils'
import type { CustomRoutes } from '../../lib/load-custom-routes'
import type { Telemetry } from '../../telemetry/storage'
import type { RouteDefinition } from '../route-definitions/route-definition'
import type { MultiCompiler } from 'webpack'

/**
 * Rspack Persistent Cache Strategy for Next.js Development
 *
 * Rspack's persistent caching differs from Webpack in how it manages module graphs.
 * While Webpack incrementally updates modules, Rspack operates on complete module
 * graph snapshots for cache restoration.
 *
 * Problem:
 * - Next.js dev server starts with no page modules in the initial entry points
 * - When Rspack restores from persistent cache, it finds no modules and purges
 *   the entire module graph
 * - Later page requests find no cached module information, preventing cache reuse
 *
 * Solution:
 * - Track successfully built page entries after each compilation
 * - Restore these entries on dev server restart to maintain module graph continuity
 * - This ensures previously compiled pages can leverage persistent cache for faster builds
 */
export default class HotReloaderRspack extends HotReloaderWebpack {
  private builtEntriesCachePath?: string

  constructor(
    dir: string,
    {
      config,
      isSrcDir,
      pagesDir,
      distDir,
      buildId,
      encryptionKey,
      previewProps,
      rewrites,
      appDir,
      telemetry,
      resetFetch,
    }: {
      config: NextConfigComplete
      isSrcDir: boolean
      pagesDir?: string
      distDir: string
      buildId: string
      encryptionKey: string
      previewProps: __ApiPreviewProps
      rewrites: CustomRoutes['rewrites']
      appDir?: string
      telemetry: Telemetry
      resetFetch: () => void
    }
  ) {
    super(dir, {
      config,
      isSrcDir,
      pagesDir,
      distDir,
      buildId,
      encryptionKey,
      previewProps,
      rewrites,
      appDir,
      telemetry,
      resetFetch,
    })
  }

  public async afterCompile(multiCompiler: MultiCompiler): Promise<void> {
    const rspackStartSpan = this.hotReloaderSpan.traceChild(
      'rspack-after-compile'
    )
    await rspackStartSpan.traceAsyncFn(async () => {
      const hash = createHash('sha1')
      multiCompiler.compilers.forEach((compiler) => {
        const cache = compiler.options.cache
        if (typeof cache === 'object' && 'version' in cache) {
          hash.update(cache.version || '-')
        }
        return undefined
      })
      this.builtEntriesCachePath = path.join(
        this.distDir,
        'cache',
        'rspack',
        hash.digest('hex').substring(0, 16),
        'built-entries.json'
      )

      const hasBuitEntriesCache = await fs
        .access(this.builtEntriesCachePath)
        .then(
          () => true,
          () => false
        )
      if (hasBuitEntriesCache) {
        try {
          const builtEntries: ReturnType<typeof getEntries> = JSON.parse(
            (await fs.readFile(this.builtEntriesCachePath, 'utf-8')) || '{}'
          )
          Object.assign(getEntries(multiCompiler.outputPath), builtEntries)
        } catch (error) {
          console.error('Rspack failed to read built entries cache: ', error)
        }
      }
    })
  }

  public async ensurePage({
    page,
    clientOnly,
    appPaths,
    definition,
    isApp,
    url,
  }: {
    page: string
    clientOnly: boolean
    appPaths?: ReadonlyArray<string> | null
    isApp?: boolean
    definition?: RouteDefinition
    url?: string
  }): Promise<void> {
    await super.ensurePage({
      page,
      clientOnly,
      appPaths,
      definition,
      isApp,
      url,
    })
    const entries = getEntries(this.multiCompiler!.outputPath)
    const builtEntries: ReturnType<typeof getEntries> = {}
    for (const entryName in entries) {
      const entry = entries[entryName]
      if (entry.status === BUILT) {
        builtEntries[entryName] = entry
      }
    }
    const hasBuitEntriesCache = await fs
      .access(this.builtEntriesCachePath!)
      .then(
        () => true,
        () => false
      )
    try {
      if (!hasBuitEntriesCache) {
        await fs.mkdir(path.dirname(this.builtEntriesCachePath!), {
          recursive: true,
        })
      }
      await fs.writeFile(
        this.builtEntriesCachePath!,
        JSON.stringify(builtEntries, null, 2)
      )
    } catch (error) {
      console.error('Rspack failed to write built entries cache: ', error)
    }
  }
}
