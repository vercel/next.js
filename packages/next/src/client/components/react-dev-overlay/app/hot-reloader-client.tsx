import type { ReactNode } from 'react'
import React, {
  useCallback,
  useEffect,
  useReducer,
  useMemo,
  startTransition,
} from 'react'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import formatWebpackMessages from '../../../dev/error-overlay/format-webpack-messages'
import { useRouter } from '../../navigation'
import {
  ACTION_VERSION_INFO,
  INITIAL_OVERLAY_STATE,
  errorOverlayReducer,
} from './error-overlay-reducer'
import {
  ACTION_BUILD_OK,
  ACTION_BUILD_ERROR,
  ACTION_BEFORE_REFRESH,
  ACTION_REFRESH,
  ACTION_UNHANDLED_ERROR,
  ACTION_UNHANDLED_REJECTION,
} from './error-overlay-reducer'
import { parseStack } from '../internal/helpers/parseStack'
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
import { REACT_REFRESH_FULL_RELOAD_FROM_ERROR } from '../../../dev/error-overlay/messages'
import type { HydrationErrorState } from '../internal/helpers/hydration-error-info'

interface Dispatcher {
  onBuildOk(): void
  onBuildError(message: string): void
  onVersionInfo(versionInfo: VersionInfo): void
  onBeforeRefresh(): void
  onRefresh(): void
}

let mostRecentCompilationHash: any = null
let __nextDevClientId = Math.round(Math.random() * 100 + Date.now())
let reloading = false
let startLatency: number | null = null

function onBeforeFastRefresh(dispatcher: Dispatcher, hasUpdates: boolean) {
  if (hasUpdates) {
    dispatcher.onBeforeRefresh()
  }
}

function onFastRefresh(
  dispatcher: Dispatcher,
  sendMessage: (message: string) => void,
  updatedModules: ReadonlyArray<string>
) {
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
    dispatcher.onBuildOk()
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

function processMessage(
  obj: HMR_ACTION_TYPES,
  sendMessage: (message: string) => void,
  processTurbopackMessage: (msg: TurbopackMsgToBrowser) => void,
  router: ReturnType<typeof useRouter>,
  dispatcher: Dispatcher
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
      dispatcher.onBuildOk()
    } else {
      tryApplyUpdates(
        function onBeforeHotUpdate(hasUpdates: boolean) {
          onBeforeFastRefresh(dispatcher, hasUpdates)
        },
        function onSuccessfulHotUpdate(webpackUpdatedModules: string[]) {
          // Only dismiss it when we're sure it's a hot update.
          // Otherwise it would flicker right before the reload.
          onFastRefresh(dispatcher, sendMessage, webpackUpdatedModules)
        },
        sendMessage,
        dispatcher
      )
    }
  }

  switch (obj.action) {
    case HMR_ACTIONS_SENT_TO_BROWSER.BUILDING: {
      startLatency = Date.now()
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
      if ('versionInfo' in obj) {
        dispatcher.onVersionInfo(obj.versionInfo)
      }
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
        // Handle hot updates
        handleHotUpdate()
      }
      return
    }
    case HMR_ACTIONS_SENT_TO_BROWSER.TURBOPACK_CONNECTED: {
      processTurbopackMessage({
        type: HMR_ACTIONS_SENT_TO_BROWSER.TURBOPACK_CONNECTED,
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
        // @ts-ignore it exists, it's just hidden
        router.fastRefresh()
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
    case HMR_ACTIONS_SENT_TO_BROWSER.REMOVED_PAGE: {
      // TODO-APP: potentially only refresh if the currently viewed page was removed.
      // @ts-ignore it exists, it's just hidden
      router.fastRefresh()
      return
    }
    case HMR_ACTIONS_SENT_TO_BROWSER.ADDED_PAGE: {
      // TODO-APP: potentially only refresh if the currently viewed page was added.
      // @ts-ignore it exists, it's just hidden
      router.fastRefresh()
      return
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
}: {
  assetPrefix: string
  children?: ReactNode
}) {
  const [state, dispatch] = useReducer(
    errorOverlayReducer,
    INITIAL_OVERLAY_STATE
  )
  const dispatcher = useMemo((): Dispatcher => {
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
    }
  }, [dispatch])

  const handleOnUnhandledError = useCallback((error: Error): void => {
    const errorDetails = (error as any).details as
      | HydrationErrorState
      | undefined
    // Component stack is added to the error in use-error-handler in case there was a hydration errror
    const componentStack = errorDetails?.componentStack
    const warning = errorDetails?.warning
    dispatch({
      type: ACTION_UNHANDLED_ERROR,
      reason: error,
      frames: parseStack(error.stack!),
      componentStackFrames: componentStack
        ? parseComponentStack(componentStack)
        : undefined,
      warning,
    })
  }, [])
  const handleOnUnhandledRejection = useCallback((reason: Error): void => {
    dispatch({
      type: ACTION_UNHANDLED_REJECTION,
      reason: reason,
      frames: parseStack(reason.stack!),
    })
  }, [])
  const handleOnReactError = useCallback(() => {
    RuntimeErrorHandler.hadRuntimeError = true
  }, [])
  useErrorHandler(handleOnUnhandledError, handleOnUnhandledRejection)

  const webSocketRef = useWebsocket(assetPrefix)
  useWebsocketPing(webSocketRef)
  const sendMessage = useSendMessage(webSocketRef)
  const processTurbopackMessage = useTurbopack(sendMessage)

  const router = useRouter()

  useEffect(() => {
    const handler = (event: MessageEvent<any>) => {
      try {
        const obj = JSON.parse(event.data)
        processMessage(
          obj,
          sendMessage,
          processTurbopackMessage,
          router,
          dispatcher
        )
      } catch (err: any) {
        console.warn(
          '[HMR] Invalid message: ' + event.data + '\n' + (err?.stack ?? '')
        )
      }
    }

    const websocket = webSocketRef.current
    if (websocket) {
      websocket.addEventListener('message', handler)
    }

    return () => websocket && websocket.removeEventListener('message', handler)
  }, [sendMessage, router, webSocketRef, dispatcher, processTurbopackMessage])

  return (
    <ReactDevOverlay onReactError={handleOnReactError} state={state}>
      {children}
    </ReactDevOverlay>
  )
}
