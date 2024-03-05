// TODO: Remove use of `any` type. Fix no-use-before-define violations.
/* eslint-disable @typescript-eslint/no-use-before-define */
/**
 * MIT License
 *
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// This file is a modified version of the Create React App HMR dev client that
// can be found here:
// https://github.com/facebook/create-react-app/blob/v3.4.1/packages/react-dev-utils/webpackHotDevClient.js

import {
  register,
  onBuildError,
  onBuildOk,
  onBeforeRefresh,
  onRefresh,
} from '../../components/react-dev-overlay/pages/client'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import { addMessageListener, sendMessage } from './websocket'
import formatWebpackMessages from './format-webpack-messages'
import { HMR_ACTIONS_SENT_TO_BROWSER } from '../../../server/dev/hot-reloader-types'
import type {
  HMR_ACTION_TYPES,
  TurbopackMsgToBrowser,
} from '../../../server/dev/hot-reloader-types'
import { extractModulesFromTurbopackMessage } from '../../../server/dev/extract-modules-from-turbopack-message'
import { RuntimeErrorHandler } from '../../components/react-dev-overlay/internal/helpers/runtime-error-handler'
import { REACT_REFRESH_FULL_RELOAD_FROM_ERROR } from './messages'
// This alternative WebpackDevServer combines the functionality of:
// https://github.com/webpack/webpack-dev-server/blob/webpack-1/client/index.js
// https://github.com/webpack/webpack/blob/webpack-1/hot/dev-server.js

// It only supports their simplest configuration (hot updates on same server).
// It makes some opinionated choices on top, like adding a syntax error overlay
// that looks similar to our console output. The error overlay is inspired by:
// https://github.com/glenjamin/webpack-hot-middleware

declare global {
  const __webpack_hash__: string
  interface Window {
    __nextDevClientId: number
    __NEXT_HMR_LATENCY_CB: any
  }
}

window.__nextDevClientId = Math.round(Math.random() * 100 + Date.now())

let hadRuntimeError = false
let customHmrEventHandler: any
let turbopackMessageListeners: ((msg: TurbopackMsgToBrowser) => void)[] = []
let MODE: 'webpack' | 'turbopack' = 'webpack'
export default function connect(mode: 'webpack' | 'turbopack') {
  MODE = mode
  register()

  addMessageListener((payload) => {
    if (!('action' in payload)) {
      return
    }

    try {
      processMessage(payload)
    } catch (err: any) {
      console.warn(
        '[HMR] Invalid message: ' + payload + '\n' + (err?.stack ?? '')
      )
    }
  })

  return {
    subscribeToHmrEvent(handler: any) {
      customHmrEventHandler = handler
    },
    onUnrecoverableError() {
      hadRuntimeError = true
    },
    addTurbopackMessageListener(cb: (msg: TurbopackMsgToBrowser) => void) {
      turbopackMessageListeners.push(cb)
    },
    sendTurbopackMessage(msg: string) {
      sendMessage(msg)
    },
  }
}

// Remember some state related to hot module replacement.
var isFirstCompilation = true
var mostRecentCompilationHash: string | null = null
var hasCompileErrors = false

function clearOutdatedErrors() {
  // Clean up outdated compile errors, if any.
  if (typeof console !== 'undefined' && typeof console.clear === 'function') {
    if (hasCompileErrors) {
      console.clear()
    }
  }
}

// Successful compilation.
function handleSuccess() {
  clearOutdatedErrors()

  if (MODE === 'webpack') {
    const isHotUpdate =
      !isFirstCompilation ||
      (window.__NEXT_DATA__.page !== '/_error' && isUpdateAvailable())
    isFirstCompilation = false
    hasCompileErrors = false

    // Attempt to apply hot updates or reload.
    if (isHotUpdate) {
      tryApplyUpdates(onBeforeFastRefresh, onFastRefresh)
    }
  } else {
    onBuildOk()
  }
}

// Compilation with warnings (e.g. ESLint).
function handleWarnings(warnings: any) {
  clearOutdatedErrors()

  const isHotUpdate = !isFirstCompilation
  isFirstCompilation = false
  hasCompileErrors = false

  function printWarnings() {
    // Print warnings to the console.
    const formatted = formatWebpackMessages({
      warnings: warnings,
      errors: [],
    })

    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      for (let i = 0; i < formatted.warnings?.length; i++) {
        if (i === 5) {
          console.warn(
            'There were more warnings in other files.\n' +
              'You can find a complete log in the terminal.'
          )
          break
        }
        console.warn(stripAnsi(formatted.warnings[i]))
      }
    }
  }

  printWarnings()

  // Attempt to apply hot updates or reload.
  if (isHotUpdate) {
    tryApplyUpdates(onBeforeFastRefresh, onFastRefresh)
  }
}

// Compilation with errors (e.g. syntax error or missing modules).
function handleErrors(errors: any) {
  clearOutdatedErrors()

  isFirstCompilation = false
  hasCompileErrors = true

  // "Massage" webpack messages.
  var formatted = formatWebpackMessages({
    errors: errors,
    warnings: [],
  })

  // Only show the first error.
  onBuildError(formatted.errors[0])

  // Also log them to the console.
  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    for (var i = 0; i < formatted.errors.length; i++) {
      console.error(stripAnsi(formatted.errors[i]))
    }
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

let startLatency: number | undefined = undefined

function onBeforeFastRefresh(updatedModules: string[]) {
  if (updatedModules.length > 0) {
    // Only trigger a pending state if we have updates to apply
    // (cf. onFastRefresh)
    onBeforeRefresh()
  }
}

function onFastRefresh(updatedModules: ReadonlyArray<string> = []) {
  onBuildOk()
  if (updatedModules.length === 0) {
    return
  }

  onRefresh()

  reportHmrLatency()
}

function reportHmrLatency(updatedModules: ReadonlyArray<string> = []) {
  if (startLatency) {
    const endLatency = Date.now()
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
    if (self.__NEXT_HMR_LATENCY_CB) {
      self.__NEXT_HMR_LATENCY_CB(latency)
    }
  }
}

// There is a newer version of the code available.
function handleAvailableHash(hash: string) {
  // Update last known compilation hash.
  mostRecentCompilationHash = hash
}

// Handle messages from the server.
function processMessage(obj: HMR_ACTION_TYPES) {
  if (!('action' in obj)) {
    return
  }

  // Use turbopack message for analytics, (still need built for webpack)
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
      const hasErrors = Boolean(errors && errors.length)
      if (hasErrors) {
        sendMessage(
          JSON.stringify({
            event: 'client-error',
            errorCount: errors.length,
            clientId: window.__nextDevClientId,
          })
        )
        return handleErrors(errors)
      }

      const hasWarnings = Boolean(warnings && warnings.length)
      if (hasWarnings) {
        sendMessage(
          JSON.stringify({
            event: 'client-warning',
            warningCount: warnings.length,
            clientId: window.__nextDevClientId,
          })
        )
        return handleWarnings(warnings)
      }

      sendMessage(
        JSON.stringify({
          event: 'client-success',
          clientId: window.__nextDevClientId,
        })
      )
      return handleSuccess()
    }
    case HMR_ACTIONS_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES: {
      window.location.reload()
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
    case HMR_ACTIONS_SENT_TO_BROWSER.TURBOPACK_CONNECTED: {
      for (const listener of turbopackMessageListeners) {
        listener({
          type: HMR_ACTIONS_SENT_TO_BROWSER.TURBOPACK_CONNECTED,
        })
      }
      break
    }
    case HMR_ACTIONS_SENT_TO_BROWSER.TURBOPACK_MESSAGE: {
      const updatedModules = extractModulesFromTurbopackMessage(obj.data)
      onBeforeFastRefresh(updatedModules)
      for (const listener of turbopackMessageListeners) {
        listener({
          type: HMR_ACTIONS_SENT_TO_BROWSER.TURBOPACK_MESSAGE,
          data: obj.data,
        })
      }
      if (RuntimeErrorHandler.hadRuntimeError) {
        console.warn(REACT_REFRESH_FULL_RELOAD_FROM_ERROR)
        performFullReload(null)
      }
      onRefresh()
      reportHmrLatency(updatedModules)
      break
    }
    default: {
      if (customHmrEventHandler) {
        customHmrEventHandler(obj)
        break
      }
      break
    }
  }
}

// Is there a newer version of this code available?
function isUpdateAvailable() {
  /* globals __webpack_hash__ */
  // __webpack_hash__ is the hash of the current compilation.
  // It's a global variable injected by Webpack.
  return mostRecentCompilationHash !== __webpack_hash__
}

// Webpack disallows updates in other states.
function canApplyUpdates() {
  // @ts-expect-error TODO: module.hot exists but type needs to be added. Can't use `as any` here as webpack parses for `module.hot` calls.
  return module.hot.status() === 'idle'
}
function afterApplyUpdates(fn: () => void) {
  if (canApplyUpdates()) {
    fn()
  } else {
    function handler(status: string) {
      if (status === 'idle') {
        // @ts-expect-error TODO: module.hot exists but type needs to be added. Can't use `as any` here as webpack parses for `module.hot` calls.
        module.hot.removeStatusHandler(handler)
        fn()
      }
    }
    // @ts-expect-error TODO: module.hot exists but type needs to be added. Can't use `as any` here as webpack parses for `module.hot` calls.
    module.hot.addStatusHandler(handler)
  }
}

// Attempt to update code on the fly, fall back to a hard reload.
function tryApplyUpdates(
  onBeforeHotUpdate: ((updatedModules: string[]) => unknown) | undefined,
  onHotUpdateSuccess: (updatedModules: string[]) => unknown
) {
  // @ts-expect-error TODO: module.hot exists but type needs to be added. Can't use `as any` here as webpack parses for `module.hot` calls.
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

  function handleApplyUpdates(err: any, updatedModules: string[] | null) {
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
      performFullReload(err)
      return
    }

    if (typeof onHotUpdateSuccess === 'function') {
      // Maybe we want to do something.
      onHotUpdateSuccess(updatedModules)
    }

    if (isUpdateAvailable()) {
      // While we were updating, there was a new update! Do it again.
      // However, this time, don't trigger a pending refresh state.
      tryApplyUpdates(
        updatedModules.length > 0 ? undefined : onBeforeHotUpdate,
        updatedModules.length > 0 ? onBuildOk : onHotUpdateSuccess
      )
    } else {
      onBuildOk()
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
  // @ts-expect-error TODO: module.hot exists but type needs to be added. Can't use `as any` here as webpack parses for `module.hot` calls.
  module.hot
    .check(/* autoApply */ false)
    .then((updatedModules: any) => {
      if (!updatedModules) {
        return null
      }

      if (typeof onBeforeHotUpdate === 'function') {
        onBeforeHotUpdate(updatedModules)
      }
      // @ts-expect-error TODO: module.hot exists but type needs to be added. Can't use `as any` here as webpack parses for `module.hot` calls.
      return module.hot.apply()
    })
    .then(
      (updatedModules: any) => {
        handleApplyUpdates(null, updatedModules)
      },
      (err: any) => {
        handleApplyUpdates(err, null)
      }
    )
}

function performFullReload(err: any) {
  const stackTrace =
    err &&
    ((err.stack && err.stack.split('\n').slice(0, 5).join('\n')) ||
      err.message ||
      err + '')

  sendMessage(
    JSON.stringify({
      event: 'client-full-reload',
      stackTrace,
      hadRuntimeError: !!hadRuntimeError,
    })
  )

  window.location.reload()
}
