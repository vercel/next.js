/// <reference types="webpack/module.d.ts" />

import type { ReactNode } from 'react'
import { useEffect, startTransition } from 'react'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import formatWebpackMessages from '../../../../shared/lib/format-webpack-messages'
import {
  REACT_REFRESH_FULL_RELOAD,
  REACT_REFRESH_FULL_RELOAD_FROM_ERROR,
} from '../shared'
import {
  dispatcher,
  getSerializedOverlayState,
  getSegmentTrieData,
} from 'next/dist/compiled/next-devtools'
import { ReplaySsrOnlyErrors } from '../../../../next-devtools/userspace/app/errors/replay-ssr-only-errors'
import { AppDevOverlayErrorBoundary } from '../../../../next-devtools/userspace/app/app-dev-overlay-error-boundary'
import { useErrorHandler } from '../../../../next-devtools/userspace/app/errors/use-error-handler'
import { RuntimeErrorHandler } from '../../runtime-error-handler'
import { useWebSocketPing } from './web-socket'
import {
  HMR_MESSAGE_SENT_TO_BROWSER,
  HMR_MESSAGE_SENT_TO_SERVER,
} from '../../../../server/dev/hot-reloader-types'
import type {
  HmrMessageSentToBrowser,
  TurbopackMessageSentToBrowser,
} from '../../../../server/dev/hot-reloader-types'
import type { McpErrorStateResponse } from '../../../../shared/lib/mcp-error-types'
import type { McpPageMetadataResponse } from '../../../../shared/lib/mcp-page-metadata-types'
import { useUntrackedPathname } from '../../../components/navigation-untracked'
import reportHmrLatency from '../../report-hmr-latency'
import { TurbopackHmr } from '../turbopack-hot-reloader-common'
import { NEXT_HMR_REFRESH_HASH_COOKIE } from '../../../components/app-router-headers'
import {
  publicAppRouterInstance,
  type GlobalErrorState,
} from '../../../components/app-router-instance'
import { InvariantError } from '../../../../shared/lib/invariant-error'
import { getOrCreateDebugChannelReadableWriterPair } from '../../debug-channel'

export interface StaticIndicatorState {
  pathname: string | null
  appIsrManifest: Record<string, boolean> | null
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

export function performFullReload(
  err: any,
  sendMessage: (data: string) => void
) {
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
function tryApplyUpdatesWebpack(sendMessage: (message: string) => void) {
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
      tryApplyUpdatesWebpack(sendMessage)
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
export function processMessage(
  message: HmrMessageSentToBrowser,
  sendMessage: (message: string) => void,
  processTurbopackMessage: (msg: TurbopackMessageSentToBrowser) => void,
  staticIndicatorState: StaticIndicatorState
) {
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
          hmrUpdate.endMsSinceEpoch,
          // suppress the `client-hmr-latency` event if the update was a no-op:
          hmrUpdate.hasUpdates
        )
      }
      dispatcher.onBuildOk()
    } else {
      tryApplyUpdatesWebpack(sendMessage)
    }
  }

  switch (message.type) {
    case HMR_MESSAGE_SENT_TO_BROWSER.ISR_MANIFEST: {
      if (process.env.__NEXT_DEV_INDICATOR) {
        staticIndicatorState.appIsrManifest = message.data

        // Handle the initial static indicator status on receiving the ISR
        // manifest. Navigation is handled in an effect inside HotReload for
        // pathname changes as we'll receive the updated manifest before
        // usePathname triggers for a new value.

        const isStatic = staticIndicatorState.pathname
          ? message.data[staticIndicatorState.pathname]
          : undefined

        dispatcher.onStaticIndicator(
          isStatic === undefined ? 'pending' : isStatic ? 'static' : 'dynamic'
        )
      }
      break
    }
    case HMR_MESSAGE_SENT_TO_BROWSER.BUILDING: {
      dispatcher.buildingIndicatorShow()

      if (process.env.TURBOPACK) {
        turbopackHmr!.onBuilding()
      } else {
        webpackStartMsSinceEpoch = Date.now()
        setPendingHotUpdateWebpack()
        console.log('[Fast Refresh] rebuilding')
      }
      break
    }
    case HMR_MESSAGE_SENT_TO_BROWSER.BUILT:
    case HMR_MESSAGE_SENT_TO_BROWSER.SYNC: {
      dispatcher.buildingIndicatorHide()

      if (message.hash) {
        handleAvailableHash(message.hash)
      }

      const { errors, warnings } = message

      // Is undefined when it's a 'built' event
      if ('versionInfo' in message)
        dispatcher.onVersionInfo(message.versionInfo)
      if ('debug' in message && message.debug)
        dispatcher.onDebugInfo(message.debug)
      if ('devIndicator' in message)
        dispatcher.onDevIndicator(message.devIndicator)
      if ('devToolsConfig' in message)
        dispatcher.onDevToolsConfig(message.devToolsConfig)

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

      if (message.type === HMR_MESSAGE_SENT_TO_BROWSER.BUILT) {
        handleHotUpdate()
      }
      return
    }
    case HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_CONNECTED: {
      processTurbopackMessage({
        type: HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_CONNECTED,
        data: {
          sessionId: message.data.sessionId,
        },
      })
      break
    }
    case HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_MESSAGE: {
      turbopackHmr!.onTurbopackMessage(message)
      dispatcher.onBeforeRefresh()
      processTurbopackMessage({
        type: HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_MESSAGE,
        data: message.data,
      })
      if (RuntimeErrorHandler.hadRuntimeError) {
        console.warn(REACT_REFRESH_FULL_RELOAD_FROM_ERROR)
        performFullReload(null, sendMessage)
      }
      dispatcher.onRefresh()
      break
    }
    // TODO-APP: make server component change more granular
    case HMR_MESSAGE_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES: {
      turbopackHmr?.onServerComponentChanges()
      sendMessage(
        JSON.stringify({
          event: 'server-component-reload-page',
          clientId: __nextDevClientId,
          hash: message.hash,
        })
      )

      // Store the latest hash in a session cookie so that it's sent back to the
      // server with any subsequent requests.
      document.cookie = `${NEXT_HMR_REFRESH_HASH_COOKIE}=${message.hash};path=/`

      if (
        RuntimeErrorHandler.hadRuntimeError ||
        document.documentElement.id === '__next_error__'
      ) {
        if (reloading) return
        reloading = true
        return window.location.reload()
      }

      startTransition(() => {
        publicAppRouterInstance.hmrRefresh()
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
    case HMR_MESSAGE_SENT_TO_BROWSER.RELOAD_PAGE: {
      turbopackHmr?.onReloadPage()
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
    case HMR_MESSAGE_SENT_TO_BROWSER.ADDED_PAGE:
    case HMR_MESSAGE_SENT_TO_BROWSER.REMOVED_PAGE: {
      turbopackHmr?.onPageAddRemove()
      // TODO-APP: potentially only refresh if the currently viewed page was added/removed.
      return publicAppRouterInstance.hmrRefresh()
    }
    case HMR_MESSAGE_SENT_TO_BROWSER.SERVER_ERROR: {
      const { errorJSON } = message
      if (errorJSON) {
        const errorObject = JSON.parse(errorJSON)
        const error = new Error(errorObject.message)
        error.stack = errorObject.stack
        handleErrors([error])
      }
      return
    }
    case HMR_MESSAGE_SENT_TO_BROWSER.DEV_PAGES_MANIFEST_UPDATE: {
      return
    }
    case HMR_MESSAGE_SENT_TO_BROWSER.DEVTOOLS_CONFIG: {
      dispatcher.onDevToolsConfig(message.data)
      return
    }
    case HMR_MESSAGE_SENT_TO_BROWSER.REACT_DEBUG_CHUNK: {
      const { requestId, chunk } = message
      const { writer } = getOrCreateDebugChannelReadableWriterPair(requestId)

      if (chunk) {
        writer.ready.then(() => writer.write(chunk)).catch(console.error)
      } else {
        // A null chunk signals that no more chunks will be sent, which allows
        // us to close the writer.
        // TODO: Revisit this cleanup logic when we integrate the return channel
        // that keeps the connection open to be able to lazily retrieve debug
        // objects.
        writer.ready.then(() => writer.close()).catch(console.error)
      }

      return
    }
    case HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_CURRENT_ERROR_STATE: {
      const errorState = getSerializedOverlayState()
      const response: McpErrorStateResponse = {
        event: HMR_MESSAGE_SENT_TO_SERVER.MCP_ERROR_STATE_RESPONSE,
        requestId: message.requestId,
        errorState,
        url: window.location.href,
      }
      sendMessage(JSON.stringify(response))
      return
    }
    case HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_PAGE_METADATA: {
      const segmentTrieData = getSegmentTrieData()
      const response: McpPageMetadataResponse = {
        event: HMR_MESSAGE_SENT_TO_SERVER.MCP_PAGE_METADATA_RESPONSE,
        requestId: message.requestId,
        segmentTrieData,
        url: window.location.href,
      }
      sendMessage(JSON.stringify(response))
      return
    }
    case HMR_MESSAGE_SENT_TO_BROWSER.CACHE_INDICATOR: {
      dispatcher.onCacheIndicator(message.state)
      return
    }
    case HMR_MESSAGE_SENT_TO_BROWSER.MIDDLEWARE_CHANGES:
    case HMR_MESSAGE_SENT_TO_BROWSER.CLIENT_CHANGES:
    case HMR_MESSAGE_SENT_TO_BROWSER.SERVER_ONLY_CHANGES:
      // These action types are handled in src/client/page-bootstrap.ts
      break
    default: {
      message satisfies never
    }
  }
}

export default function HotReload({
  children,
  globalError,
  webSocket,
  staticIndicatorState,
}: {
  children: ReactNode
  globalError: GlobalErrorState
  webSocket: WebSocket | undefined
  staticIndicatorState: StaticIndicatorState | undefined
}) {
  useErrorHandler(dispatcher.onUnhandledError, dispatcher.onUnhandledRejection)
  useWebSocketPing(webSocket)

  // We don't want access of the pathname for the dev tools to trigger a dynamic
  // access (as the dev overlay will never be present in production).
  const pathname = useUntrackedPathname()

  if (process.env.__NEXT_DEV_INDICATOR) {
    // this conditional is only for dead-code elimination which
    // isn't a runtime conditional only build-time so ignore hooks rule
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      if (!staticIndicatorState) {
        throw new InvariantError(
          'Expected staticIndicatorState to be defined in dev mode.'
        )
      }

      staticIndicatorState.pathname = pathname

      if (staticIndicatorState.appIsrManifest) {
        const isStatic = pathname
          ? staticIndicatorState.appIsrManifest[pathname]
          : undefined

        dispatcher.onStaticIndicator(
          isStatic === undefined ? 'pending' : isStatic ? 'static' : 'dynamic'
        )
      }
    }, [pathname, staticIndicatorState])
  }

  return (
    <AppDevOverlayErrorBoundary globalError={globalError}>
      <ReplaySsrOnlyErrors onBlockingError={dispatcher.openErrorOverlay} />
      {children}
    </AppDevOverlayErrorBoundary>
  )
}
