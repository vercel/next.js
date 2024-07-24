import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
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
import { getNextPublicEnvironmentVariables } from '../webpack/plugins/define-env-plugin'

export function generateShuttleManifest(config: NextConfigComplete) {
  // NEXT_PUBLIC_ changes for now since they are inlined
  // and specific next config values that can impact the build
  const globalHash = crypto.createHash('sha256')
  const nextPublicEnv = getNextPublicEnvironmentVariables()
  for (const key in nextPublicEnv) {
    globalHash.update(`${key}=${nextPublicEnv[key]}`)
  }

  const omittedConfigKeys = ['headers', 'rewrites', 'redirects']

  for (const key in config) {
    if (omittedConfigKeys.includes(key)) {
      continue
    }
    let serializedConfig =
      typeof config[key] === 'function'
        ? config[key].toString()
        : JSON.stringify(config[key])

    globalHash.update(`${key}=${serializedConfig}`)
  }

  return {
    nextVersion,
    globalHash: globalHash.digest('hex'),
  }
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

  const shuttleManifest = generateShuttleManifest(config)
  await fs.promises.writeFile(
    path.join(shuttleDir, 'shuttle-manifest.json'),
    JSON.stringify(shuttleManifest)
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
