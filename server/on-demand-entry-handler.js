import { EventEmitter } from 'events'
import { join } from 'path'
import fs from 'fs'
import { normalizePageEntryName } from './utils'

const BUILDING = Symbol('building')
const BUILT = Symbol('built')

export default function onDemandEntryHandler (devMiddleware, webpackCompiler, babelCompiler, {
  dir,
  dev,
  maxInactiveAge = 1000 * 25,
  pagesBufferLength = 2
}) {
  let entries = {}
  let doneCallbacks = new EventEmitter()
  const invalidator = new Invalidator(devMiddleware, webpackCompiler)
  let reloading = false
  let stopped = false
  let reloadCallbacks = new EventEmitter()

  webpackCompiler.hooks.done.tap('onDemandEntryHandler', function (stats) {
    // Call all the doneCallbacks
    Object.keys(entries).forEach((page) => {
      const entryInfo = entries[page]
      if (entryInfo.status !== BUILDING) return

      entryInfo.status = BUILT
      doneCallbacks.emit(page)
    })

    invalidator.doneBuilding()
  })

  return {
    waitUntilReloaded () {
      if (!reloading) return Promise.resolve(true)
      return new Promise((resolve) => {
        reloadCallbacks.once('done', function () {
          resolve()
        })
      })
    },

    async ensureAllPages () {
      await this.waitUntilReloaded()

      const wait = Promise.all(
        fs.readdirSync(join(dir, 'pages'))
          .filter((file) => /\.js$/.test(file) && !/^_/.test(file))
          .map((file) => `/${file.replace(/\.js$/, '')}`)
          .map(normalizePage)
          .map((page) => {
            const pagePath = join(dir, 'pages', page)
            const pathname = require.resolve(pagePath)
            const name = normalizePageEntryName(pathname, dir)

            const entry = [`${pathname}`]

            return new Promise((resolve, reject) => {
              const entryInfo = entries[page]
              if (entryInfo) {
                if (entryInfo.status === BUILT) {
                  resolve()
                  return
                }

                if (entryInfo.status === BUILDING) {
                  doneCallbacks.on(page, processCallback)
                  return
                }
              }

              babelCompiler.setEntry(name, pathname)
              webpackCompiler.setEntry(name, pathname)
              entries[page] = { name, entry, pathname, status: BUILDING }
              doneCallbacks.on(page, processCallback)

              function processCallback (err) {
                if (err) return reject(err)
                resolve()
              }
            })
          })
      )

      console.log(`> Building all pages`)

      invalidator.invalidate()
      return wait
    },

    async ensurePage (page) {
      await this.waitUntilReloaded()
      page = normalizePage(page)

      const pagePath = join(dir, 'pages', page)
      const pathname = require.resolve(pagePath)
      const name = normalizePageEntryName(pathname, dir)

      const entry = [pathname]

      await new Promise((resolve, reject) => {
        const entryInfo = entries[page]

        if (entryInfo) {
          if (entryInfo.status === BUILT) {
            resolve()
            return
          }

          if (entryInfo.status === BUILDING) {
            doneCallbacks.on(page, processCallback)
            return
          }
        }

        console.log(`> Building page: ${page}`)

        webpackCompiler.setEntry(name, pathname)
        babelCompiler.setEntry(name, pathname)
        entries[page] = { name, entry, pathname, status: BUILDING }
        doneCallbacks.on(page, processCallback)

        invalidator.invalidate()

        function processCallback (err) {
          if (err) return reject(err)
          resolve()
        }
      })
    },

    middleware () {
      return (req, res, next) => {
        if (stopped) {
          // If this handler is stopped, we need to reload the user's browser.
          // So the user could connect to the actually running handler.
          res.statusCode = 302
          res.setHeader('Location', req.url)
          res.end('302')
        } else if (reloading) {
          // Webpack config is reloading. So, we need to wait until it's done and
          // reload user's browser.
          // So the user could connect to the new handler and webpack setup.
          this.waitUntilReloaded()
            .then(() => {
              res.statusCode = 302
              res.setHeader('Location', req.url)
              res.end('302')
            })
        } else {
          return next()
        }
      }
    }
  }
}

// /index and / is the same. So, we need to identify both pages as the same.
// This also applies to sub pages as well.
function normalizePage (page) {
  return page.replace(/\.js$/, '').replace(/\/index$/, '/')
}

// Make sure only one invalidation happens at a time
// Otherwise, webpack hash gets changed and it'll force the client to reload.
class Invalidator {
  constructor (devMiddleware, webpackCompiler) {
    this.devMiddleware = devMiddleware
    this.webpackCompiler = webpackCompiler
    this.building = false
    this.rebuildAgain = false

    webpackCompiler.hooks.make.tap('onDemandEntryHandler', () => {
      console.log(`Rebuilding ${webpackCompiler.name}`)
      this.startBuilding()
    })
  }

  invalidate () {
    // If there's a current build is processing, we won't abort it by invalidating.
    // (If aborted, it'll cause a client side hard reload)
    // But let it to invalidate just after the completion.
    // So, it can re-build the queued pages at once.
    if (this.building) {
      this.rebuildAgain = true
      return
    }

    this.devMiddleware.invalidate()
  }

  startBuilding () {
    this.building = true
  }

  doneBuilding () {
    this.building = false
    if (this.rebuildAgain) {
      this.rebuildAgain = false
      this.invalidate()
    }
  }
}
