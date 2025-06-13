import * as React from 'react'
import { createPortal } from 'react-dom'
import { STORAGE_KEY_THEME } from '../shared'

// @ts-expect-error - CSS file missing type declaration
import tailwindCss from '../tailwind.css'

export function ShadowPortal({ children }: { children: React.ReactNode }) {
  let portalNode = React.useRef<HTMLElement | null>(null)
  let shadowNode = React.useRef<ShadowRoot | null>(null)
  let [, forceUpdate] = React.useState<{} | undefined>()

  // Don't use useLayoutEffect here, as it will cause warnings during SSR in React 18.
  // Don't use useSyncExternalStore as an SSR gate unless you verified it doesn't
  // downgrade a Transition of the initial root render to a sync render or
  // we can assure the root render is not a Transition.
  React.useEffect(() => {
    const ownerDocument = document
    portalNode.current = ownerDocument.querySelector('nextjs-portal')!
    // load default color preference from localstorage
    if (typeof localStorage !== 'undefined') {
      const theme = localStorage.getItem(STORAGE_KEY_THEME)
      if (theme === 'dark') {
        portalNode.current.classList.add('dark')
        portalNode.current.classList.remove('light')
      } else if (theme === 'light') {
        portalNode.current.classList.remove('dark')
        portalNode.current.classList.add('light')
      }
    }

    // We can only attach but never detach a shadow root.
    // So if this is a remount, we don't need to attach a shadow root. Only
    // on the very first, DOM-wide mount.
    // This is mostly guarding against faulty _app implementations that
    // createa React Root in getInitialProps but don't clean it up like test/integration/app-tree/pages/_app.tsx
    if (portalNode.current.shadowRoot === null) {
      shadowNode.current = portalNode.current.attachShadow({ mode: 'open' })

      // Storybook injects the Tailwind style tag from .storybook/main.ts on each full load.
      // When navigating to a different story, the injected style tag is removed within the iframe.
      // To re-inject the style tag, we need to call `unuse()` since the `use()` function only runs
      // once unless unused.
      if (process.env.STORYBOOK) {
        tailwindCss.unuse()
      }

      // Injecting Tailwind to the Shadow DOM with Webpack style-loader.
      // The target is passed to the next-devtools-inject-tailwind.js file which runs on the browser.
      // x-ref: https://webpack.js.org/loaders/style-loader/#lazystyletag
      tailwindCss.use({
        target: shadowNode.current,
      })
    }
    forceUpdate({})
  }, [])

  return shadowNode.current
    ? createPortal(children, shadowNode.current as any)
    : null
}
