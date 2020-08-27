/**
 * MIT License
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
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

// This file is copied from the Metro JavaScript bundler, with minor tweaks for
// webpack 4 compatibility.
//
// https://github.com/facebook/metro/blob/d6b9685c730d0d63577db40f41369157f28dfa3a/packages/metro/src/lib/polyfills/require.js

import RefreshRuntime from 'react-refresh/runtime'

declare const module: {
  hot: {
    status: () =>
      | 'idle'
      | 'check'
      | 'prepare'
      | 'ready'
      | 'dispose'
      | 'apply'
      | 'abort'
      | 'fail'
  }
}

function isSafeExport(key: string): boolean {
  return (
    key === '__esModule' ||
    key === '__N_SSG' ||
    key === '__N_SSP' ||
    // TODO: remove this key from page config instead of allow listing it
    key === 'config'
  )
}

function registerExportsForReactRefresh(
  moduleExports: unknown,
  moduleID: string
) {
  RefreshRuntime.register(moduleExports, moduleID + ' %exports%')
  if (moduleExports == null || typeof moduleExports !== 'object') {
    // Exit if we can't iterate over exports.
    // (This is important for legacy environments.)
    return
  }
  for (var key in moduleExports) {
    if (isSafeExport(key)) {
      continue
    }
    var exportValue = moduleExports[key]
    var typeID = moduleID + ' %exports% ' + key
    RefreshRuntime.register(exportValue, typeID)
  }
}

function isReactRefreshBoundary(moduleExports: unknown): boolean {
  if (RefreshRuntime.isLikelyComponentType(moduleExports)) {
    return true
  }
  if (moduleExports == null || typeof moduleExports !== 'object') {
    // Exit if we can't iterate over exports.
    return false
  }
  var hasExports = false
  var areAllExportsComponents = true
  for (var key in moduleExports) {
    hasExports = true
    if (isSafeExport(key)) {
      continue
    }
    var exportValue = moduleExports[key]
    if (!RefreshRuntime.isLikelyComponentType(exportValue)) {
      areAllExportsComponents = false
    }
  }
  return hasExports && areAllExportsComponents
}

function shouldInvalidateReactRefreshBoundary(
  prevExports: unknown,
  nextExports: unknown
): boolean {
  var prevSignature = getRefreshBoundarySignature(prevExports)
  var nextSignature = getRefreshBoundarySignature(nextExports)
  if (prevSignature.length !== nextSignature.length) {
    return true
  }
  for (var i = 0; i < nextSignature.length; i++) {
    if (prevSignature[i] !== nextSignature[i]) {
      return true
    }
  }
  return false
}

function getRefreshBoundarySignature(moduleExports: unknown): Array<unknown> {
  var signature = []
  signature.push(RefreshRuntime.getFamilyByType(moduleExports))
  if (moduleExports == null || typeof moduleExports !== 'object') {
    // Exit if we can't iterate over exports.
    // (This is important for legacy environments.)
    return signature
  }
  for (var key in moduleExports) {
    if (isSafeExport(key)) {
      continue
    }
    var exportValue = moduleExports[key]
    signature.push(key)
    signature.push(RefreshRuntime.getFamilyByType(exportValue))
  }
  return signature
}

var isUpdateScheduled: boolean = false
function scheduleUpdate() {
  if (isUpdateScheduled) {
    return
  }

  function canApplyUpdate() {
    return module.hot.status() === 'idle'
  }

  isUpdateScheduled = true
  setTimeout(function () {
    isUpdateScheduled = false

    // Only trigger refresh if the webpack HMR state is idle
    if (canApplyUpdate()) {
      try {
        RefreshRuntime.performReactRefresh()
      } catch (err) {
        console.warn(
          'Warning: Failed to re-render. We will retry on the next Fast Refresh event.\n' +
            err
        )
      }
      return
    }

    return scheduleUpdate()
  }, 30)
}

// Needs to be compatible with IE11
export default {
  registerExportsForReactRefresh: registerExportsForReactRefresh,
  isReactRefreshBoundary: isReactRefreshBoundary,
  shouldInvalidateReactRefreshBoundary: shouldInvalidateReactRefreshBoundary,
  getRefreshBoundarySignature: getRefreshBoundarySignature,
  scheduleUpdate: scheduleUpdate,
}
