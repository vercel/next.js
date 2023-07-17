/* global location */
import '../build/polyfills/polyfill-module'
// @ts-ignore react-dom/client exists when using React 18
import ReactDOMClient from 'react-dom/client'
import React, { use } from 'react'
// @ts-ignore
// eslint-disable-next-line import/no-extraneous-dependencies
import { createFromReadableStream } from 'react-server-dom-webpack/client'

import { HeadManagerContext } from '../shared/lib/head-manager-context'
import { GlobalLayoutRouterContext } from '../shared/lib/app-router-context'
import onRecoverableError from './on-recoverable-error'
import { callServer } from './app-call-server'
import { isNextRouterError } from './components/is-next-router-error'

// Since React doesn't call onerror for errors caught in error boundaries.
const origConsoleError = window.console.error
window.console.error = (...args) => {
  if (isNextRouterError(args[0])) {
    return
  }
  origConsoleError.apply(window.console, args)
}

window.addEventListener('error', (ev: WindowEventMap['error']): void => {
  if (isNextRouterError(ev.error)) {
    ev.preventDefault()
    return
  }
})

/// <reference types="react-dom/experimental" />

// Override chunk URL mapping in the webpack runtime
// https://github.com/webpack/webpack/blob/2738eebc7880835d88c727d364ad37f3ec557593/lib/RuntimeGlobals.js#L204

declare global {
  const __webpack_require__: any
}

const addChunkSuffix =
  (getOriginalChunk: (chunkId: any) => string) => (chunkId: any) => {
    return (
      getOriginalChunk(chunkId) +
      `${
        process.env.NEXT_DEPLOYMENT_ID
          ? `?dpl=${process.env.NEXT_DEPLOYMENT_ID}`
          : ''
      }`
    )
  }

// eslint-disable-next-line no-undef
const getChunkScriptFilename = __webpack_require__.u
const chunkFilenameMap: any = {}

// eslint-disable-next-line no-undef
__webpack_require__.u = addChunkSuffix((chunkId) =>
  encodeURI(chunkFilenameMap[chunkId] || getChunkScriptFilename(chunkId))
)

// eslint-disable-next-line no-undef
const getChunkCssFilename = __webpack_require__.k
// eslint-disable-next-line no-undef
__webpack_require__.k = addChunkSuffix(getChunkCssFilename)

// eslint-disable-next-line no-undef
const getMiniCssFilename = __webpack_require__.miniCssF
// eslint-disable-next-line no-undef
__webpack_require__.miniCssF = addChunkSuffix(getMiniCssFilename)

// @ts-ignore
// eslint-disable-next-line no-undef
if (process.turbopack) {
  // eslint-disable-next-line no-undef
  // @ts-expect-error TODO: fix type
  self.__next_require__ = __turbopack_require__

  // @ts-ignore
  // eslint-disable-next-line no-undef
  ;(self as any).__next_chunk_load__ = __turbopack_load__
} else {
  // Ignore the module ID transform in client.
  // eslint-disable-next-line no-undef
  // @ts-expect-error TODO: fix type
  self.__next_require__ =
    process.env.NODE_ENV !== 'production'
      ? (id: string) => {
          const mod = __webpack_require__(id)
          if (typeof mod === 'object') {
            // Return a proxy to flight client to make sure it's always getting
            // the latest module, instead of being cached.
            return new Proxy(mod, {
              get(_target, prop) {
                return __webpack_require__(id)[prop]
              },
            })
          }

          return mod
        }
      : __webpack_require__

  // eslint-disable-next-line no-undef
  ;(self as any).__next_chunk_load__ = (chunk: string) => {
    if (!chunk) return Promise.resolve()
    const [chunkId, chunkFilePath] = chunk.split(':')
    chunkFilenameMap[chunkId] = chunkFilePath

    // @ts-ignore
    // eslint-disable-next-line no-undef
    return __webpack_chunk_load__(chunkId)
  }
}

const appElement: HTMLElement | Document | null = document

const getCacheKey = () => {
  const { pathname, search } = location
  return pathname + search
}

const encoder = new TextEncoder()

let initialServerDataBuffer: string[] | undefined = undefined
let initialServerDataWriter: ReadableStreamDefaultController | undefined =
  undefined
let initialServerDataLoaded = false
let initialServerDataFlushed = false

function nextServerDataCallback(
  seg: [isBootStrap: 0] | [isNotBootstrap: 1, responsePartial: string]
): void {
  if (seg[0] === 0) {
    initialServerDataBuffer = []
  } else {
    if (!initialServerDataBuffer)
      throw new Error('Unexpected server data: missing bootstrap script.')

    if (initialServerDataWriter) {
      initialServerDataWriter.enqueue(encoder.encode(seg[1]))
    } else {
      initialServerDataBuffer.push(seg[1])
    }
  }
}

// There might be race conditions between `nextServerDataRegisterWriter` and
// `DOMContentLoaded`. The former will be called when React starts to hydrate
// the root, the latter will be called when the DOM is fully loaded.
// For streaming, the former is called first due to partial hydration.
// For non-streaming, the latter can be called first.
// Hence, we use two variables `initialServerDataLoaded` and
// `initialServerDataFlushed` to make sure the writer will be closed and
// `initialServerDataBuffer` will be cleared in the right time.
function nextServerDataRegisterWriter(ctr: ReadableStreamDefaultController) {
  if (initialServerDataBuffer) {
    initialServerDataBuffer.forEach((val) => {
      ctr.enqueue(encoder.encode(val))
    })
    if (initialServerDataLoaded && !initialServerDataFlushed) {
      ctr.close()
      initialServerDataFlushed = true
      initialServerDataBuffer = undefined
    }
  }

  initialServerDataWriter = ctr
}

// When `DOMContentLoaded`, we can close all pending writers to finish hydration.
const DOMContentLoaded = function () {
  if (initialServerDataWriter && !initialServerDataFlushed) {
    initialServerDataWriter.close()
    initialServerDataFlushed = true
    initialServerDataBuffer = undefined
  }
  initialServerDataLoaded = true
}
// It's possible that the DOM is already loaded.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', DOMContentLoaded, false)
} else {
  DOMContentLoaded()
}

const nextServerDataLoadingGlobal = ((self as any).__next_f =
  (self as any).__next_f || [])
nextServerDataLoadingGlobal.forEach(nextServerDataCallback)
nextServerDataLoadingGlobal.push = nextServerDataCallback

function createResponseCache() {
  return new Map<string, any>()
}
const rscCache = createResponseCache()

function useInitialServerResponse(cacheKey: string): Promise<JSX.Element> {
  const response = rscCache.get(cacheKey)
  if (response) return response

  const readable = new ReadableStream({
    start(controller) {
      nextServerDataRegisterWriter(controller)
    },
  })

  const newResponse = createFromReadableStream(readable, {
    callServer,
  })

  rscCache.set(cacheKey, newResponse)
  return newResponse
}

function ServerRoot({ cacheKey }: { cacheKey: string }): JSX.Element {
  React.useEffect(() => {
    rscCache.delete(cacheKey)
  })
  const response = useInitialServerResponse(cacheKey)
  const root = use(response)
  return root
}

const StrictModeIfEnabled = process.env.__NEXT_STRICT_MODE_APP
  ? React.StrictMode
  : React.Fragment

function Root({ children }: React.PropsWithChildren<{}>): React.ReactElement {
  if (process.env.__NEXT_ANALYTICS_ID) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    React.useEffect(() => {
      require('./performance-relayer-app')()
    }, [])
  }

  if (process.env.__NEXT_TEST_MODE) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    React.useEffect(() => {
      window.__NEXT_HYDRATED = true

      if (window.__NEXT_HYDRATED_CB) {
        window.__NEXT_HYDRATED_CB()
      }
    }, [])
  }

  return children as React.ReactElement
}

function RSCComponent(props: any): JSX.Element {
  return <ServerRoot {...props} cacheKey={getCacheKey()} />
}

export function hydrate() {
  if (process.env.NODE_ENV !== 'production') {
    const rootLayoutMissingTagsError = (self as any)
      .__next_root_layout_missing_tags_error
    const HotReload: typeof import('./components/react-dev-overlay/hot-reloader-client').default =
      require('./components/react-dev-overlay/hot-reloader-client')
        .default as typeof import('./components/react-dev-overlay/hot-reloader-client').default

    // Don't try to hydrate if root layout is missing required tags, render error instead
    if (rootLayoutMissingTagsError) {
      const reactRootElement = document.createElement('div')
      document.body.appendChild(reactRootElement)
      const reactRoot = (ReactDOMClient as any).createRoot(reactRootElement, {
        onRecoverableError,
      })

      reactRoot.render(
        <GlobalLayoutRouterContext.Provider
          value={{
            buildId: 'development',
            tree: rootLayoutMissingTagsError.tree,
            changeByServerResponse: () => {},
            focusAndScrollRef: {
              apply: false,
              hashFragment: null,
              segmentPaths: [],
            },
            nextUrl: null,
          }}
        >
          <HotReload
            assetPrefix={rootLayoutMissingTagsError.assetPrefix}
            // initialState={{
            //   rootLayoutMissingTagsError: {
            //     missingTags: rootLayoutMissingTagsError.missingTags,
            //   },
            // }}
          />
        </GlobalLayoutRouterContext.Provider>
      )

      return
    }
  }

  const reactEl = (
    <StrictModeIfEnabled>
      <HeadManagerContext.Provider
        value={{
          appDir: true,
        }}
      >
        <Root>
          <RSCComponent />
        </Root>
      </HeadManagerContext.Provider>
    </StrictModeIfEnabled>
  )

  const options = {
    onRecoverableError,
  }
  const isError = document.documentElement.id === '__next_error__'

  if (process.env.NODE_ENV !== 'production') {
    // Patch console.error to collect information about hydration errors
    const patchConsoleError =
      require('./components/react-dev-overlay/internal/helpers/hydration-error-info')
        .patchConsoleError as typeof import('./components/react-dev-overlay/internal/helpers/hydration-error-info').patchConsoleError
    if (!isError) {
      patchConsoleError()
    }
  }

  if (isError) {
    ReactDOMClient.createRoot(appElement as any, options).render(reactEl)
  } else {
    React.startTransition(() =>
      (ReactDOMClient as any).hydrateRoot(appElement, reactEl, options)
    )
  }

  // TODO-APP: Remove this logic when Float has GC built-in in development.
  if (process.env.NODE_ENV !== 'production') {
    const { linkGc } =
      require('./app-link-gc') as typeof import('./app-link-gc')
    linkGc()
  }
}
