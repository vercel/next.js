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

function createRuntimeWatchdogScript(): string {
  return `<script>(function(){var doc=document.documentElement;var reason='runtime-error';var done=false;function finish(){done=true;removeEventListener('error',onError,true);clearTimeout(timer);delete self.__NEXT_OFFLINE_NAVIGATION_FALLBACK_WATCHDOG_CANCEL__}function reportRuntimeFailure(){if(done||doc.hasAttribute('data-next-offline-navigation-cache'))return;finish();doc.setAttribute('data-next-offline-navigation-cache','miss');doc.setAttribute('data-next-offline-navigation-cache-reason',reason);var miss=document.getElementById('__NEXT_OFFLINE_NAVIGATION_CACHE_MISS');if(miss){miss.hidden=false;miss.setAttribute('data-next-offline-navigation-cache-reason',reason)}var diagnostics=self.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__=self.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__||[];if(diagnostics.length>=32){diagnostics.shift()}diagnostics.push({type:'cache-miss',url:location.href,buildId:doc.getAttribute('data-dpl-id')||doc.getAttribute('data-build-id')||undefined,reason:reason})}function onError(event){var target=event&&event.target;if(target&&target.tagName==='SCRIPT'&&target.src&&target.src.indexOf('/_next/static/')!==-1){reportRuntimeFailure()}}var timer=setTimeout(reportRuntimeFailure,4000);self.__NEXT_OFFLINE_NAVIGATION_FALLBACK_WATCHDOG_CANCEL__=finish;addEventListener('error',onError,true)})()</script>`
}

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
  )}</script></head><body><div id="__next"></div><p id="__NEXT_OFFLINE_NAVIGATION_CACHE_MISS" hidden>This page is not available offline.</p><script>self.__next_f=self.__next_f||[];self.__next_f.push([0])</script>${createRuntimeWatchdogScript()}${polyfillScripts}${bootstrapScripts}</body></html>`
}
