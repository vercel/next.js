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
  // Per-page Turbopack chunk-group bootstrap params, stored as raw JSON.
  pagesChunkGroupBootstrapParams?: { [page: string]: object }
  // The chunk-loading global the runtime drains (default "TURBOPACK").
  chunkLoadingGlobal?: string
}

/**
 * Builds inline `globalThis[<global>].push(<params>)` bootstrap content for the given
 * pages, seeding the runtime queue before the shared runtime chunk drains it. Only call
 * this for Turbopack production builds (the only builds that populate
 * `pagesChunkGroupBootstrapParams` / `chunkLoadingGlobal`). Returns undefined when none
 * of the given pages have inlined params.
 */
export function getTurbopackChunkGroupBootstrap(
  paramsByPage: { [page: string]: object },
  chunkLoadingGlobal: string,
  pages: readonly string[]
): string | undefined {
  const g = JSON.stringify(chunkLoadingGlobal)
  const statements = pages
    .map((page) => paramsByPage[page])
    .filter(Boolean)
    .map(
      (params) =>
        `(globalThis[${g}] || (globalThis[${g}] = [])).push(${JSON.stringify(
          params
        )});`
    )

  return statements.length > 0 ? statements.join('\n') : undefined
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
