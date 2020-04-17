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

import { getEventSourceWrapper } from './eventsource'
import formatWebpackMessages from './format-webpack-messages'
import * as ErrorOverlay from 'next/dist/compiled/react-error-overlay'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import { rewriteStacktrace } from './source-map-support'
import fetch from 'next/dist/build/polyfills/unfetch'

// This alternative WebpackDevServer combines the functionality of:
// https://github.com/webpack/webpack-dev-server/blob/webpack-1/client/index.js
// https://github.com/webpack/webpack/blob/webpack-1/hot/dev-server.js

// It only supports their simplest configuration (hot updates on same server).
// It makes some opinionated choices on top, like adding a syntax error overlay
// that looks similar to our console output. The error overlay is inspired by:
// https://github.com/glenjamin/webpack-hot-middleware

let hadRuntimeError = false
let customHmrEventHandler
export default function connect(options) {
  // Open stack traces in an editor.
  ErrorOverlay.setEditorHandler(function editorHandler({
    fileName,
    lineNumber,
    colNumber,
  }) {
    // Resolve invalid paths coming from react-error-overlay
    const resolvedFilename = fileName.replace(/^webpack:\/\//, '')
    fetch(
      '/_next/development/open-stack-frame-in-editor' +
        `?fileName=${window.encodeURIComponent(resolvedFilename)}` +
        `&lineNumber=${lineNumber || 1}` +
        `&colNumber=${colNumber || 1}`
    )
  })

  // We need to keep track of if there has been a runtime error.
  // Essentially, we cannot guarantee application state was not corrupted by the
  // runtime error. To prevent confusing behavior, we forcibly reload the entire
  // application. This is handled below when we are notified of a compile (code
  // change).
  // See https://github.com/facebook/create-react-app/issues/3096
  ErrorOverlay.startReportingRuntimeErrors({
    onError: function() {
      hadRuntimeError = true
    },
  })

  if (module.hot && typeof module.hot.dispose === 'function') {
    module.hot.dispose(function() {
      // TODO: why do we need this?
      ErrorOverlay.stopReportingRuntimeErrors()
    })
  }

  getEventSourceWrapper(options).addMessageListener(event => {
    // This is the heartbeat event
    if (event.data === '\uD83D\uDC93') {
      return
    }
    try {
      processMessage(event)
    } catch (ex) {
      console.warn('Invalid HMR message: ' + event.data + '\n' + ex)
    }
  })

  return {
    subscribeToHmrEvent(handler) {
      customHmrEventHandler = handler
    },
    reportRuntimeError(err) {
      ErrorOverlay.reportRuntimeError(err)
    },
    prepareError(err) {
      // Temporary workaround for https://github.com/facebook/create-react-app/issues/4760
      // Should be removed once the fix lands
      hadRuntimeError = true
      // react-error-overlay expects a type of `Error`
      const error = new Error(err.message)
      error.name = err.name
      error.stack = err.stack
      // __NEXT_DIST_DIR is provided by webpack
      rewriteStacktrace(error, process.env.__NEXT_DIST_DIR)
      return error
    },
  }
}

// Remember some state related to hot module replacement.
var isFirstCompilation = true
var mostRecentCompilationHash = null
var hasCompileErrors = false
var hmrEventCount = 0

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

  const isHotUpdate = !isFirstCompilation
  isFirstCompilation = false
  hasCompileErrors = false

  // Attempt to apply hot updates or reload.
  if (isHotUpdate) {
    tryApplyUpdates(function onHotUpdateSuccess() {
      // Only dismiss it when we're sure it's a hot update.
      // Otherwise it would flicker right before the reload.
      tryDismissErrorOverlay()
    })
  }
}

// Compilation with warnings (e.g. ESLint).
function handleWarnings(warnings) {
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
      for (let i = 0; i < formatted.warnings.length; i++) {
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
    tryApplyUpdates(function onSuccessfulHotUpdate() {
      // Only dismiss it when we're sure it's a hot update.
      // Otherwise it would flicker right before the reload.
      tryDismissErrorOverlay()
    })
  }
}

// Compilation with errors (e.g. syntax error or missing modules).
function handleErrors(errors) {
  clearOutdatedErrors()

  isFirstCompilation = false
  hasCompileErrors = true

  // "Massage" webpack messages.
  var formatted = formatWebpackMessages({
    errors: errors,
    warnings: [],
  })

  // Only show the first error.
  ErrorOverlay.reportBuildError(formatted.errors[0])

  // Also log them to the console.
  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    for (var i = 0; i < formatted.errors.length; i++) {
      console.error(stripAnsi(formatted.errors[i]))
    }
  }

  // Do not attempt to reload now.
  // We will reload on next success instead.
}

function tryDismissErrorOverlay() {
  if (!hasCompileErrors) {
    ErrorOverlay.dismissBuildError()
  }
}

// There is a newer version of the code available.
function handleAvailableHash(hash) {
  // Update last known compilation hash.
  mostRecentCompilationHash = hash
}

// Handle messages from the server.
function processMessage(e) {
  const obj = JSON.parse(e.data)
  switch (obj.action) {
    case 'building': {
      ++hmrEventCount
      console.log(
        '[HMR] bundle ' + (obj.name ? "'" + obj.name + "' " : '') + 'rebuilding'
      )
      break
    }
    case 'built':
    case 'sync': {
      if (obj.action === 'built') ++hmrEventCount
      if (obj.hash) {
        handleAvailableHash(obj.hash)
      }

      const { errors, warnings } = obj
      const hasErrors = Boolean(errors && errors.length)
      if (hasErrors) {
        return handleErrors(errors)
      }

      const hasWarnings = Boolean(warnings && warnings.length)
      if (hasWarnings) {
        return handleWarnings(warnings)
      }

      return handleSuccess()
    }
    case 'typeChecked': {
      const eventId = ++hmrEventCount

      const [{ errors }] = obj.data
      const hasErrors = Boolean(errors && errors.length)

      // Disregard event if there are no errors to report.
      if (!hasErrors) {
        // We need to _try_ dismissing the error overlay, as code may not have
        // changed, for example, when only types are updated.
        // n.b. `handleSuccess` only dismisses the overlay if code was updated.
        tryDismissErrorOverlay()
        break
      }

      function display() {
        // Another update has started, ignore type update:
        if (!canApplyUpdates() || eventId !== hmrEventCount) {
          return
        }

        // TypeScript errors to not take priority over compillation errors
        if (hasCompileErrors) {
          return
        }

        handleErrors(errors)
      }

      // We need to defer this until we're in an idle state.
      if (canApplyUpdates()) {
        display()
      } else {
        afterApplyUpdates(display)
      }

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
  return module.hot.status() === 'idle'
}
function afterApplyUpdates(fn) {
  if (canApplyUpdates()) {
    fn()
  } else {
    function handler(status) {
      if (status === 'idle') {
        module.hot.removeStatusHandler(handler)
        fn()
      }
    }
    module.hot.addStatusHandler(handler)
  }
}

// Attempt to update code on the fly, fall back to a hard reload.
function tryApplyUpdates(onHotUpdateSuccess) {
  if (!module.hot) {
    // HotModuleReplacementPlugin is not in Webpack configuration.
    console.error('HotModuleReplacementPlugin is not in Webpack configuration.')
    // window.location.reload();
    return
  }

  if (!isUpdateAvailable() || !canApplyUpdates()) {
    return
  }

  function handleApplyUpdates(err, updatedModules) {
    if (err || hadRuntimeError || !updatedModules) {
      if (err) {
        console.warn('Error while applying updates, reloading page', err)
      }
      if (hadRuntimeError) {
        console.warn('Had runtime error previously, reloading page')
      }
      window.location.reload()
      return
    }

    if (typeof onHotUpdateSuccess === 'function') {
      // Maybe we want to do something.
      onHotUpdateSuccess()
    }

    if (isUpdateAvailable()) {
      // While we were updating, there was a new update! Do it again.
      tryApplyUpdates()
    }
  }

  // https://webpack.js.org/api/hot-module-replacement/#check
  module.hot.check(/* autoApply */ true).then(
    updatedModules => {
      handleApplyUpdates(null, updatedModules)
    },
    err => {
      handleApplyUpdates(err, null)
    }
  )
}
