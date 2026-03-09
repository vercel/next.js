// This script runs inside the iframe created by the initialize.tsx script
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  createBridge as createFrontendBridge,
  createStore,
  initialize as initFrontend,
} from 'react-devtools-inline/frontend'

const ROOT_ID = '__next-react-devtools-root'

function boot() {
  const shared = window.parent.__NEXT_REACT_DEVTOOLS_FRAME_SHARED__
  const container = document.getElementById(ROOT_ID)

  if (!shared || !container) {
    return
  }

  const bridge = createFrontendBridge(window, shared.wall)
  const store = createStore(bridge)
  const DevTools = initFrontend(window, { bridge, store })

  createRoot(container, { identifierPrefix: 'nrdt-' }).render(
    createElement(DevTools, {
      browserTheme: 'dark',
      showTabBar: true,
      warnIfLegacyBackendDetected: true,
      warnIfUnsupportedVersionDetected: true,
    })
  )

  shared.activate()
}

if (typeof document !== 'undefined' && document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', boot, { once: true })
} else {
  boot()
}
