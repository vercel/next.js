import type { ReactNode } from 'react'
import React, {
  useCallback,
  useEffect,
  useReducer,
  useMemo,
  // @ts-expect-error TODO-APP: startTransition exists
  startTransition,
} from 'react'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import formatWebpackMessages from '../../dev/error-overlay/format-webpack-messages'
import { useRouter } from '../navigation'
import { errorOverlayReducer } from './internal/error-overlay-reducer'
import {
  ACTION_BUILD_OK,
  ACTION_BUILD_ERROR,
  ACTION_REFRESH,
  ACTION_UNHANDLED_ERROR,
  ACTION_UNHANDLED_REJECTION,
} from './internal/error-overlay-reducer'
import { parseStack } from './internal/helpers/parseStack'
import ReactDevOverlay from './internal/ReactDevOverlay'
import { useErrorHandler } from './internal/helpers/use-error-handler'
import {
  useSendMessage,
  useWebsocket,
  useWebsocketPing,
} from './internal/helpers/use-websocket'

interface Dispatcher {
  onBuildOk(): void
  onBuildError(message: string): void
  onRefresh(): void
}

// TODO-APP: add actual type
type PongEvent = any

let mostRecentCompilationHash: any = null
let __nextDevClientId = Math.round(Math.random() * 100 + Date.now())
let hadRuntimeError = false

// let startLatency = undefined

function onFastRefresh(dispatcher: Dispatcher, hasUpdates: boolean) {
  dispatcher.onBuildOk()
  if (hasUpdates) {
    dispatcher.onRefresh()
  }
}

// There is a newer version of the code available.
function handleAvailableHash(hash: string) {
  // Update last known compilation hash.
  mostRecentCompilationHash = hash
}

// Is there a newer version of this code available?
function isUpdateAvailable() {
  /* globals __webpack_hash__ */
  // __webpack_hash__ is the hash of the current compilation.
  // It's a global variable injected by Webpack.
  // @ts-expect-error __webpack_hash__ exists
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
    })
  )

  window.location.reload()
}

// Attempt to update code on the fly, fall back to a hard reload.
function tryApplyUpdates(
  onHotUpdateSuccess: (hasUpdates: boolean) => void,
  sendMessage: any,
  dispatcher: Dispatcher
) {
  if (!isUpdateAvailable() || !canApplyUpdates()) {
    dispatcher.onBuildOk()
    return
  }

  function handleApplyUpdates(err: any, updatedModules: any) {
    if (err || hadRuntimeError || !updatedModules) {
      if (err) {
        console.warn(
          '[Fast Refresh] performing full reload\n\n' +
            "Fast Refresh will perform a full reload when you edit a file that's imported by modules outside of the React rendering tree.\n" +
            'You might have a file which exports a React component but also exports a value that is imported by a non-React component file.\n' +
            'Consider migrating the non-React component export to a separate file and importing it into both files.\n\n' +
            'It is also possible the parent component of the component you edited is a class component, which disables Fast Refresh.\n' +
            'Fast Refresh requires at least one parent function component in your React tree.'
        )
      } else if (hadRuntimeError) {
        console.warn(
          '[Fast Refresh] performing full reload because your application had an unrecoverable error'
        )
      }
      performFullReload(err, sendMessage)
      return
    }

    const hasUpdates = Boolean(updatedModules.length)
    if (typeof onHotUpdateSuccess === 'function') {
      // Maybe we want to do something.
      onHotUpdateSuccess(hasUpdates)
    }

    if (isUpdateAvailable()) {
      // While we were updating, there was a new update! Do it again.
      tryApplyUpdates(
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
  module.hot.check(/* autoApply */ true).then(
    (updatedModules: any) => {
      handleApplyUpdates(null, updatedModules)
    },
    (err: any) => {
      handleApplyUpdates(err, null)
    }
  )
}

function processMessage(
  e: any,
  sendMessage: any,
  router: ReturnType<typeof useRouter>,
  dispatcher: Dispatcher
) {
  const obj = JSON.parse(e.data)

  switch (obj.action) {
    case 'building': {
      console.log('[Fast Refresh] rebuilding')
      break
    }
    case 'built':
    case 'sync': {
      if (obj.hash) {
        handleAvailableHash(obj.hash)
      }

      const { errors, warnings } = obj
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

        // "Massage" webpack messages.
        var formatted = formatWebpackMessages({
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

        // Compilation with warnings (e.g. ESLint).
        const isHotUpdate = obj.action !== 'sync'

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

        // Attempt to apply hot updates or reload.
        if (isHotUpdate) {
          tryApplyUpdates(
            function onSuccessfulHotUpdate(hasUpdates: any) {
              // Only dismiss it when we're sure it's a hot update.
              // Otherwise it would flicker right before the reload.
              onFastRefresh(dispatcher, hasUpdates)
            },
            sendMessage,
            dispatcher
          )
        }
        return
      }

      sendMessage(
        JSON.stringify({
          event: 'client-success',
          clientId: __nextDevClientId,
        })
      )

      const isHotUpdate =
        obj.action !== 'sync' ||
        ((!window.__NEXT_DATA__ || window.__NEXT_DATA__.page !== '/_error') &&
          isUpdateAvailable())

      // Attempt to apply hot updates or reload.
      if (isHotUpdate) {
        tryApplyUpdates(
          function onSuccessfulHotUpdate(hasUpdates: any) {
            // Only dismiss it when we're sure it's a hot update.
            // Otherwise it would flicker right before the reload.
            onFastRefresh(dispatcher, hasUpdates)
          },
          sendMessage,
          dispatcher
        )
      }
      return
    }
    // TODO-APP: make server component change more granular
    case 'serverComponentChanges': {
      sendMessage(
        JSON.stringify({
          event: 'server-component-reload-page',
          clientId: __nextDevClientId,
        })
      )
      if (hadRuntimeError) {
        return window.location.reload()
      }
      startTransition(() => {
        router.refresh()
        dispatcher.onRefresh()
      })

      return
    }
    case 'reloadPage': {
      sendMessage(
        JSON.stringify({
          event: 'client-reload-page',
          clientId: __nextDevClientId,
        })
      )
      return window.location.reload()
    }
    case 'removedPage': {
      // TODO-APP: potentially only refresh if the currently viewed page was removed.
      router.refresh()
      return
    }
    case 'addedPage': {
      // TODO-APP: potentially only refresh if the currently viewed page was added.
      router.refresh()
      return
    }
    case 'pong': {
      const { invalid } = obj
      if (invalid) {
        // Payload can be invalid even if the page does exist.
        // So, we check if it can be created.
        router.refresh()
      }
      return
    }
    default: {
      throw new Error('Unexpected action ' + obj.action)
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
  const [state, dispatch] = useReducer(errorOverlayReducer, {
    nextId: 1,
    buildError: null,
    errors: [],
  })
  const dispatcher = useMemo((): Dispatcher => {
    return {
      onBuildOk(): void {
        dispatch({ type: ACTION_BUILD_OK })
      },
      onBuildError(message: string): void {
        dispatch({ type: ACTION_BUILD_ERROR, message })
      },
      onRefresh(): void {
        dispatch({ type: ACTION_REFRESH })
      },
    }
  }, [dispatch])

  const handleOnUnhandledError = useCallback(
    (ev: WindowEventMap['error']): void => {
      if (
        ev.error &&
        ev.error.digest &&
        (ev.error.digest.startsWith('NEXT_REDIRECT') ||
          ev.error.digest === 'NEXT_NOT_FOUND')
      ) {
        ev.preventDefault()
        return
      }

      hadRuntimeError = true
      const error = ev?.error
      if (
        !error ||
        !(error instanceof Error) ||
        typeof error.stack !== 'string'
      ) {
        // A non-error was thrown, we don't have anything to show. :-(
        return
      }

      if (
        error.message.match(/(hydration|content does not match|did not match)/i)
      ) {
        error.message += `\n\nSee more info here: https://nextjs.org/docs/messages/react-hydration-error`
      }

      const e = error
      dispatch({
        type: ACTION_UNHANDLED_ERROR,
        reason: error,
        frames: parseStack(e.stack!),
      })
    },
    []
  )
  const handleOnUnhandledRejection = useCallback(
    (ev: WindowEventMap['unhandledrejection']): void => {
      hadRuntimeError = true
      const reason = ev?.reason
      if (
        !reason ||
        !(reason instanceof Error) ||
        typeof reason.stack !== 'string'
      ) {
        // A non-error was thrown, we don't have anything to show. :-(
        return
      }

      const e = reason
      dispatch({
        type: ACTION_UNHANDLED_REJECTION,
        reason: reason,
        frames: parseStack(e.stack!),
      })
    },
    []
  )
  useErrorHandler(handleOnUnhandledError, handleOnUnhandledRejection)

  const webSocketRef = useWebsocket(assetPrefix)
  useWebsocketPing(webSocketRef)
  const sendMessage = useSendMessage(webSocketRef)

  const router = useRouter()
  useEffect(() => {
    const handler = (event: MessageEvent<PongEvent>) => {
      if (
        event.data.indexOf('action') === -1 &&
        // TODO-APP: clean this up for consistency
        event.data.indexOf('pong') === -1
      ) {
        return
      }

      try {
        processMessage(event, sendMessage, router, dispatcher)
      } catch (ex) {
        console.warn('Invalid HMR message: ' + event.data + '\n', ex)
      }
    }

    const websocket = webSocketRef.current
    if (websocket) {
      websocket.addEventListener('message', handler)
    }

    return () => websocket && websocket.removeEventListener('message', handler)
  }, [sendMessage, router, webSocketRef, dispatcher])

  return <ReactDevOverlay state={state}>{children}</ReactDevOverlay>
}
