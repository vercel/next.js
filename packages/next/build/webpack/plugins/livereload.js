/* jshint node:true */
import crypto from 'crypto'

import lr from 'tiny-lr'
import portfinder from 'portfinder'
import anymatch from 'anymatch'
const servers = {}

class LiveReloadPlugin {
  constructor(options) {
    this.options = options || {}
    this.defaultPort = 35729
    this.port =
      typeof this.options.port === 'number'
        ? this.options.port
        : this.defaultPort
    this.ignore = this.options.ignore || null
    this.quiet = this.options.quiet || false
    this.useSourceHash = this.options.useSourceHash || false
    // Random alphanumeric string appended to id to allow multiple instances of live reload
    this.instanceId = crypto.randomBytes(8).toString('hex')

    // add delay, but remove it from options, so it doesn't get passed to tinylr
    this.delay = this.options.delay || 0
    delete this.options.delay

    this.lastHash = null
    this.lastChildHashes = []
    this.protocol = this.options.protocol ? `${this.options.protocol}:` : ''
    this.hostname = this.options.hostname || '" + location.hostname + "'
    this.server = null
    this.sourceHashs = {}
  }

  get isRunning() {
    return !!this.server
  }

  start(watching, cb) {
    const quiet = this.quiet
    if (servers[this.port]) {
      this.server = servers[this.port]
      cb()
    } else {
      const listen = () => {
        this.server = servers[this.port] = lr(this.options)

        this.server.errorListener = function serverError(err) {
          console.error(`Live Reload disabled: ${err.message}`)
          if (err.code !== 'EADDRINUSE') {
            console.error(err.stack)
          }
          cb()
        }

        this.server.listen(
          this.port,
          function serverStarted(err) {
            if (!err && !quiet) {
              console.log(`Live Reload listening on port ${this.port}\n`)
            }
            cb()
          }.bind(this)
        )
      }

      if (this.port === 0) {
        portfinder.basePort = this.defaultPort
        portfinder.getPort(
          function portSearchDone(err, port) {
            if (err) {
              throw err
            }

            this.port = port

            listen()
          }.bind(this)
        )
      } else {
        listen()
      }
    }
  }

  done({ compilation }) {
    const hash = compilation.hash
    const childHashes = (compilation.children || []).map(child => child.hash)
    const include = Object.entries(compilation.assets)
      .filter(fileIgnoredOrNotEmitted.bind(this))
      .filter(fileHashDoesntMatches.bind(this))
      .map(data => {
        console.log('data', data)
        return data[0]
      })
    console.log(
      this.isRunning &&
        (hash !== this.lastHash ||
          !arraysEqual(childHashes, this.lastChildHashes))
    )
    if (
      this.isRunning &&
      (hash !== this.lastHash ||
        !arraysEqual(childHashes, this.lastChildHashes)) &&
      include.length > 0
    ) {
      this.lastHash = hash
      this.lastChildHashes = childHashes
      setTimeout(
        function onTimeout() {
          this.server.notifyClients(include)
        }.bind(this),
        this.delay
      )
    }
  }

  failed() {
    console.log('failed')
    this.lastHash = null
    this.lastChildHashes = []
  }

  autoloadJs() {
    return [
      '// webpack-livereload-plugin',
      '(function() {',
      '  if (typeof window === "undefined") { return };',
      `  var id = "webpack-livereload-plugin-script-${this.instanceId}";`,
      '  if (document.getElementById(id)) { return; }',
      '  var el = document.createElement("script");',
      '  el.id = id;',
      '  el.async = true;',
      `  el.src = "${this.protocol}//${this.hostname}:${this.port}/livereload.js";`,
      '  document.getElementsByTagName("head")[0].appendChild(el);',
      '}());',
      '',
      '// reset startup function so it can be called again when more startup code is added',
    ].join('\n')
  }

  scriptTag(src) {
    const source = src.source()
    const js = this.autoloadJs()
    if (this.options.appendScriptTag && this.isRunning) {
      return source.replace(
        '// reset startup function so it can be called again when more startup code is added',
        js
      )
    } else {
      return source
    }
  }

  applyCompilation(compilation) {
    const JavascriptModulesPlugin = require('webpack/lib/javascript/JavascriptModulesPlugin')
    const hooks = JavascriptModulesPlugin.getCompilationHooks(compilation)
    hooks.renderMain.tap('LiveReloadPlugin', this.scriptTag.bind(this))
  }

  apply(compiler) {
    this.compiler = compiler
    compiler.hooks.compilation.tap(
      'LiveReloadPlugin',
      this.applyCompilation.bind(this)
    )
    compiler.hooks.watchRun.tapAsync('LiveReloadPlugin', this.start.bind(this))
    compiler.hooks.afterDone.tap('LiveReloadPlugin', this.done.bind(this))
    compiler.hooks.failed.tap('LiveReloadPlugin', this.failed.bind(this))
  }
}

function arraysEqual(a1, a2) {
  return a1.length == a2.length && a1.every((v, i) => v === a2[i])
}

function generateHashCode(str) {
  const hash = crypto.createHash('sha256')
  hash.update(str)
  return hash.digest('hex')
}

function fileIgnoredOrNotEmitted(data) {
  if (Array.isArray(this.ignore)) {
    return !anymatch(this.ignore, data[0])
  }
  return !data[0].match(this.ignore)
}

function fileHashDoesntMatches(data) {
  if (!this.useSourceHash) return true

  const sourceHash = generateHashCode(data[1].source())
  if (
    this.sourceHashs.hasOwnProperty(data[0]) &&
    this.sourceHashs[data[0]] === sourceHash
  ) {
    return false
  }

  this.sourceHashs[data[0]] = sourceHash
  return true
}
export default LiveReloadPlugin
