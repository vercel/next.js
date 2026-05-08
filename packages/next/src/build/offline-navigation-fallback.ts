import path from 'node:path'

import type { BuildManifest } from '../server/get-page-files'
import { encodeURIPath } from '../shared/lib/encode-uri-path'
import {
  htmlEscapeAttributeString,
  htmlEscapeJsonString,
} from '../shared/lib/htmlescape'
import { CLIENT_STATIC_FILES_PATH } from '../shared/lib/constants'

export const OFFLINE_NAVIGATION_FALLBACK_HTML =
  '_offline-navigation-fallback.html'

export function getOfflineNavigationFallbackFilePath(buildId: string): string {
  return path.join(
    CLIENT_STATIC_FILES_PATH,
    buildId,
    OFFLINE_NAVIGATION_FALLBACK_HTML
  )
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

// Generate the build-scoped HTML entrypoint used by offline document fallback
// handling. It intentionally contains only the app bootstrap, not route HTML;
// exact-URL route data is restored by the client after this document loads.
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
}): string | null {
  const rootMainFiles = buildManifest.rootMainFiles.filter((file) =>
    file.endsWith('.js')
  )

  if (rootMainFiles.length === 0) {
    return null
  }

  const polyfillScripts = buildManifest.polyfillFiles
    .filter((file) => file.endsWith('.js') && !file.endsWith('.module.js'))
    .map((file) => {
      return `<script src="${htmlEscapeAttributeString(
        getAssetHref(assetPrefix, file)
      )}" noModule${getScriptAttributes(crossOrigin)}></script>`
    })
    .join('')

  const bootstrapScripts = rootMainFiles
    .map((file) => {
      return `<script src="${htmlEscapeAttributeString(
        getAssetHref(assetPrefix, file)
      )}" async${getScriptAttributes(crossOrigin)}></script>`
    })
    .join('')

  const metadata = {
    buildId,
    source: 'offline-navigation-fallback',
  }

  const deploymentIdAttribute = deploymentId
    ? ` data-dpl-id="${htmlEscapeAttributeString(deploymentId)}"`
    : ''

  return `<!DOCTYPE html><html data-next-offline-navigation-fallback="" data-build-id="${htmlEscapeAttributeString(
    buildId
  )}"${deploymentIdAttribute}><head><meta charSet="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="next-offline-navigation-fallback" content="1"><meta name="next-build-id" content="${htmlEscapeAttributeString(
    buildId
  )}"><script id="__NEXT_OFFLINE_NAVIGATION_FALLBACK" type="application/json">${htmlEscapeJsonString(
    JSON.stringify(metadata)
  )}</script></head><body><div id="__next"></div><p id="__NEXT_OFFLINE_NAVIGATION_CACHE_MISS" hidden>This page is not available offline.</p><script>self.__next_f=self.__next_f||[];self.__next_f.push([0])</script>${polyfillScripts}${bootstrapScripts}</body></html>`
}
