import type { CustomRoutes, Rewrite } from '../../../lib/load-custom-routes'
import type { BuildManifest } from '../../../server/get-page-files'

export type ClientBuildManifest = {
  [key: string]: string[]
}

// Add the runtime ssg manifest file as a lazy-loaded file dependency.
// We also stub this file out for development mode (when it is not
// generated).
export const srcEmptySsgManifest = `self.__SSG_MANIFEST=new Set;self.__SSG_MANIFEST_CB&&self.__SSG_MANIFEST_CB()`

function normalizeRewrite(item: {
  source: string
  destination: string
  has?: any
}): CustomRoutes['rewrites']['beforeFiles'][0] {
  return {
    has: item.has,
    source: item.source,
    destination: item.destination,
  }
}

export const processRoute = (r: Rewrite) => {
  const rewrite = { ...r }

  // omit external rewrite destinations since these aren't
  // handled client-side
  if (!rewrite?.destination?.startsWith('/')) {
    delete (rewrite as any).destination
  }
  return rewrite
}

export function normalizeRewritesForBuildManifest(
  rewrites: CustomRoutes['rewrites']
): CustomRoutes['rewrites'] {
  return {
    afterFiles: rewrites.afterFiles
      ?.map(processRoute)
      ?.map((item) => normalizeRewrite(item)),
    beforeFiles: rewrites.beforeFiles
      ?.map(processRoute)
      ?.map((item) => normalizeRewrite(item)),
    fallback: rewrites.fallback
      ?.map(processRoute)
      ?.map((item) => normalizeRewrite(item)),
  }
}

export function createEdgeRuntimeManifest(
  originAssetMap: Partial<BuildManifest>
): string {
  const manifestFilenames = ['_buildManifest.js', '_ssgManifest.js']

  const assetMap: Partial<BuildManifest> = {
    ...originAssetMap,
    lowPriorityFiles: [],
  }

  // we use globalThis here because middleware can be node
  // which doesn't have "self"
  const manifestDefCode = `globalThis.__BUILD_MANIFEST = ${JSON.stringify(
    assetMap,
    null,
    2
  )};\n`
  // edge lowPriorityFiles item: '"/static/" + process.env.__NEXT_BUILD_ID + "/low-priority.js"'.
  // Since lowPriorityFiles is not fixed and relying on `process.env.__NEXT_BUILD_ID`, we'll produce code creating it dynamically.
  const lowPriorityFilesCode =
    `globalThis.__BUILD_MANIFEST.lowPriorityFiles = [\n` +
    manifestFilenames
      .map((filename) => {
        return `"/static/" + process.env.__NEXT_BUILD_ID + "/${filename}"`
      })
      .join(',\n') +
    `\n];`

  return manifestDefCode + lowPriorityFilesCode
}
