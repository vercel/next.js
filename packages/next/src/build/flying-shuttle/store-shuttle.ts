import fs from 'fs'
import path from 'path'
import {
  BUILD_MANIFEST,
  APP_BUILD_MANIFEST,
  REACT_LOADABLE_MANIFEST,
  APP_PATH_ROUTES_MANIFEST,
  PAGES_MANIFEST,
  ROUTES_MANIFEST,
} from '../../shared/lib/constants'
import { recursiveCopy } from '../../lib/recursive-copy'

// we can create a new shuttle with the outputs before env values have
// been inlined, can be done after stitching takes place
export async function storeShuttle({
  distDir,
  shuttleDir,
}: {
  distDir: string
  shuttleDir: string
}) {
  await fs.promises.rm(shuttleDir, { force: true, recursive: true })
  await fs.promises.mkdir(shuttleDir, { recursive: true })

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
