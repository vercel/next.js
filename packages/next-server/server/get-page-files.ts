import { normalizePagePath } from './normalize-page-path'
import { tryAmp } from './require'

export type BuildManifest = {
  devFiles: string[],
  pages: {
    [page: string]: string[],
  },
}

export function getPageFiles(buildManifest: BuildManifest, page: string): string[] {
  const normalizedPage = normalizePagePath(page)
  let files = buildManifest.pages[normalizedPage]
  if (!files) {
    page = tryAmp(buildManifest.pages, normalizedPage)
    files = buildManifest.pages[page]
  }

  if (!files) {
    // tslint:disable-next-line
    console.warn(`Could not find files for ${normalizedPage} in .next/build-manifest.json`)
    return []
  }

  return files
}
