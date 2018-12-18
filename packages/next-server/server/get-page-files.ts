import {normalizePagePath} from './require'

export type BuildManifest = {
  devFiles: string[],
  pages: {
    [page: string]: string[]
  }
}

export function getPageFiles (buildManifest: BuildManifest, page: string): string[] {
  const normalizedPage = normalizePagePath(page)
  const files = buildManifest.pages[normalizedPage]

  if (!files) {
    console.warn(`Could not find files for ${normalizedPage} in .next/build-manifest.json`)
    return []
  }

  return files
}
