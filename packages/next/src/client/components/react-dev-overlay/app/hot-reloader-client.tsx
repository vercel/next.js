/// <reference types="webpack/module.d.ts" />

import type { ReactNode } from 'react'
import { useCallback, useEffect, startTransition, useMemo, useRef } from 'react'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import formatWebpackMessages from '../utils/format-webpack-messages'
import { useRouter } from '../../navigation'
import {
  ACTION_BEFORE_REFRESH,
  ACTION_BUILD_ERROR,
  ACTION_BUILD_OK,
  ACTION_DEBUG_INFO,
  ACTION_DEV_INDICATOR,
  ACTION_REFRESH,
  ACTION_STATIC_INDICATOR,
  ACTION_UNHANDLED_ERROR,
  ACTION_UNHANDLED_REJECTION,
  ACTION_VERSION_INFO,
  REACT_REFRESH_FULL_RELOAD,
  reportInvalidHmrMessage,
  useErrorOverlayReducer,
} from '../shared'
import { parseStack } from '../utils/parse-stack'
import { AppDevOverlay } from './app-dev-overlay'
import { useErrorHandler } from '../../errors/use-error-handler'
import { RuntimeErrorHandler } from '../../errors/runtime-error-handler'
import {
  useSendMessage,
  useTurbopack,
  useWebsocket,
  useWebsocketPing,
} from '../utils/use-websocket'
import { parseComponentStack } from '../utils/parse-component-stack'
import type { VersionInfo } from '../../../../server/dev/parse-version-info'
import { HMR_ACTIONS_SENT_TO_BROWSER } from '../../../../server/dev/hot-reloader-types'
import type {
  HMR_ACTION_TYPES,
  TurbopackMsgToBrowser,
} from '../../../../server/dev/hot-reloader-types'
import { REACT_REFRESH_FULL_RELOAD_FROM_ERROR } from '../shared'
import type { HydrationErrorState } from '../../errors/hydration-error-info'
import type { DebugInfo } from '../types'
import { useUntrackedPathname } from '../../navigation-untracked'
import { getReactStitchedError } from '../../errors/stitched-error'
import { handleDevBuildIndicatorHmrEvents } from '../../../dev/dev-build-indicator/internal/handle-dev-build-indicator-hmr-events'
import type { GlobalErrorComponent } from '../../error-boundary'
import type { DevIndicatorServerState } from '../../../../server/dev/dev-indicator-server-state'
import reportHmrLatency from '../utils/report-hmr-latency'
import { TurbopackHmr } from '../utils/turbopack-hot-reloader-common'

export interface Dispatcher {
  onBuildOk(): void
  onBuildError(message: string): void
  onVersionInfo(versionInfo: VersionInfo): void
  onDebugInfo(debugInfo: DebugInfo): void
  onBeforeRefresh(): void
  onRefresh(): void
  onStaticIndicator(status: boolean): void
  onDevIndicator(devIndicator: DevIndicatorServerState): void
}

let mostRecentCompilationHash: any = null
let __nextDevClientId = Math.round(Math.random() * 100 + Date.now())
let reloading = false
let webpackStartMsSinceEpoch: number | null = null
const turbopackHmr: TurbopackHmr | null = process.env.TURBOPACK
  ? new TurbopackHmr()
  : null

let pendingHotUpdateWebpack = Promise.resolve()
let resolvePendingHotUpdateWebpack: () => void = () => {}
function setPendingHotUpdateWebpack() {
  pendingHotUpdateWebpack = new Promise((resolve) => {
    resolvePendingHotUpdateWebpack = () => {
      resolve()
    }
  })
}

export function waitForWebpackRuntimeHotUpdate() {
  return pendingHotUpdateWebpack
}

// There is a newer version of the code available.
function handleAvailableHash(hash: string) {
  // Update last known compilation hash.
  mostRecentCompilationHash = hash
}

/**
 * Is there a newer version of this code available?
 * For webpack: Check if the hash changed compared to __webpack_hash__
 * For Turbopack: Always true because it doesn't have __webpack_hash__
 */
function isUpdateAvailable() {
  if (process.env.TURBOPACK) {
    return true
  }

  /* globals __webpack_hash__ */
  // __webpack_hash__ is the hash of the current compilation.
  // It's a global variable injected by Webpack.
  return mostRecentCompilationHash !== __webpack_hash__
}

// Webpack disallows updates in other states.
function canApplyUpdates() {
  return module.hot.status() === 'idle'
}
function afterApplyUpdates(fn: any) {
  if (canApplyUpdates()) {
    fn()
  } else {
    function handler(status: any) {
      if (status === 'idle') {
        module.hot.removeStatusHandler(handler)
        fn()
      }
    }
    module.hot.addStatusHandler(handler)
  }
}

function performFullReload(err: any, sendMessage: any) {
  const stackTrace =
    err &&
    ((err.stack && err.stack.split('\n').slice(0, 5).join('\n')) ||
      err.message ||
      err + '')

  sendMessage(
    JSON.stringify({
      event: 'client-full-reload',
      stackTrace,
      hadRuntimeError: !!RuntimeErrorHandler.hadRuntimeError,
      dependencyChain: err ? err.dependencyChain : undefined,
    })
  )

  if (reloading) return
  reloading = true
  window.location.reload()
}

// Attempt to update code on the fly, fall back to a hard reload.
function tryApplyUpdatesWebpack(
  sendMessage: (message: string) => void,
  dispatcher: Dispatcher
) {
  if (!isUpdateAvailable() || !canApplyUpdates()) {
    resolvePendingHotUpdateWebpack()
    dispatcher.onBuildOk()
    reportHmrLatency(sendMessage, [], webpackStartMsSinceEpoch!, Date.now())
    return
  }

  function handleApplyUpdates(
    err: any,
    updatedModules: (string | number)[] | null
  ) {
    if (err || RuntimeErrorHandler.hadRuntimeError || updatedModules == null) {
      if (err) {
        console.warn(REACT_REFRESH_FULL_RELOAD)
      } else if (RuntimeErrorHandler.hadRuntimeError) {
        console.warn(REACT_REFRESH_FULL_RELOAD_FROM_ERROR)
      }
      performFullReload(err, sendMessage)
      return
    }

    dispatcher.onBuildOk()

    if (isUpdateAvailable()) {
      // While we were updating, there was a new update! Do it again.
      tryApplyUpdatesWebpack(sendMessage, dispatcher)
      return
    }

    dispatcher.onRefresh()
    resolvePendingHotUpdateWebpack()
    reportHmrLatency(
      sendMessage,
      updatedModules,
      webpackStartMsSinceEpoch!,
      Date.now()
    )

    if (process.env.__NEXT_TEST_MODE) {
      afterApplyUpdates(() => {
        if (self.__NEXT_HMR_CB) {
          self.__NEXT_HMR_CB()
          self.__NEXT_HMR_CB = null
        }
      })
    }
  }

  // https://webpack.js.org/api/hot-module-replacement/#check
  module.hot
    .check(/* autoApply */ false)
    .then((updatedModules: (string | number)[] | null) => {
      if (updatedModules == null) {
        return null
      }

      // We should always handle an update, even if updatedModules is empty (but
      // non-null) for any reason. That's what webpack would normally do:
      // https://github.com/webpack/webpack/blob/3aa6b6bc3a64/lib/hmr/HotModuleReplacement.runtime.js#L296-L298
      dispatcher.onBeforeRefresh()
      // https://webpack.js.org/api/hot-module-replacement/#apply
      return module.hot.apply()
    })
    .then(
      (updatedModules: (string | number)[] | null) => {
        handleApplyUpdates(null, updatedModules)
      },
      (err: any) => {
        handleApplyUpdates(err, null)
      }
    )
}

/** Handles messages from the server for the App Router. */
function processMessage(
  obj: HMR_ACTION_TYPES,
  sendMessage: (message: string) => void,
  processTurbopackMessage: (msg: TurbopackMsgToBrowser) => void,
  router: ReturnType<typeof useRouter>,
  dispatcher: Dispatcher,
  appIsrManifestRef: ReturnType<typeof useRef>,
  pathnameRef: ReturnType<typeof useRef>
) {
  if (!('action' in obj)) {
    return
  }

  function handleErrors(errors: ReadonlyArray<unknown>) {
    // "Massage" webpack messages.
    const formatted = formatWebpackMessages({
      errors: errors,
      warnings: [],
    })

    // Only show the first error.
    dispatcher.onBuildError(formatted.errors[0])

    // Also log them to the console.
    for (let i = 0; i < formatted.errors.length; i++) {
      console.error(stripAnsi(formatted.errors[i]))
    }

    // Do not attempt to reload now.
    // We will reload on next success instead.
    if (process.env.__NEXT_TEST_MODE) {
      if (self.__NEXT_HMR_CB) {
        self.__NEXT_HMR_CB(formatted.errors[0])
        self.__NEXT_HMR_CB = null
      }
    }
  }

  function handleHotUpdate() {
    if (process.env.TURBOPACK) {
      const hmrUpdate = turbopackHmr!.onBuilt()
      if (hmrUpdate != null) {
        reportHmrLatency(
          sendMessage,
          [...hmrUpdate.updatedModules],
          hmrUpdate.startMsSinceEpoch,
          hmrUpdate.endMsSinceEpoch
        )
      }
      dispatcher.onBuildOk()
    } else {
      tryApplyUpdatesWebpack(sendMessage, dispatcher)
    }
  }

  switch (obj.action) {
    case HMR_ACTIONS_SENT_TO_BROWSER.ISR_MANIFEST: {
      if (process.env.__NEXT_DEV_INDICATOR) {
        if (appIsrManifestRef) {
          appIsrManifestRef.current = obj.data

          // handle initial status on receiving manifest
          // navigation is handled in useEffect for pathname changes
          // as we'll receive the updated manifest before usePathname
          // triggers for new value
          if ((pathnameRef.current as string) in obj.data) {
            dispatcher.onStaticIndicator(true)
          } else {
            dispatcher.onStaticIndicator(false)
          }
        }
      }
      break
    }
    case HMR_ACTIONS_SENT_TO_BROWSER.BUILDING: {
      if (process.env.TURBOPACK) {
        turbopackHmr!.onBuilding()
      } else {
        webpackStartMsSinceEpoch = Date.now()
        setPendingHotUpdateWebpack()
      }
      console.log('[Fast Refresh] rebuilding')
      break
    }
    case HMR_ACTIONS_SENT_TO_BROWSER.BUILT:
    case HMR_ACTIONS_SENT_TO_BROWSER.SYNC: {
      if (obj.hash) {
        handleAvailableHash(obj.hash)
      }

      const { errors, warnings } = obj

      // Is undefined when it's a 'built' event
      if ('versionInfo' in obj) dispatcher.onVersionInfo(obj.versionInfo)
      if ('debug' in obj && obj.debug) dispatcher.onDebugInfo(obj.debug)
      if ('devIndicator' in obj) dispatcher.onDevIndicator(obj.devIndicator)

      const hasErrors = Boolean(errors && errors.length)
      // Compilation with errors (e.g. syntax error or missing modules).
      if (hasErrors) {
        sendMessage(
          JSON.stringify({
            event: 'client-error',
            errorCount: errors.length,
            clientId: __nextDevClientId,
          })
        )

        handleErrors(errors)
        return
      }

      const hasWarnings = Boolean(warnings && warnings.length)
      if (hasWarnings) {
        sendMessage(
          JSON.stringify({
            event: 'client-warning',
            warningCount: warnings.length,
            clientId: __nextDevClientId,
          })
        )

        // Print warnings to the console.
        const formattedMessages = formatWebpackMessages({
          warnings: warnings,
          errors: [],
        })

        for (let i = 0; i < formattedMessages.warnings.length; i++) {
          if (i === 5) {
            console.warn(
              'There were more warnings in other files.\n' +
                'You can find a complete log in the terminal.'
            )
            break
          }
          console.warn(stripAnsi(formattedMessages.warnings[i]))
        }

        // No early return here as we need to apply modules in the same way between warnings only and compiles without warnings
      }

      sendMessage(
        JSON.stringify({
          event: 'client-success',
          clientId: __nextDevClientId,
        })
      )

      if (obj.action === HMR_ACTIONS_SENT_TO_BROWSER.BUILT) {
        handleHotUpdate()
      }
      return
    }
    case HMR_ACTIONS_SENT_TO_BROWSER.TURBOPACK_CONNECTED: {
      processTurbopackMessage({
        type: HMR_ACTIONS_SENT_TO_BROWSER.TURBOPACK_CONNECTED,
        data: {
          sessionId: obj.data.sessionId,
        },
      })
      break
    }
    case HMR_ACTIONS_SENT_TO_BROWSER.TURBOPACK_MESSAGE: {
      dispatcher.onBeforeRefresh()
      processTurbopackMessage({
        type: HMR_ACTIONS_SENT_TO_BROWSER.TURBOPACK_MESSAGE,
        data: obj.data,
      })
      dispatcher.onRefresh()
      if (RuntimeErrorHandler.hadRuntimeError) {
        console.warn(REACT_REFRESH_FULL_RELOAD_FROM_ERROR)
        performFullReload(null, sendMessage)
      }
      turbopackHmr!.onTurbopackMessage(obj)
      break
    }
    // TODO-APP: make server component change more granular
    case HMR_ACTIONS_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES: {
      sendMessage(
        JSON.stringify({
          event: 'server-component-reload-page',
          clientId: __nextDevClientId,
          hash: obj.hash,
        })
      )

      // Store the latest hash in a session cookie so that it's sent back to the
      // server with any subsequent requests.
      document.cookie = `__next_hmr_refresh_hash__=${obj.hash}`

      if (RuntimeErrorHandler.hadRuntimeError) {
        if (reloading) return
        reloading = true
        return window.location.reload()
      }

      startTransition(() => {
        router.hmrRefresh()
        dispatcher.onRefresh()
      })

      if (process.env.__NEXT_TEST_MODE) {
        if (self.__NEXT_HMR_CB) {
          self.__NEXT_HMR_CB()
          self.__NEXT_HMR_CB = null
        }
      }

      return
    }
    case HMR_ACTIONS_SENT_TO_BROWSER.RELOAD_PAGE: {
      sendMessage(
        JSON.stringify({
          event: 'client-reload-page',
          clientId: __nextDevClientId,
        })
      )
      if (reloading) return
      reloading = true
      return window.location.reload()
    }
    case HMR_ACTIONS_SENT_TO_BROWSER.ADDED_PAGE:
    case HMR_ACTIONS_SENT_TO_BROWSER.REMOVED_PAGE: {
      // TODO-APP: potentially only refresh if the currently viewed page was added/removed.
      return router.hmrRefresh()
    }
    case HMR_ACTIONS_SENT_TO_BROWSER.SERVER_ERROR: {
      const { errorJSON } = obj
      if (errorJSON) {
        const { message, stack } = JSON.parse(errorJSON)
        const error = new Error(message)
        error.stack = stack
        handleErrors([error])
      }
      return
    }
    case HMR_ACTIONS_SENT_TO_BROWSER.DEV_PAGES_MANIFEST_UPDATE: {
      return
    }
    default: {
    }
  }
}

export default function HotReload({
  assetPrefix,
  children,
  globalError,
}: {
  assetPrefix: string
  children: ReactNode
  globalError: [GlobalErrorComponent, React.ReactNode]
}) {
  const [state, dispatch] = useErrorOverlayReducer('app')

  const dispatcher = useMemo<Dispatcher>(() => {
    return {
      onBuildOk() {
        dispatch({ type: ACTION_BUILD_OK })
      },
      onBuildError(message) {
        dispatch({ type: ACTION_BUILD_ERROR, message })
      },
      onBeforeRefresh() {
        dispatch({ type: ACTION_BEFORE_REFRESH })
      },
      onRefresh() {
        dispatch({ type: ACTION_REFRESH })
      },
      onVersionInfo(versionInfo) {
        dispatch({ type: ACTION_VERSION_INFO, versionInfo })
      },
      onStaticIndicator(status: boolean) {
        dispatch({ type: ACTION_STATIC_INDICATOR, staticIndicator: status })
      },
      onDebugInfo(debugInfo) {
        dispatch({ type: ACTION_DEBUG_INFO, debugInfo })
      },
      onDevIndicator(devIndicator) {
        dispatch({
          type: ACTION_DEV_INDICATOR,
          devIndicator,
        })
      },
    }
  }, [dispatch])

  const handleOnUnhandledError = useCallback(
    (error: Error): void => {
      const errorDetails = (error as any).details as
        | HydrationErrorState
        | undefined
      // Component stack is added to the error in use-error-handler in case there was a hydration error
      const componentStackTrace =
        (error as any)._componentStack || errorDetails?.componentStack
      const warning = errorDetails?.warning

      dispatch({
        type: ACTION_UNHANDLED_ERROR,
        reason: error,
        frames: parseStack(error.stack || ''),
        componentStackFrames:
          typeof componentStackTrace === 'string'
            ? parseComponentStack(componentStackTrace)
            : undefined,
        warning,
      })
    },
    [dispatch]
  )

  const handleOnUnhandledRejection = useCallback(
    (reason: Error): void => {
      const stitchedError = getReactStitchedError(reason)
      dispatch({
        type: ACTION_UNHANDLED_REJECTION,
        reason: stitchedError,
        frames: parseStack(stitchedError.stack || ''),
      })
    },
    [dispatch]
  )
  useErrorHandler(handleOnUnhandledError, handleOnUnhandledRejection)

  const webSocketRef = useWebsocket(assetPrefix)
  useWebsocketPing(webSocketRef)
  const sendMessage = useSendMessage(webSocketRef)
  const processTurbopackMessage = useTurbopack(sendMessage, (err) =>
    performFullReload(err, sendMessage)
  )

  const router = useRouter()

  // We don't want access of the pathname for the dev tools to trigger a dynamic
  // access (as the dev overlay will never be present in production).
  const pathname = useUntrackedPathname()
  const appIsrManifestRef = useRef<Record<string, false | number>>({})
  const pathnameRef = useRef(pathname)

  if (process.env.__NEXT_DEV_INDICATOR) {
    // this conditional is only for dead-code elimination which
    // isn't a runtime conditional only build-time so ignore hooks rule
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      pathnameRef.current = pathname

      const appIsrManifest = appIsrManifestRef.current

      if (appIsrManifest) {
        if (pathname && pathname in appIsrManifest) {
          try {
            dispatcher.onStaticIndicator(true)
          } catch (reason) {
            let message = ''

            if (reason instanceof DOMException) {
              // Most likely a SecurityError, because of an unavailable localStorage
              message = reason.stack ?? reason.message
            } else if (reason instanceof Error) {
              message = 'Error: ' + reason.message + '\n' + (reason.stack ?? '')
            } else {
              message = 'Unexpected Exception: ' + reason
            }

            console.warn('[HMR] ' + message)
          }
        } else {
          dispatcher.onStaticIndicator(false)
        }
      }
    }, [pathname, dispatcher])
  }

  useEffect(() => {
    const websocket = webSocketRef.current
    if (!websocket) return

    const handler = (event: MessageEvent<any>) => {
      try {
        const obj = JSON.parse(event.data)
        handleDevBuildIndicatorHmrEvents(obj)
        processMessage(
          obj,
          sendMessage,
          processTurbopackMessage,
          router,
          dispatcher,
          appIsrManifestRef,
          pathnameRef
        )
      } catch (err: unknown) {
        reportInvalidHmrMessage(event, err)
      }
    }

    websocket.addEventListener('message', handler)
    return () => websocket.removeEventListener('message', handler)
  }, [
    sendMessage,
    router,
    webSocketRef,
    dispatcher,
    processTurbopackMessage,
    appIsrManifestRef,
  ])

  return (
    <AppDevOverlay state={state} globalError={globalError}>
      {children}
    </AppDevOverlay>
  )
}
