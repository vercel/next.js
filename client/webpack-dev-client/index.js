/* global __resourceQuery, next */

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

const onSocketMsg = {
  hot () {
    hot = true
    log('info', '[WDS] Hot Module Replacement enabled.')
  },
  invalid () {
    log('info', '[WDS] App updated. Recompiling...')
  },
  hash (hash) {
    currentHash = hash
  },
  'still-ok': () => {
    log('info', '[WDS] Nothing changed.')
  },
  'log-level': (level) => {
    logLevel = level
  },
  ok () {
    if (initial) {
      initial = false
      return
    }
    reloadApp()
  },
  warnings (warnings) {
    log('info', '[WDS] Warnings while compiling.')
    for (let i = 0; i < warnings.length; i++) {
      console.warn(stripAnsi(warnings[i]))
    }
    if (initial) {
      initial = false
      return
    }
    reloadApp()
  },
  errors (errors) {
    log('info', '[WDS] Errors while compiling.')
    for (let i = 0; i < errors.length; i++) {
      console.error(stripAnsi(errors[i]))
    }
    if (initial) {
      initial = false
      return
    }
    reloadApp()
  },
  'proxy-error': (errors) => {
    log('info', '[WDS] Proxy error.')
    for (let i = 0; i < errors.length; i++) {
      log('error', stripAnsi(errors[i]))
    }
    if (initial) {
      initial = false
      return
    }
  },
  reload (route) {
    next.router.reload(route)
  },
  close () {
    log('error', '[WDS] Disconnected!')
  }
}

let hostname = urlParts.hostname
let protocol = urlParts.protocol

if (urlParts.hostname === '0.0.0.0') {
  // why do we need this check?
  // hostname n/a for file protocol (example, when using electron, ionic)
  // see: https://github.com/webpack/webpack-dev-server/pull/384
  if (window.location.hostname && !!~window.location.protocol.indexOf('http')) {
    hostname = window.location.hostname
  }
}

// `hostname` can be empty when the script path is relative. In that case, specifying
// a protocol would result in an invalid URL.
// When https is used in the app, secure websockets are always necessary
// because the browser doesn't accept non-secure websockets.
if (hostname && (window.location.protocol === 'https:' || urlParts.hostname === '0.0.0.0')) {
  protocol = window.location.protocol
}

const socketUrl = url.format({
  protocol,
  auth: urlParts.auth,
  hostname,
  port: (urlParts.port === '0') ? window.location.port : urlParts.port,
  pathname: urlParts.path == null || urlParts.path === '/' ? '/sockjs-node' : urlParts.path
})

socket(socketUrl, onSocketMsg)

function reloadApp () {
  if (hot) {
    log('info', '[WDS] App hot update...')
    window.postMessage('webpackHotUpdate' + currentHash, '*')
  } else {
    log('info', '[WDS] App updated. Reloading...')
    window.location.reload()
  }
}
