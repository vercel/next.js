import fs from 'fs'
import path from 'path'
import { recursiveCopy } from '../../lib/recursive-copy'
import { version as nextVersion } from 'next/package.json'
import type { NextConfigComplete } from '../../server/config-shared'
import {
  BUILD_MANIFEST,
  APP_BUILD_MANIFEST,
  REACT_LOADABLE_MANIFEST,
  APP_PATH_ROUTES_MANIFEST,
  PAGES_MANIFEST,
  ROUTES_MANIFEST,
} from '../../shared/lib/constants'

export interface ShuttleManifest {
  nextVersion: string
  config: Record<string, any>
}

export function generateShuttleManifest(config: NextConfigComplete) {
  return JSON.stringify({
    nextVersion,
    config: {
      env: config.env,
      i18n: config.i18n,
      basePath: config.basePath,
      sassOptions: config.sassOptions,
      trailingSlash: config.trailingSlash,
      productionBrowserSourceMaps: config.productionBrowserSourceMaps,

      experimental: {
        ppr: config.experimental.ppr,
        reactCompiler: config.experimental.reactCompiler,
        serverSourceMaps: config.experimental.serverSourceMaps,
        serverMinification: config.experimental.serverMinification,
      },
    },
  } satisfies ShuttleManifest)
}

// we can create a new shuttle with the outputs before env values have
// been inlined, can be done after stitching takes place
export async function storeShuttle({
  config,
  distDir,
  shuttleDir,
}: {
  distDir: string
  shuttleDir: string
  config: NextConfigComplete
}) {
  await fs.promises.rm(shuttleDir, { force: true, recursive: true })
  await fs.promises.mkdir(shuttleDir, { recursive: true })

  await fs.promises.writeFile(
    path.join(shuttleDir, 'shuttle-manifest.json'),
    generateShuttleManifest(config)
  )

  // copy all server entries
  await recursiveCopy(
    path.join(distDir, 'server'),
    path.join(shuttleDir, 'server'),
    {
      filter(item) {
        return !item.match(/\.(rsc|meta|html)$/)
      },
    }
  )

  const pagesManifest = JSON.parse(
    await fs.promises.readFile(
      path.join(shuttleDir, 'server', PAGES_MANIFEST),
      'utf8'
    )
  )
  // ensure manifest isn't modified to .html as it's before static gen
  for (const key of Object.keys(pagesManifest)) {
    pagesManifest[key] = pagesManifest[key].replace(/\.html$/, '.js')
  }
  await fs.promises.writeFile(
    path.join(shuttleDir, 'server', PAGES_MANIFEST),
    JSON.stringify(pagesManifest)
  )

  // copy static assets
  await recursiveCopy(
    path.join(distDir, 'static'),
    path.join(shuttleDir, 'static')
  )

  // copy manifests not nested in {distDir}/server/
  await fs.promises.mkdir(path.join(shuttleDir, 'manifests'), {
    recursive: true,
  })

  for (const item of [
    BUILD_MANIFEST,
    ROUTES_MANIFEST,
    APP_BUILD_MANIFEST,
    REACT_LOADABLE_MANIFEST,
    APP_PATH_ROUTES_MANIFEST,
  ]) {
    const outputPath = path.join(shuttleDir, 'manifests', item)
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.promises.copyFile(path.join(distDir, item), outputPath)
  }
}
