/**
 * Before starting the Next.js runtime and requiring any module, we need to make
 * sure the following scripts are executed in the correct order:
 * - Polyfills
 * - next/script with `beforeInteractive` strategy
 */

import { getAssetPrefix } from './asset-prefix'
import { setAttributesFromProps } from './set-attributes-from-props'

const version = process.env.__NEXT_VERSION

window.next = {
  version,
  appDir: true,
}

function loadScriptsInSequence(
  scripts: [src: string, props: { [prop: string]: any }][],
  hydrate: () => void
) {
  if (!scripts || !scripts.length) {
    return hydrate()
  }

  return scripts
    .reduce((promise, [src, props]) => {
      return promise.then(() => {
        return new Promise<void>((resolve, reject) => {
          const el = document.createElement('script')

          if (props) {
            setAttributesFromProps(el, props)
          }

          if (src) {
            el.src = src
            el.onload = () => resolve()
            el.onerror = reject
          } else if (props) {
            el.innerHTML = props.children
            setTimeout(resolve)
          }

          document.head.appendChild(el)
        })
      })
    }, Promise.resolve())
    .catch((err: Error) => {
      console.error(err)
      // Still try to hydrate even if there's an error.
    })
    .then(() => {
      hydrate()
    })
}

export function appBootstrap(hydrate: (assetPrefix: string) => void) {
  const assetPrefix = getAssetPrefix()

  loadScriptsInSequence((self as any).__next_s, () => {
    // If the static shell is being debugged, skip hydration if the
    // `__nextppronly` query is present. This is only enabled when the
    // environment variable `__NEXT_EXPERIMENTAL_STATIC_SHELL_DEBUGGING` is
    // set to `1`. Otherwise the following is optimized out.
    if (process.env.__NEXT_EXPERIMENTAL_STATIC_SHELL_DEBUGGING === '1') {
      const search = new URLSearchParams(window.location.search)
      if (
        search.get('__nextppronly') === 'fallback' ||
        search.get('__nextppronly') === '1'
      ) {
        console.warn(
          `Skipping hydration due to __nextppronly=${search.get('__nextppronly')}`
        )
        return
      }
    }

    // Instant Navigation Testing: When the cookie is set, set up a
    // CookieStore listener that auto-reloads when the cookie is cleared.
    // This is shared infrastructure for both the dev tools toggle and
    // external test frameworks.
    if (process.env.__NEXT_EXPOSE_TESTING_API) {
      const NEXT_INSTANT_TEST_COOKIE = 'next-instant-navigation-testing'
      if (
        document.cookie.includes(NEXT_INSTANT_TEST_COOKIE + '=') &&
        typeof cookieStore !== 'undefined'
      ) {
        cookieStore.addEventListener('change', (event: CookieChangeEvent) => {
          for (const cookie of event.deleted) {
            if (cookie.name === NEXT_INSTANT_TEST_COOKIE) {
              window.location.reload()
              return
            }
          }
        })
      } else if (self.__next_instant_test) {
        // The server returned a static shell but we couldn't set up the
        // cookie listener (document.cookie is empty or cookieStore is
        // unavailable). Reload immediately to get the full response.
        window.location.reload()
      }
    }

    hydrate(assetPrefix)
  })
}
