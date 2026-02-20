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

    // Instant Navigation Testing API: If the server returned a partial static
    // shell (indicated by the __next_instant_test global injected into the
    // HTML), skip hydration. The response doesn't include the full Flight data
    // stream. When the test framework deletes the cookie, the CookieStore
    // change event triggers a page reload.
    if (process.env.__NEXT_EXPOSE_TESTING_API) {
      if (self.__next_instant_test) {
        const NEXT_INSTANT_TEST_COOKIE = 'next-instant-navigation-testing'
        if (
          typeof cookieStore !== 'undefined' &&
          document.cookie.includes(NEXT_INSTANT_TEST_COOKIE + '=')
        ) {
          // Cookie is still set. Wait for the test framework to delete it,
          // then reload to get the full response.
          cookieStore.addEventListener('change', (event: CookieChangeEvent) => {
            for (const cookie of event.deleted) {
              if (cookie.name === NEXT_INSTANT_TEST_COOKIE) {
                window.location.reload()
                return
              }
            }
          })
        } else {
          // Cookie is already gone (or not accessible). Refresh immediately
          // to get the full response.
          window.location.reload()
        }
        return
      }
    }

    hydrate(assetPrefix)
  })
}
