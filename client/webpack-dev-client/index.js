/* global __resourceQuery, next, self */

// Based on 'webpack-dev-server/client'

import url from 'url'
import stripAnsi from 'strip-ansi'
import socket from './socket'

function getCurrentScriptSource () {
  // `document.currentScript` is the most accurate way to find the current script,
  // but is not supported in all browsers.
  if (document.currentScript) {
    return document.currentScript.getAttribute('src')
  }
  // Fall back to getting all scripts in the document.
  const scriptElements = document.scripts || []
  const currentScript = scriptElements[scriptElements.length - 1]
  if (currentScript) {
    return currentScript.getAttribute('src')
  }
  // Fail as there was no script to use.
  throw new Error('[WDS] Failed to get current script source')
}

let urlParts
if (typeof __resourceQuery === 'string' && __resourceQuery) {
  // If this bundle is inlined, use the resource query to get the correct url.
  urlParts = url.parse(__resourceQuery.substr(1))
} else {
  // Else, get the url from the <script> this file was called with.
  let scriptHost = getCurrentScriptSource()
  scriptHost = scriptHost.replace(/\/[^\/]+$/, '')
  urlParts = url.parse(scriptHost || '/', false, true)
}

let hot = false
let initial = true
let currentHash = ''
let logLevel = 'info'

function log (level, msg) {
  if (logLevel === 'info' && level === 'info') {
    return console.log(msg)
  }
  if (['info', 'warning'].indexOf(logLevel) >= 0 && level === 'warning') {
    return console.warn(msg)
  }
  if (['info', 'warning', 'error'].indexOf(logLevel) >= 0 && level === 'error') {
    return console.error(msg)
  }
}

// Send messages to the outside, so plugins can consume it.
function sendMsg (type, data) {
  if (typeof self !== 'undefined') {
    self.postMessage({
      type: 'webpack' + type,
      data: data
    }, '*')
  }
}

const onSocketMsg = {
  hot () {
    hot = true
    log('info', '[WDS] Hot Module Replacement enabled.')
  },
  invalid () {
    log('info', '[WDS] App updated. Recompiling...')
    sendMsg('Invalid')
  },
  hash (hash) {
    currentHash = hash
  },
  'still-ok' () {
    log('info', '[WDS] Nothing changed.')
    sendMsg('StillOk')
  },
  'log-level' (level) {
    logLevel = level
  },
  ok () {
    sendMsg('Ok')
    if (initial) {
      initial = false
      return
    }
    reloadApp()
  },
  'content-changed' () {
    log('info', '[WDS] Content base changed. Reloading...')
    self.location.reload()
  },
  warnings (warnings) {
    log('info', '[WDS] Warnings while compiling. Reload prevented.')
    const strippedWarnings = warnings.map((warning) => {
      return stripAnsi(warning)
    })
    sendMsg('Warnings', strippedWarnings)
    for (let i = 0; i < strippedWarnings.length; i++) {
      console.warn(strippedWarnings[i])
    }
  },
  errors (errors) {
    log('info', '[WDS] Errors while compiling. Reload prevented.')
    const strippedErrors = errors.map((error) => {
      return stripAnsi(error)
    })
    sendMsg('Errors', strippedErrors)
    for (let i = 0; i < strippedErrors.length; i++) {
      console.error(strippedErrors[i])
    }
  },
  reload (route) {
    if (route === '/_error') {
      for (const r of Object.keys(next.router.components)) {
        const { Component } = next.router.components[r]
        if (Component.__route === '/_error-debug') {
          // reload all '/_error-debug'
          // which are expected to be errors of '/_error' routes
          next.router.reload(r)
        }
      }
      return
    }

    next.router.reload(route)
  },
  close () {
    log('error', '[WDS] Disconnected!')
    sendMsg('Close')
  }
}

let hostname = urlParts.hostname
let protocol = urlParts.protocol

// check ipv4 and ipv6 `all hostname`
if (hostname === '0.0.0.0' || hostname === '::') {
  // why do we need this check?
  // hostname n/a for file protocol (example, when using electron, ionic)
  // see: https://github.com/webpack/webpack-dev-server/pull/384
  if (self.location.hostname && !!~self.location.protocol.indexOf('http')) {
    hostname = self.location.hostname
  }
}

// `hostname` can be empty when the script path is relative. In that case, specifying
// a protocol would result in an invalid URL.
// When https is used in the app, secure websockets are always necessary
// because the browser doesn't accept non-secure websockets.
if (hostname && (self.location.protocol === 'https:' || urlParts.hostname === '0.0.0.0')) {
  protocol = self.location.protocol
}

const socketUrl = url.format({
  protocol,
  auth: urlParts.auth,
  hostname,
  port: (urlParts.port === '0') ? self.location.port : urlParts.port,
  pathname: urlParts.path == null || urlParts.path === '/' ? '/sockjs-node' : urlParts.path
})

socket(socketUrl, onSocketMsg)

function reloadApp () {
  if (hot) {
    log('info', '[WDS] App hot update...')
    const hotEmitter = require('webpack/hot/emitter')
    hotEmitter.emit('webpackHotUpdate', currentHash)
    if (typeof self !== 'undefined') {
      // broadcast update to window
      self.postMessage('webpackHotUpdate' + currentHash, '*')
    }
  } else {
    log('info', '[WDS] App updated. Reloading...')
    self.location.reload()
  }
}
