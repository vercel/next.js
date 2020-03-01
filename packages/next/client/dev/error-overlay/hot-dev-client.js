/* eslint-disable camelcase */
/**
MIT License

Copyright (c) 2013-present, Facebook, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
// This file is based on https://github.com/facebook/create-react-app/blob/v1.1.4/packages/react-dev-utils/webpackHotDevClient.js
// It's been edited to rely on webpack-hot-middleware and to be more compatible with SSR / Next.js

import { getEventSourceWrapper } from './eventsource'
import formatWebpackMessages from './format-webpack-messages'
import * as ErrorOverlay from 'react-error-overlay'
import stripAnsi from 'strip-ansi'
import { rewriteStacktrace } from './source-map-support'
import fetch from 'unfetch'

// This alternative WebpackDevServer combines the functionality of:
// https://github.com/webpack/webpack-dev-server/blob/webpack-1/client/index.js
// https://github.com/webpack/webpack/blob/webpack-1/hot/dev-server.js

// It only supports their simplest configuration (hot updates on same server).
// It makes some opinionated choices on top, like adding a syntax error overlay
// that looks similar to our console output. The error overlay is inspired by:
// https://github.com/glenjamin/webpack-hot-middleware

// This is a modified version of create-react-app's webpackHotDevClient.js
// It implements webpack-hot-middleware's EventSource events instead of webpack-dev-server's websocket.
// https://github.com/facebook/create-react-app/blob/25184c4e91ebabd16fe1cde3d8630830e4a36a01/packages/react-dev-utils/webpackHotDevClient.js

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
let deferredBuildError = null

function clearOutdatedErrors() {
  // Clean up outdated compile errors, if any.
  if (typeof console !== 'undefined' && typeof console.clear === 'function') {
    if (hasCompileErrors) {
      console.clear()
    }
  }

  deferredBuildError = null
}

// Successful compilation.
function handleSuccess() {
  const isHotUpdate = !isFirstCompilation
  isFirstCompilation = false
  hasCompileErrors = false

  // Attempt to apply hot updates or reload.
  if (isHotUpdate) {
    tryApplyUpdates(function onHotUpdateSuccess() {
      if (deferredBuildError) {
        deferredBuildError()
      } else {
        // Only dismiss it when we're sure it's a hot update.
        // Otherwise it would flicker right before the reload.
        ErrorOverlay.dismissBuildError()
      }
    })
  }
}

// Compilation with warnings (e.g. ESLint).
function handleWarnings(warnings) {
  clearOutdatedErrors()

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
      console.log(
        '[HMR] bundle ' + (obj.name ? "'" + obj.name + "' " : '') + 'rebuilding'
      )
      break
    }
    case 'built':
    case 'sync': {
      clearOutdatedErrors()

      if (obj.hash) {
        handleAvailableHash(obj.hash)
      }

      const { errors, warnings } = obj
      const hasErrors = Boolean(errors && errors.length)

      const hasWarnings = Boolean(warnings && warnings.length)

      if (hasErrors) {
        // When there is a compilation error coming from SSR we have to reload the page on next successful compile
        if (obj.action === 'sync') {
          hadRuntimeError = true
        }

        handleErrors(errors)
        break
      } else if (hasWarnings) {
        handleWarnings(warnings)
      }

      handleSuccess()
      break
    }
    case 'typeChecked': {
      const [{ errors, warnings }] = obj.data
      const hasErrors = Boolean(errors && errors.length)

      const hasWarnings = Boolean(warnings && warnings.length)

      if (hasErrors) {
        if (canApplyUpdates()) {
          handleErrors(errors)
        } else {
          deferredBuildError = () => handleErrors(errors)
        }
      } else if (hasWarnings) {
        handleWarnings(warnings)
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

// Attempt to update code on the fly, fall back to a hard reload.
async function tryApplyUpdates(onHotUpdateSuccess) {
  if (!module.hot) {
    // HotModuleReplacementPlugin is not in Webpack configuration.
    console.error('HotModuleReplacementPlugin is not in Webpack configuration.')
    // window.location.reload();
    return
  }

  if (!isUpdateAvailable() || !canApplyUpdates()) {
    ErrorOverlay.dismissBuildError()
    return
  }

  function handleApplyUpdates(err, updatedModules) {
    if (err || hadRuntimeError) {
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

  // https://webpack.github.io/docs/hot-module-replacement.html#check
  try {
    const updatedModules = await module.hot.check(
      /* autoApply */ {
        ignoreUnaccepted: true,
      }
    )
    if (updatedModules) {
      handleApplyUpdates(null, updatedModules)
    }
  } catch (err) {
    handleApplyUpdates(err, null)
  }
}
