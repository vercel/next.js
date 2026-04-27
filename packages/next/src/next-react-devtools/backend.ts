import { initialize as initBackend } from 'react-devtools-inline/backend'

declare global {
  interface Window {
    __NEXT_REACT_DEVTOOLS_BACKEND_INITIALIZED__?: boolean
  }
}

export function installBackendHook(): void {
  if (window.__NEXT_REACT_DEVTOOLS_BACKEND_INITIALIZED__) {
    return
  }

  window.__NEXT_REACT_DEVTOOLS_BACKEND_INITIALIZED__ = true
  initBackend(window)
}
