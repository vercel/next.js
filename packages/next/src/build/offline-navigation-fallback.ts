import path from 'node:path'

import type { BuildManifest } from '../server/get-page-files'
import { encodeURIPath } from '../shared/lib/encode-uri-path'
import {
  htmlEscapeAttributeString,
  htmlEscapeJsonString,
} from '../shared/lib/htmlescape'
import { CLIENT_STATIC_FILES_PATH } from '../shared/lib/constants'
import { createInitialInlinedFlightDataScriptContent } from '../shared/lib/inlined-flight-data'
import {
  OFFLINE_NAVIGATION_BUILD_ID_META_NAME,
  OFFLINE_NAVIGATION_CACHE_MISS_ELEMENT_ID,
  OFFLINE_NAVIGATION_FALLBACK_DOCUMENT_ATTRIBUTE,
  OFFLINE_NAVIGATION_FALLBACK_HTML,
  OFFLINE_NAVIGATION_FALLBACK_META_NAME,
  OFFLINE_NAVIGATION_FALLBACK_SCRIPT_ID,
} from '../shared/lib/offline-navigation-constants'

export function getOfflineNavigationFallbackFilePath(buildId: string): string {
  return path.join(
    CLIENT_STATIC_FILES_PATH,
    buildId,
    OFFLINE_NAVIGATION_FALLBACK_HTML
  )
}

export function getOfflineNavigationFallbackDocumentHref({
  basePath,
  buildId,
}: {
  basePath: string
  buildId: string
}): string {
  return `${basePath}/_next/${encodeURIPath(
    getOfflineNavigationFallbackFilePath(buildId)
  )}`
}

function getAssetHref(assetPrefix: string, file: string): string {
  return `${assetPrefix}/_next/${encodeURIPath(file)}`
}

function getScriptAttributes(
  crossOrigin: '' | 'anonymous' | 'use-credentials' | undefined
): string {
  if (!crossOrigin) {
    return ''
  }

  return ` crossOrigin="${htmlEscapeAttributeString(crossOrigin)}"`
}

function renderJsonScript(id: string, data: unknown): string {
  return `<script id="${id}" type="application/json">${htmlEscapeJsonString(
    JSON.stringify(data)
  )}</script>`
}

function renderScriptSrc({
  async,
  crossOrigin,
  noModule,
  src,
}: {
  async?: boolean
  crossOrigin: '' | 'anonymous' | 'use-credentials' | undefined
  noModule?: boolean
  src: string
}): string {
  const attributes = [
    ` src="${htmlEscapeAttributeString(src)}"`,
    noModule ? ' noModule' : '',
    async ? ' async' : '',
    getScriptAttributes(crossOrigin),
  ].join('')

  return `<script${attributes}></script>`
}

function renderInitialFlightBootstrapScript(): string {
  // The empty fallback document still needs the initial Flight instruction so
  // the client can mount through the same bootstrap path as a normal document.
  return `<script>${createInitialInlinedFlightDataScriptContent(null)}</script>`
}

function renderOfflineNavigationCacheMissElement(): string {
  return `<p id="${OFFLINE_NAVIGATION_CACHE_MISS_ELEMENT_ID}" hidden>This page is not available offline.</p>`
}

export interface OfflineNavigationFallbackDocument {
  html: string
  assetHrefs: string[]
}

function renderFallbackDocument({
  bootstrapScripts,
  buildId,
  deploymentId,
  metadata,
  polyfillScripts,
}: {
  bootstrapScripts: string
  buildId: string
  deploymentId: string | undefined
  metadata: unknown
  polyfillScripts: string
}): string {
  const escapedBuildId = htmlEscapeAttributeString(buildId)
  const deploymentIdAttribute = deploymentId
    ? ` data-dpl-id="${htmlEscapeAttributeString(deploymentId)}"`
    : ''

  return [
    '<!DOCTYPE html>',
    `<html ${OFFLINE_NAVIGATION_FALLBACK_DOCUMENT_ATTRIBUTE}="" data-build-id="${escapedBuildId}"${deploymentIdAttribute}>`,
    '<head>',
    '<meta charSet="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta name="${OFFLINE_NAVIGATION_FALLBACK_META_NAME}" content="1">`,
    `<meta name="${OFFLINE_NAVIGATION_BUILD_ID_META_NAME}" content="${escapedBuildId}">`,
    renderJsonScript(OFFLINE_NAVIGATION_FALLBACK_SCRIPT_ID, metadata),
    '</head>',
    '<body>',
    '<div id="__next"></div>',
    renderOfflineNavigationCacheMissElement(),
    renderInitialFlightBootstrapScript(),
    polyfillScripts,
    bootstrapScripts,
    '</body>',
    '</html>',
  ].join('')
}

// Generate the build-scoped HTML entrypoint used by offline document fallback
// handling. It intentionally contains only the app bootstrap, not route HTML;
// route data is restored by the client from persisted Segment Cache records
// after this document loads.
export function createOfflineNavigationFallbackDocument({
  assetPrefix,
  buildId,
  buildManifest,
  crossOrigin,
  deploymentId,
}: {
  assetPrefix: string
  buildId: string
  buildManifest: BuildManifest
  crossOrigin: '' | 'anonymous' | 'use-credentials' | undefined
  deploymentId: string | undefined
}): OfflineNavigationFallbackDocument | null {
  const rootMainFiles = buildManifest.rootMainFiles.filter((file) =>
    file.endsWith('.js')
  )

  if (rootMainFiles.length === 0) {
    return null
  }

  const fallbackAssetHrefs = [
    ...buildManifest.polyfillFiles
      .filter((file) => file.endsWith('.js') && !file.endsWith('.module.js'))
      .map((file) => getAssetHref(assetPrefix, file)),
    ...rootMainFiles.map((file) => getAssetHref(assetPrefix, file)),
  ]

  const polyfillScripts = buildManifest.polyfillFiles
    .filter((file) => file.endsWith('.js') && !file.endsWith('.module.js'))
    .map((file) => {
      return renderScriptSrc({
        crossOrigin,
        noModule: true,
        src: getAssetHref(assetPrefix, file),
      })
    })
    .join('')

  const bootstrapScripts = rootMainFiles
    .map((file) => {
      return renderScriptSrc({
        async: true,
        crossOrigin,
        src: getAssetHref(assetPrefix, file),
      })
    })
    .join('')

  const metadata = { buildId }

  return {
    assetHrefs: fallbackAssetHrefs,
    html: renderFallbackDocument({
      bootstrapScripts,
      buildId,
      deploymentId,
      metadata,
      polyfillScripts,
    }),
  }
}
