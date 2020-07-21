import { normalizePagePath, denormalizePagePath } from './normalize-page-path'

export type BuildManifest = {
  devFiles: string[]
  ampDevFiles: string[]
  polyfillFiles: string[]
  lowPriorityFiles: string[]
  pages: {
    '/_app': string[]
    [page: string]: string[]
  }
  ampFirstPages: string[]
}

export function getPageFiles(
  buildManifest: BuildManifest,
  page: string
): string[] {
  const normalizedPage = denormalizePagePath(normalizePagePath(page))
  let files = buildManifest.pages[normalizedPage]

  if (!files) {
    // tslint:disable-next-line
    console.warn(
      `Could not find files for ${normalizedPage} in .next/build-manifest.json`
    )
    return []
  }

  return files
}
