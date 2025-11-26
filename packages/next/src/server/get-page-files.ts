import { denormalizePagePath } from '../shared/lib/page-path/denormalize-page-path'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'

export type BuildManifest = {
  devFiles: readonly string[]
  polyfillFiles: readonly string[]
  lowPriorityFiles: readonly string[]
  rootMainFiles: readonly string[]
  // this is a separate field for flying shuttle to allow
  // different root main files per entries/build (ideally temporary)
  // until we can stitch the runtime chunks together safely
  rootMainFilesTree: { [appRoute: string]: readonly string[] }
  pages: {
    '/_app': readonly string[]
    [page: string]: readonly string[]
  }
}

export function getPageFiles(
  buildManifest: BuildManifest,
  page: string
): readonly string[] {
  const normalizedPage = denormalizePagePath(normalizePagePath(page))
  let files = buildManifest.pages[normalizedPage]

  if (!files) {
    console.warn(
      `Could not find files for ${normalizedPage} in .next/build-manifest.json`
    )
    return []
  }

  return files
}
