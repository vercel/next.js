import path from 'node:path'

import type { NextConfigComplete } from '../server/config-shared'
import { CLIENT_STATIC_FILES_PATH } from '../shared/lib/constants'
import { encodeURIPath } from '../shared/lib/encode-uri-path'
import { getOfflineNavigationFallbackFilePath } from './offline-navigation-fallback'

export const OFFLINE_NAVIGATION_MANIFEST = '_offline-navigation-manifest.json'

export interface OfflineNavigationManifest {
  version: 1
  buildId: string
  basePath: string
  assetPrefix: string
  trailingSlash: boolean
  output: NonNullable<NextConfigComplete['output']> | 'default'
  scope: string
  cacheNamespace: string
  manifest: {
    path: string
    href: string
  }
  fallbackDocument: {
    path: string
    href: string
  }
}

export function getOfflineNavigationManifestFilePath(buildId: string): string {
  return path.join(
    CLIENT_STATIC_FILES_PATH,
    buildId,
    OFFLINE_NAVIGATION_MANIFEST
  )
}

function getStaticHref(basePath: string, filePath: string): string {
  return `${basePath}/_next/${encodeURIPath(filePath)}`
}

function getScope(basePath: string): string {
  return basePath ? `${basePath}/` : '/'
}

// Describe the build-scoped offline navigation artifacts with URLs that honor
// the app basePath. Later slices use this manifest as the service worker's
// source of truth for what bootstrap artifacts to cache.
export function createOfflineNavigationManifest({
  assetPrefix,
  basePath,
  buildId,
  output,
  trailingSlash,
}: {
  assetPrefix: string
  basePath: string
  buildId: string
  output: NextConfigComplete['output']
  trailingSlash: boolean
}): OfflineNavigationManifest {
  const manifestPath = getOfflineNavigationManifestFilePath(buildId)
  const fallbackDocumentPath = getOfflineNavigationFallbackFilePath(buildId)

  return {
    version: 1,
    buildId,
    basePath,
    assetPrefix,
    trailingSlash,
    output: output ?? 'default',
    scope: getScope(basePath),
    // Scope caches by build and basePath so a new deployment never reuses an
    // older fallback document.
    cacheNamespace: `next-offline-navigation-v1:${buildId}:${basePath || '/'}`,
    manifest: {
      path: manifestPath,
      href: getStaticHref(basePath, manifestPath),
    },
    fallbackDocument: {
      path: fallbackDocumentPath,
      href: getStaticHref(basePath, fallbackDocumentPath),
    },
  }
}
