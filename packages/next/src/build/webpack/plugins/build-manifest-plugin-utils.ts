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
  initialReconciliationDeterministic?: boolean
}): CustomRoutes['rewrites']['beforeFiles'][0] {
  return {
    has: item.has,
    source: item.source,
    destination: item.destination,
    initialReconciliationDeterministic: item.initialReconciliationDeterministic,
  }
}

/**
 * Check whether a rewrite can be reasoned about exactly before the Pages
 * Router is created on the client.
 *
 * 1. The destination must stay internal so the client router can resolve it.
 * 2. `has` conditions must be absent because they can depend on request-time
 *    data the client does not always have before hydration.
 * 3. `missing` conditions must be absent for the same reason.
 *
 * @param rewrite the rewrite being normalized for the client build manifest
 * @returns true when the rewrite is part of the deterministic safe subset
 */
function isInitialReconciliationDeterministic(rewrite: Rewrite): boolean {
  if (!rewrite.destination?.startsWith('/')) {
    return false
  }

  if (rewrite.has?.length) {
    return false
  }

  if (rewrite.missing?.length) {
    return false
  }

  return true
}

export const processRoute = (r: Rewrite) => {
  const rewrite = { ...r }
  rewrite.initialReconciliationDeterministic =
    isInitialReconciliationDeterministic(r)

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
  assetMap: Partial<BuildManifest>
): string {
  // we use globalThis here because middleware can be node
  // which doesn't have "self"
  return `globalThis.__BUILD_MANIFEST = ${JSON.stringify(assetMap, null, 2)};\n`
}
