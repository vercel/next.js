import type { Wall } from 'react-devtools-inline/backend'
import { activate, createBridge } from 'react-devtools-inline/backend'
import { installBackendHook } from './backend'

const FRAME_ATTR = 'data-nextjs-react-devtools-frame'
const FRONTEND_SCRIPT_PATH = '/__nextjs_react_devtools/frontend.js'

declare global {
  interface Window {
    __NEXT_REACT_DEVTOOLS_FRAME_SHARED__?: {
      activate: () => void
      wall: Wall
    }
  }
}

function createIframe() {
  let iframe = document.querySelector(
    `iframe[${FRAME_ATTR}]`
  ) as HTMLIFrameElement | null

  if (iframe) {
    return iframe
  }

  iframe = document.createElement('iframe')
  iframe.setAttribute(FRAME_ATTR, 'true')
  iframe.setAttribute('aria-label', 'React DevTools')
  // TODO: Styles are temporary, will probably be moved into the Next DevTools overlay
  iframe.style.position = 'fixed'
  iframe.style.top = '0'
  iframe.style.right = '0'
  iframe.style.width = '50vw'
  iframe.style.height = '100dvh'
  iframe.style.border = '0'
  iframe.style.borderLeft = '1px solid rgba(0, 0, 0, 0.12)'
  iframe.style.background = '#0b0b0c'
  iframe.style.display = 'block'
  iframe.style.overflow = 'hidden'
  iframe.style.zIndex = '2147483646'
  iframe.style.colorScheme = 'dark'
  iframe.srcdoc = `<!doctype html>
<html>
  <head>
    <style>
      html, body, #__next-react-devtools-root {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: #0b0b0c;
      }

      body {
        color-scheme: dark;
      }
    </style>
  </head>
  <body>
    <div id="__next-react-devtools-root"></div>
    <script src="${FRONTEND_SCRIPT_PATH}"></script>
  </body>
</html>`
  document.body.appendChild(iframe)

  return iframe
}

function initialize(): void {
  installBackendHook()

  if (window.__NEXT_REACT_DEVTOOLS_FRAME_SHARED__) {
    throw new Error(
      'Next React DevTools already initialized. This is a bug in Next.js'
    )
  }

  const listeners = new Set<
    (message: { event: string; payload: unknown }) => void
  >()

  const wall: Wall = {
    listen(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
    send(event, payload) {
      const message = { event, payload }

      listeners.forEach((listener) => {
        listener(message)
      })
    },
  }

  const bridge = createBridge(window, wall)

  window.__NEXT_REACT_DEVTOOLS_FRAME_SHARED__ = {
    wall,
    activate() {
      activate(window, { bridge })
    },
  }

  if (document.readyState === 'loading' || !document.body) {
    window.addEventListener('DOMContentLoaded', createIframe, { once: true })
    return
  }

  createIframe()
}

if (
  process.env.__NEXT_REACT_DEVTOOLS &&
  process.env.NODE_ENV !== 'production' &&
  typeof window !== 'undefined'
) {
  initialize()
}
