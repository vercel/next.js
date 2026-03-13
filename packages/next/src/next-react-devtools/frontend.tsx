// This script runs inside the iframe created by the initialize.tsx script
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { devirtualizeReactServerURL } from '../shared/lib/devirtualize-react-server-url'
import {
  createBridge as createFrontendBridge,
  createStore,
  initialize as initFrontend,
} from 'react-devtools-inline/frontend'

const ROOT_ID = '__next-react-devtools-root'

const fileCache = new Map<string, Promise<string>>()
type ReactResourceLocation = [string, string, number, number]

/**
 * The inline React DevTools bundle is served outside Next's normal client
 * compilation pipeline, so read the live basePath from the parent window
 * instead of depending on injected env constants.
 */
function getParentBasePath(): string {
  return (
    (
      window.parent as typeof window & {
        next?: { router?: { basePath?: string } }
      }
    ).next?.router?.basePath ?? ''
  )
}

/**
 * Inline `data:` sourcemap URLs need a base64 payload to safely embed arbitrary
 * JSON without relying on URL escaping rules.
 */
function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

/**
 * React server component sources resolve to virtual or file-backed URLs that
 * page `fetch()` cannot read directly, so reuse Next's existing sourcemap
 * endpoint and hand React DevTools a synthetic inline sourcemap instead.
 */
async function fetchVirtualServerSource(resolvedURL: string): Promise<string> {
  const params = new URLSearchParams()
  params.append('filename', resolvedURL)

  const res = await fetch(
    `${getParentBasePath()}/__nextjs_source-map?${params.toString()}`
  )
  if (!res.ok) {
    throw new Error(`Failed to load source map for ${resolvedURL}`)
  }

  const sourceMapPayload = await res.text()
  return `//# sourceMappingURL=data:application/json;base64,${encodeBase64(sourceMapPayload)}`
}

/**
 * Only React virtual URLs and file-backed server chunk URLs need the sourcemap
 * endpoint detour. Browser-fetchable asset URLs should stay on the direct path.
 */
function shouldUseSourceMapEndpoint(
  originalURL: string,
  resolvedURL: string
): boolean {
  return (
    originalURL.startsWith('about://React/') ||
    resolvedURL.startsWith('file://') ||
    /^[A-Za-z]:[\\/]/.test(resolvedURL)
  )
}

/**
 * Cache by the devirtualized URL so the React virtual form and the underlying
 * file-backed form share one lookup result.
 */
function fetchFileWithCaching(url: string): Promise<string> {
  const resolvedURL = devirtualizeReactServerURL(url)
  console.log('[next-react-devtools] fetchFileWithCaching', resolvedURL)

  const cached = fileCache.get(resolvedURL)
  if (cached) {
    return cached
  }

  const request = shouldUseSourceMapEndpoint(url, resolvedURL)
    ? fetchVirtualServerSource(resolvedURL)
    : fetch(resolvedURL).then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load ${resolvedURL}`)
        }

        return res.text()
      })

  fileCache.set(resolvedURL, request)
  return request
}

/**
 * Match standalone React DevTools behavior and only enable source clicks once
 * we have a sourcemapped location to act on.
 */
function canViewElementSourceFunction(
  _source: ReactResourceLocation,
  symbolicatedSource: ReactResourceLocation | null
) {
  if (symbolicatedSource === null) {
    return false
  }

  const [, sourceURL, line, column] = symbolicatedSource
  const resolvedURL = devirtualizeReactServerURL(sourceURL)

  return (
    resolvedURL !== '' &&
    !resolvedURL.startsWith('<anonymous>') &&
    line > 0 &&
    column > 0
  )
}

/**
 * Source clicks should open the symbolicated file location, not the generated
 * server chunk path that React reports before sourcemap resolution.
 */
function viewElementSourceFunction(
  _source: ReactResourceLocation,
  symbolicatedSource: ReactResourceLocation | null
) {
  if (symbolicatedSource === null) {
    return
  }

  const [, sourceURL, line, column] = symbolicatedSource
  const resolvedURL = devirtualizeReactServerURL(sourceURL)

  const params = new URLSearchParams()
  params.append('file', resolvedURL)
  params.append('line1', String(line))
  params.append('column1', String(column))

  void fetch(
    `${getParentBasePath()}/__nextjs_launch-editor?${params.toString()}`
  ).catch((cause) => {
    console.error(
      `Failed to open file "${resolvedURL} (${line}:${column})" in your editor. Cause:`,
      cause
    )
  })
}

function boot() {
  const shared = window.parent.__NEXT_REACT_DEVTOOLS_FRAME_SHARED__
  const container = document.getElementById(ROOT_ID)

  if (!shared || !container) {
    return
  }

  const bridge = createFrontendBridge(window, shared.wall)
  const store = createStore(bridge, {
    // @ts-expect-error - TODO: There is a config, type mismatch.
    supportsInspectMatchingDOMElement: true,
    supportsClickToInspect: true,
    // original at createStore of react-devtools-inline/frontend
    checkBridgeProtocolCompatibility: true,
    supportsTraceUpdates: true,
    supportsTimeline: true,
  })
  const DevTools = initFrontend(window, { bridge, store })
  const hookNamesModuleLoaderFunction = () =>
    import('react-devtools-inline/hookNames')

  createRoot(container, { identifierPrefix: 'nrdt-' }).render(
    createElement(DevTools, {
      browserTheme: 'dark',
      showTabBar: true,
      warnIfLegacyBackendDetected: true,
      warnIfUnsupportedVersionDetected: true,
      fetchFileWithCaching,
      hookNamesModuleLoaderFunction,
      // @ts-expect-error - TODO: There is a type mismatch.
      canViewElementSourceFunction,
      // @ts-expect-error - TODO: There is a type mismatch.
      viewElementSourceFunction,
    })
  )

  shared.activate()
}

if (typeof document !== 'undefined' && document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', boot, { once: true })
} else {
  boot()
}
