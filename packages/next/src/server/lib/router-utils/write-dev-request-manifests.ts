import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import type { __ApiPreviewProps } from '../../api-utils'
import {
  PRERENDER_MANIFEST,
  PREVIEW_PROPS_MANIFEST,
  SERVER_DIRECTORY,
} from '../../../shared/lib/constants'

/** Initialize the request manifests used by the development server. */
export async function writeDevRequestManifests(
  distDir: string,
  previewProps: __ApiPreviewProps
) {
  const manifests = {
    previewProps: `${SERVER_DIRECTORY}/${PREVIEW_PROPS_MANIFEST}`,
    prerender: PRERENDER_MANIFEST,
  }
  await mkdir(join(distDir, SERVER_DIRECTORY), { recursive: true })
  await writeFile(
    join(distDir, manifests.previewProps),
    JSON.stringify(previewProps, null, 2)
  )
  await writeFile(
    join(distDir, manifests.prerender),
    JSON.stringify(
      {
        version: 4,
        routes: {},
        dynamicRoutes: {},
        notFoundRoutes: [],
      },
      null,
      2
    )
  )
  return manifests
}
