import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  // @ts-expect-error TODO-APP: startTransition exists
  startTransition,
} from 'react'
import { GlobalLayoutRouterContext } from '../../shared/lib/app-router-context'
import {
  register,
  unregister,
  onBuildError,
  onBuildOk,
  onRefresh,
} from 'next/dist/compiled/@next/react-dev-overlay/dist/client'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import formatWebpackMessages from '../dev/error-overlay/format-webpack-messages'
import { useRouter } from './hooks-client'

function getSocketProtocol(assetPrefix: string): string {
  let protocol = window.location.protocol

  try {
    // assetPrefix is a url
    protocol = new URL(assetPrefix).protocol
  } catch (_) {}

  return protocol === 'http:' ? 'ws' : 'wss'
}

// const TIMEOUT = 5000

// TODO-APP: add actual type
type PongEvent = any

let mostRecentCompilationHash: any = null
let __nextDevClientId = Math.round(Math.random() * 100 + Date.now())
let hadRuntimeError = false

// let startLatency = undefined

function onFastRefresh(hasUpdates: boolean) {
  onBuildOk()
  if (hasUpdates) {
    onRefresh()
  }

  // if (startLatency) {
  //   const endLatency = Date.now()
  //   const latency = endLatency - startLatency
  //   console.log(`[Fast Refresh] done in ${latency}ms`)
  //   sendMessage(
  //     JSON.stringify({
  //       event: 'client-hmr-latency',
  //       id: __nextDevClientId,
  //       startTime: startLatency,
  //       endTime: endLatency,
  //     })
  //   )
  //   // if (self.__NEXT_HMR_LATENCY_CB) {
  //   //   self.__NEXT_HMR_LATENCY_CB(latency)
  //   // }
  // }
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
// function afterApplyUpdates(fn: any) {
//   if (canApplyUpdates()) {
//     fn()
//   } else {
//     function handler(status: any) {
//       if (status === 'idle') {
//         // @ts-expect-error module.hot exists
//         module.hot.removeStatusHandler(handler)
//         fn()
//       }
//     }
//     // @ts-expect-error module.hot exists
//     module.hot.addStatusHandler(handler)
//   }
// }

// Attempt to update code on the fly, fall back to a hard reload.
function tryApplyUpdates(onHotUpdateSuccess: any, sendMessage: any) {
  // @ts-expect-error module.hot exists
  if (!module.hot) {
    // HotModuleReplacementPlugin is not in Webpack configuration.
    console.error('HotModuleReplacementPlugin is not in Webpack configuration.')
    // window.location.reload();
    return
  }

  if (!isUpdateAvailable() || !canApplyUpdates()) {
    onBuildOk()
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
      tryApplyUpdates(hasUpdates ? onBuildOk : onHotUpdateSuccess, sendMessage)
    } else {
      onBuildOk()
      // if (process.env.__NEXT_TEST_MODE) {
      //   afterApplyUpdates(() => {
      //     if (self.__NEXT_HMR_CB) {
      //       self.__NEXT_HMR_CB()
      //       self.__NEXT_HMR_CB = null
      //     }
      //   })
      // }
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

function processMessage(
  e: any,
  sendMessage: any,
  router: ReturnType<typeof useRouter>
) {
  const obj = JSON.parse(e.data)

  switch (obj.action) {
    case 'building': {
      // startLatency = Date.now()
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
        onBuildError(formatted.errors[0])

        // Also log them to the console.
        for (let i = 0; i < formatted.errors.length; i++) {
          console.error(stripAnsi(formatted.errors[i]))
        }

        // Do not attempt to reload now.
        // We will reload on next success instead.
        // if (process.env.__NEXT_TEST_MODE) {
        //   if (self.__NEXT_HMR_CB) {
        //     self.__NEXT_HMR_CB(formatted.errors[0])
        //     self.__NEXT_HMR_CB = null
        //   }
        // }
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
          tryApplyUpdates(function onSuccessfulHotUpdate(hasUpdates: any) {
            // Only dismiss it when we're sure it's a hot update.
            // Otherwise it would flicker right before the reload.
            onFastRefresh(hasUpdates)
          }, sendMessage)
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
        tryApplyUpdates(function onSuccessfulHotUpdate(hasUpdates: any) {
          // Only dismiss it when we're sure it's a hot update.
          // Otherwise it would flicker right before the reload.
          onFastRefresh(hasUpdates)
        }, sendMessage)
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
        router.reload()
        onRefresh()
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
      // const [page] = obj.data
      // if (page === window.next.router.pathname) {
      //   sendMessage(
      //     JSON.stringify({
      //       event: 'client-removed-page',
      //       clientId: window.__nextDevClientId,
      //       page,
      //     })
      //   )
      //   return window.location.reload()
      // }
      return
    }
    case 'addedPage': {
      // const [page] = obj.data
      // if (
      //   page === window.next.router.pathname &&
      //   typeof window.next.router.components[page] === 'undefined'
      // ) {
      //   sendMessage(
      //     JSON.stringify({
      //       event: 'client-added-page',
      //       clientId: window.__nextDevClientId,
      //       page,
      //     })
      //   )
      //   return window.location.reload()
      // }
      return
    }
    case 'pong': {
      const { invalid } = obj
      if (invalid) {
        // Payload can be invalid even if the page does exist.
        // So, we check if it can be created.
        fetch(location.href, {
          credentials: 'same-origin',
        }).then((pageRes) => {
          if (pageRes.status === 200) {
            // Page exists now, reload
            location.reload()
          } else {
            // TODO-APP: fix this
            // Page doesn't exist
            // if (
            //   self.__NEXT_DATA__.page === Router.pathname &&
            //   Router.pathname !== '/_error'
            // ) {
            //   // We are still on the page,
            //   // reload to show 404 error page
            //   location.reload()
            // }
          }
        })
      }
      return
    }
    default: {
      throw new Error('Unexpected action ' + obj.action)
    }
  }
}

export default function HotReload({ assetPrefix }: { assetPrefix: string }) {
  const { tree } = useContext(GlobalLayoutRouterContext)
  const router = useRouter()

  const webSocketRef = useRef<WebSocket>()
  const sendMessage = useCallback((data) => {
    const socket = webSocketRef.current
    if (!socket || socket.readyState !== socket.OPEN) return
    return socket.send(data)
  }, [])

  useEffect(() => {
    register()
    const onError = () => {
      hadRuntimeError = true
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onError)
    return () => {
      unregister()
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onError)
    }
  }, [])

  useEffect(() => {
    if (webSocketRef.current) {
      return
    }

    const { hostname, port } = window.location
    const protocol = getSocketProtocol(assetPrefix || '')
    const normalizedAssetPrefix = assetPrefix.replace(/^\/+/, '')

    let url = `${protocol}://${hostname}:${port}${
      normalizedAssetPrefix ? `/${normalizedAssetPrefix}` : ''
    }`

    if (normalizedAssetPrefix.startsWith('http')) {
      url = `${protocol}://${normalizedAssetPrefix.split('://')[1]}`
    }

    webSocketRef.current = new window.WebSocket(`${url}/_next/webpack-hmr`)
  }, [assetPrefix])
  useEffect(() => {
    // Taken from on-demand-entries-client.js
    // TODO-APP: check 404 case
    const interval = setInterval(() => {
      sendMessage(
        JSON.stringify({
          event: 'ping',
          // TODO-APP: fix case for dynamic parameters, this will be resolved wrong currently.
          tree,
          appDirRoute: true,
        })
      )
    }, 2500)
    return () => clearInterval(interval)
  }, [tree, sendMessage])
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
        processMessage(event, sendMessage, router)
      } catch (ex) {
        console.warn('Invalid HMR message: ' + event.data + '\n', ex)
      }
    }

    if (webSocketRef.current) {
      webSocketRef.current.addEventListener('message', handler)
    }

    return () =>
      webSocketRef.current &&
      webSocketRef.current.removeEventListener('message', handler)
  }, [sendMessage, router])
  // useEffect(() => {
  //   const interval = setInterval(function () {
  //     if (
  //       lastActivityRef.current &&
  //       Date.now() - lastActivityRef.current > TIMEOUT
  //     ) {
  //       handleDisconnect()
  //     }
  //   }, 2500)

  //   return () => clearInterval(interval)
  // })
  return null
}
