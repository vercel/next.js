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

function fetchFileWithCaching(url: string): Promise<string> {
  const resolvedURL = devirtualizeReactServerURL(url)
  console.log('[next-react-devtools] fetchFileWithCaching', resolvedURL)

  const cached = fileCache.get(resolvedURL)
  if (cached) {
    return cached
  }

  const request = fetch(resolvedURL).then(async (res) => {
    if (!res.ok) {
      throw new Error(`Failed to load ${resolvedURL}`)
    }

    return res.text()
  })

  fileCache.set(resolvedURL, request)
  return request
}

function canViewElementSourceFunction(
  source: ReactResourceLocation,
  symbolicatedSource: ReactResourceLocation | null
) {
  const [, sourceURL, line, column] = symbolicatedSource ?? source
  const resolvedURL = devirtualizeReactServerURL(sourceURL)

  return (
    resolvedURL !== '' &&
    !resolvedURL.startsWith('<anonymous>') &&
    line > 0 &&
    column > 0
  )
}

function viewElementSourceFunction(
  source: ReactResourceLocation,
  symbolicatedSource: ReactResourceLocation | null
) {
  const [, sourceURL, line, column] = symbolicatedSource ?? source
  const resolvedURL = devirtualizeReactServerURL(sourceURL)

  if (!canViewElementSourceFunction(source, symbolicatedSource)) {
    return
  }

  const params = new URLSearchParams()
  params.append('file', resolvedURL)
  params.append('line1', String(line))
  params.append('column1', String(column))

  const parentBasePath =
    (
      window.parent as typeof window & {
        next?: { router?: { basePath?: string } }
      }
    ).next?.router?.basePath ?? ''

  void fetch(
    `${parentBasePath}/__nextjs_launch-editor?${params.toString()}`
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
