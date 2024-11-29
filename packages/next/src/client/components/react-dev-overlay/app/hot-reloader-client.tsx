import type { ReactNode } from 'react'
import { useCallback, useEffect, startTransition, useMemo, useRef } from 'react'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import formatWebpackMessages from '../internal/helpers/format-webpack-messages'
import { useRouter } from '../../navigation'
import {
  ACTION_AFTER_ERROR,
  ACTION_BEFORE_REFRESH,
  ACTION_BUILD_ERROR,
  ACTION_BUILD_OK,
  ACTION_DEBUG_INFO,
  ACTION_REFRESH,
  ACTION_STATIC_INDICATOR,
  ACTION_UNHANDLED_ERROR,
  ACTION_UNHANDLED_REJECTION,
  ACTION_VERSION_INFO,
  useErrorOverlayReducer,
} from '../shared'
import { parseStack } from '../internal/helpers/parse-stack'
import ReactDevOverlay from './ReactDevOverlay'
import { useErrorHandler } from '../internal/helpers/use-error-handler'
import { RuntimeErrorHandler } from '../internal/helpers/runtime-error-handler'
import {
  useSendMessage,
  useTurbopack,
  useWebsocket,
  useWebsocketPing,
} from '../internal/helpers/use-websocket'
import { parseComponentStack } from '../internal/helpers/parse-component-stack'
import type { VersionInfo } from '../../../../server/dev/parse-version-info'
import { HMR_ACTIONS_SENT_TO_BROWSER } from '../../../../server/dev/hot-reloader-types'
import type {
  HMR_ACTION_TYPES,
  TurbopackMsgToBrowser,
} from '../../../../server/dev/hot-reloader-types'
import { extractModulesFromTurbopackMessage } from '../../../../server/dev/extract-modules-from-turbopack-message'
import { REACT_REFRESH_FULL_RELOAD_FROM_ERROR } from '../shared'
import type { HydrationErrorState } from '../internal/helpers/hydration-error-info'
import type { DebugInfo } from '../types'
import { useUntrackedPathname } from '../../navigation-untracked'
import { getReactStitchedError } from '../internal/helpers/stitched-error'
import { decorateServerError } from '../../../../shared/lib/error-source'

export interface Dispatcher {
  onBuildOk(): void
  onBuildError(message: string): void
  onAfterError(error: Error): void
  onVersionInfo(versionInfo: VersionInfo): void
  onDebugInfo(debugInfo: DebugInfo): void
  onBeforeRefresh(): void
  onRefresh(): void
  onStaticIndicator(status: boolean): void
}

let mostRecentCompilationHash: any = null
let __nextDevClientId = Math.round(Math.random() * 100 + Date.now())
let reloading = false
let startLatency: number | null = null

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

function handleBeforeHotUpdateWebpack(
  dispatcher: Dispatcher,
  hasUpdates: boolean
) {
  if (hasUpdates) {
    dispatcher.onBeforeRefresh()
  }
}

function handleSuccessfulHotUpdateWebpack(
  dispatcher: Dispatcher,
  sendMessage: (message: string) => void,
  updatedModules: ReadonlyArray<string>
) {
  resolvePendingHotUpdateWebpack()
  dispatcher.onBuildOk()
  reportHmrLatency(sendMessage, updatedModules)

  dispatcher.onRefresh()
}

function reportHmrLatency(
  sendMessage: (message: string) => void,
  updatedModules: ReadonlyArray<string>
) {
  if (!startLatency) return
  let endLatency = Date.now()
  const latency = endLatency - startLatency
  console.log(`[Fast Refresh] done in ${latency}ms`)
  sendMessage(
    JSON.stringify({
      event: 'client-hmr-latency',
      id: window.__nextDevClientId,
      startTime: startLatency,
      endTime: endLatency,
      page: window.location.pathname,
      updatedModules,
      // Whether the page (tab) was hidden at the time the event occurred.
      // This can impact the accuracy of the event's timing.
      isPageHidden: document.visibilityState === 'hidden',
    })
  )
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
  // @ts-expect-error module.hot exists
  return module.hot.status() === 'idle'
}
function afterApplyUpdates(fn: any) {
  if (canApplyUpdates()) {
    fn()
  } else {
    function handler(status: any) {
      if (status === 'idle') {
        // @ts-expect-error module.hot exists
        module.hot.removeStatusHandler(handler)
        fn()
      }
    }
    // @ts-expect-error module.hot exists
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
function tryApplyUpdates(
  onBeforeUpdate: (hasUpdates: boolean) => void,
  onHotUpdateSuccess: (updatedModules: string[]) => void,
  sendMessage: any,
  dispatcher: Dispatcher
) {
  if (!isUpdateAvailable() || !canApplyUpdates()) {
    resolvePendingHotUpdateWebpack()
    dispatcher.onBuildOk()
    reportHmrLatency(sendMessage, [])
    return
  }

  function handleApplyUpdates(err: any, updatedModules: string[] | null) {
    if (err || RuntimeErrorHandler.hadRuntimeError || !updatedModules) {
      if (err) {
        console.warn(
          '[Fast Refresh] performing full reload\n\n' +
            "Fast Refresh will perform a full reload when you edit a file that's imported by modules outside of the React rendering tree.\n" +
            'You might have a file which exports a React component but also exports a value that is imported by a non-React component file.\n' +
            'Consider migrating the non-React component export to a separate file and importing it into both files.\n\n' +
            'It is also possible the parent component of the component you edited is a class component, which disables Fast Refresh.\n' +
            'Fast Refresh requires at least one parent function component in your React tree.'
        )
      } else if (RuntimeErrorHandler.hadRuntimeError) {
        console.warn(REACT_REFRESH_FULL_RELOAD_FROM_ERROR)
      }
      performFullReload(err, sendMessage)
      return
    }

    const hasUpdates = Boolean(updatedModules.length)
    if (typeof onHotUpdateSuccess === 'function') {
      // Maybe we want to do something.
      onHotUpdateSuccess(updatedModules)
    }

    if (isUpdateAvailable()) {
      // While we were updating, there was a new update! Do it again.
      tryApplyUpdates(
        hasUpdates ? () => {} : onBeforeUpdate,
        hasUpdates ? () => dispatcher.onBuildOk() : onHotUpdateSuccess,
        sendMessage,
        dispatcher
      )
    } else {
      dispatcher.onBuildOk()
      if (process.env.__NEXT_TEST_MODE) {
        afterApplyUpdates(() => {
          if (self.__NEXT_HMR_CB) {
            self.__NEXT_HMR_CB()
            self.__NEXT_HMR_CB = null
          }
        })
      }
    }
  }

  // https://webpack.js.org/api/hot-module-replacement/#check
  // @ts-expect-error module.hot exists
  module.hot
    .check(/* autoApply */ false)
    .then((updatedModules: any[] | null) => {
      if (!updatedModules) {
        return null
      }

      if (typeof onBeforeUpdate === 'function') {
        const hasUpdates = Boolean(updatedModules.length)
        onBeforeUpdate(hasUpdates)
      }
      // https://webpack.js.org/api/hot-module-replacement/#apply
      // @ts-expect-error module.hot exists
      return module.hot.apply()
    })
    .then(
      (updatedModules: any[] | null) => {
        handleApplyUpdates(null, updatedModules)
      },
      (err: any) => {
        handleApplyUpdates(err, null)
      }
    )
}

/** Handles messages from the sevrer for the App Router. */
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

  function handleAfterErrors(errors: ReadonlyArray<Error>) {
    console.log('handleAfterErrors', errors)
    for (const error of errors) {
      dispatcher.onAfterError(error)
    }

    // // Also log them to the console.
    // for (let i = 0; i < errors.length; i++) {
    //   console.error(errors[i])
    // }
  }

  function handleBuildErrors(errors: ReadonlyArray<unknown>) {
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
      dispatcher.onBuildOk()
    } else {
      tryApplyUpdates(
        function onBeforeHotUpdate(hasUpdates: boolean) {
          handleBeforeHotUpdateWebpack(dispatcher, hasUpdates)
        },
        function onSuccessfulHotUpdate(webpackUpdatedModules: string[]) {
          // Only dismiss it when we're sure it's a hot update.
          // Otherwise it would flicker right before the reload.
          handleSuccessfulHotUpdateWebpack(
            dispatcher,
            sendMessage,
            webpackUpdatedModules
          )
        },
        sendMessage,
        dispatcher
      )
    }
  }

  switch (obj.action) {
    case HMR_ACTIONS_SENT_TO_BROWSER.APP_ISR_MANIFEST: {
      if (process.env.__NEXT_APP_ISR_INDICATOR) {
        if (appIsrManifestRef) {
          appIsrManifestRef.current = obj.data

          // handle initial status on receiving manifest
          // navigation is handled in useEffect for pathname changes
          // as we'll receive the updated manifest before usePathname
          // triggers for new value
          if ((pathnameRef.current as string) in obj.data) {
            // the indicator can be hidden for an hour.
            // check if it's still hidden
            const indicatorHiddenAt = Number(
              localStorage?.getItem('__NEXT_DISMISS_PRERENDER_INDICATOR')
            )

            const isHidden =
              indicatorHiddenAt &&
              !isNaN(indicatorHiddenAt) &&
              Date.now() < indicatorHiddenAt

            if (!isHidden) {
              dispatcher.onStaticIndicator(true)
            }
          } else {
            dispatcher.onStaticIndicator(false)
          }
        }
      }
      break
    }
    case HMR_ACTIONS_SENT_TO_BROWSER.BUILDING: {
      startLatency = Date.now()
      if (!process.env.TURBOPACK) {
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

        handleBuildErrors(errors)
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
        // Handle hot updates
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
      const updatedModules = extractModulesFromTurbopackMessage(obj.data)
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
      reportHmrLatency(sendMessage, updatedModules)
      break
    }
    // TODO-APP: make server component change more granular
    case HMR_ACTIONS_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES: {
      sendMessage(
        JSON.stringify({
          event: 'server-component-reload-page',
          clientId: __nextDevClientId,
        })
      )
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
    case HMR_ACTIONS_SENT_TO_BROWSER.AFTER_ERROR: {
      const { errorJSON, source } = obj
      if (errorJSON) {
        const { message, stack } = JSON.parse(errorJSON)
        const error = new Error(message)
        error.stack = stack
        decorateServerError(error, source ?? 'server')
        handleAfterErrors([error])
      }
      return
    }
    case HMR_ACTIONS_SENT_TO_BROWSER.SERVER_ERROR: {
      const { errorJSON } = obj
      if (errorJSON) {
        const { message, stack } = JSON.parse(errorJSON)
        const error = new Error(message)
        error.stack = stack
        handleBuildErrors([error])
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
}: {
  assetPrefix: string
  children?: ReactNode
}) {
  const [state, dispatch] = useErrorOverlayReducer()

  const dispatcher = useMemo<Dispatcher>(() => {
    return {
      onBuildOk() {
        dispatch({ type: ACTION_BUILD_OK })
      },
      onBuildError(message) {
        dispatch({ type: ACTION_BUILD_ERROR, message })
      },
      onAfterError(reason) {
        dispatch({
          type: ACTION_AFTER_ERROR,
          reason,
          frames: parseStack(reason.stack!),
        })
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
      const stitchedError = getReactStitchedError(error)

      dispatch({
        type: ACTION_UNHANDLED_ERROR,
        reason: stitchedError,
        frames: parseStack(stitchedError.stack || ''),
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

  if (process.env.__NEXT_APP_ISR_INDICATOR) {
    // this conditional is only for dead-code elimination which
    // isn't a runtime conditional only build-time so ignore hooks rule
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      pathnameRef.current = pathname

      const appIsrManifest = appIsrManifestRef.current

      if (appIsrManifest) {
        if (pathname && pathname in appIsrManifest) {
          try {
            const indicatorHiddenAt = Number(
              localStorage?.getItem('__NEXT_DISMISS_PRERENDER_INDICATOR')
            )

            const isHidden =
              indicatorHiddenAt &&
              !isNaN(indicatorHiddenAt) &&
              Date.now() < indicatorHiddenAt

            if (!isHidden) {
              dispatcher.onStaticIndicator(true)
            }
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
        processMessage(
          obj,
          sendMessage,
          processTurbopackMessage,
          router,
          dispatcher,
          appIsrManifestRef,
          pathnameRef
        )
      } catch (err: any) {
        console.warn(
          '[HMR] Invalid message: ' +
            JSON.stringify(event.data) +
            '\n' +
            (err?.stack ?? '')
        )
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
    <ReactDevOverlay state={state} dispatcher={dispatcher}>
      {children}
    </ReactDevOverlay>
  )
}
