/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
// eslint-disable no-unused-vars
var $hash$ = undefined
var $requestTimeout$ = undefined
var installedModules = undefined
var $require$ = undefined
var hotDownloadManifest = undefined
var hotDownloadUpdateChunk = undefined
var hotDisposeChunk = undefined
var modules = undefined
var chunkId = undefined

module.exports = function() {
  var hotApplyOnUpdate = true
  // eslint-disable-next-line no-unused-vars
  var hotCurrentHash = $hash$
  var hotRequestTimeout = $requestTimeout$
  var hotCurrentModuleData = {}
  var hotCurrentChildModule
  // eslint-disable-next-line no-unused-vars
  var hotCurrentParents = []
  // eslint-disable-next-line no-unused-vars
  var hotCurrentParentsTemp = []

  // eslint-disable-next-line no-unused-vars
  function hotCreateRequire(moduleId) {
    var me = installedModules[moduleId]
    if (!me) return $require$
    var fn = function(request) {
      if (me.hot.active) {
        if (installedModules[request]) {
          if (installedModules[request].parents.indexOf(moduleId) === -1) {
            installedModules[request].parents.push(moduleId)
          }
        } else {
          hotCurrentParents = [moduleId]
          hotCurrentChildModule = request
        }
        if (me.children.indexOf(request) === -1) {
          me.children.push(request)
        }
      } else {
        console.warn(
          '[HMR] unexpected require(' +
            request +
            ') from disposed module ' +
            moduleId
        )
        hotCurrentParents = []
      }
      return $require$(request)
    }
    var ObjectFactory = function ObjectFactory(name) {
      return {
        configurable: true,
        enumerable: true,
        get: function() {
          return $require$[name]
        },
        set: function(value) {
          $require$[name] = value
        },
      }
    }
    for (var name in $require$) {
      if (
        Object.prototype.hasOwnProperty.call($require$, name) &&
        name !== 'e' &&
        name !== 't'
      ) {
        Object.defineProperty(fn, name, ObjectFactory(name))
      }
    }
    fn.e = function(chunkId) {
      if (hotStatus === 'ready') hotSetStatus('prepare')
      hotChunksLoading++
      return $require$.e(chunkId).then(finishChunkLoading, function(err) {
        finishChunkLoading()
        throw err
      })

      function finishChunkLoading() {
        hotChunksLoading--
        if (hotStatus === 'prepare') {
          if (!hotWaitingFilesMap[chunkId]) {
            hotEnsureUpdateChunk(chunkId)
          }
          if (hotChunksLoading === 0 && hotWaitingFiles === 0) {
            hotUpdateDownloaded()
          }
        }
      }
    }
    fn.t = function(value, mode) {
      if (mode & 1) value = fn(value)
      return $require$.t(value, mode & ~1)
    }
    return fn
  }

  // eslint-disable-next-line no-unused-vars
  function hotCreateModule(moduleId) {
    var hot = {
      // private stuff
      _acceptedDependencies: {},
      _declinedDependencies: {},
      _selfAccepted: false,
      _selfDeclined: false,
      _selfInvalidated: false,
      _disposeHandlers: [],
      _main: hotCurrentChildModule !== moduleId,

      // Module API
      active: true,
      accept: function(dep, callback) {
        if (dep === undefined) hot._selfAccepted = true
        else if (typeof dep === 'function') hot._selfAccepted = dep
        else if (typeof dep === 'object')
          for (var i = 0; i < dep.length; i++)
            hot._acceptedDependencies[dep[i]] = callback || function() {}
        else hot._acceptedDependencies[dep] = callback || function() {}
      },
      decline: function(dep) {
        if (dep === undefined) hot._selfDeclined = true
        else if (typeof dep === 'object')
          for (var i = 0; i < dep.length; i++)
            hot._declinedDependencies[dep[i]] = true
        else hot._declinedDependencies[dep] = true
      },
      dispose: function(callback) {
        hot._disposeHandlers.push(callback)
      },
      addDisposeHandler: function(callback) {
        hot._disposeHandlers.push(callback)
      },
      removeDisposeHandler: function(callback) {
        var idx = hot._disposeHandlers.indexOf(callback)
        if (idx >= 0) hot._disposeHandlers.splice(idx, 1)
      },
      invalidate: function() {
        this._selfInvalidated = true
        switch (hotStatus) {
          case 'idle':
            hotUpdate = {}
            hotUpdate[moduleId] = modules[moduleId]
            hotSetStatus('ready')
            break
          case 'ready':
            hotApplyInvalidatedModule(moduleId)
            break
          case 'prepare':
          case 'check':
          case 'dispose':
          case 'apply':
            ;(hotQueuedInvalidatedModules =
              hotQueuedInvalidatedModules || []).push(moduleId)
            break
          default:
            // ignore requests in error states
            break
        }
      },

      // Management API
      check: hotCheck,
      apply: hotApply,
      status: function(l) {
        if (!l) return hotStatus
        hotStatusHandlers.push(l)
      },
      addStatusHandler: function(l) {
        hotStatusHandlers.push(l)
      },
      removeStatusHandler: function(l) {
        var idx = hotStatusHandlers.indexOf(l)
        if (idx >= 0) hotStatusHandlers.splice(idx, 1)
      },

      //inherit from previous dispose call
      data: hotCurrentModuleData[moduleId],
    }
    hotCurrentChildModule = undefined
    return hot
  }

  var hotStatusHandlers = []
  var hotStatus = 'idle'

  function hotSetStatus(newStatus) {
    hotStatus = newStatus
    for (var i = 0; i < hotStatusHandlers.length; i++)
      hotStatusHandlers[i].call(null, newStatus)
  }

  // while downloading
  var hotWaitingFiles = 0
  var hotChunksLoading = 0
  var hotWaitingFilesMap = {}
  var hotRequestedFilesMap = {}
  var hotAvailableFilesMap = {}
  var hotDeferred

  // The update info
  var hotUpdate, hotUpdateNewHash, hotQueuedInvalidatedModules

  function toModuleId(id) {
    var isNumber = +id + '' === id
    return isNumber ? +id : id
  }

  function hotCheck(apply) {
    if (hotStatus !== 'idle') {
      throw new Error('check() is only allowed in idle status')
    }
    hotApplyOnUpdate = apply
    hotSetStatus('check')
    return hotDownloadManifest(hotRequestTimeout).then(function(update) {
      if (!update) {
        hotSetStatus(hotApplyInvalidatedModules() ? 'ready' : 'idle')
        return null
      }
      hotRequestedFilesMap = {}
      hotWaitingFilesMap = {}
      hotAvailableFilesMap = update.c
      hotUpdateNewHash = update.h

      hotSetStatus('prepare')
      var promise = new Promise(function(resolve, reject) {
        hotDeferred = {
          resolve: resolve,
          reject: reject,
        }
      })
      hotUpdate = {}
      /*foreachInstalledChunks*/
      // eslint-disable-next-line no-lone-blocks
      {
        hotEnsureUpdateChunk(chunkId)
      }
      if (
        hotStatus === 'prepare' &&
        hotChunksLoading === 0 &&
        hotWaitingFiles === 0
      ) {
        hotUpdateDownloaded()
      }
      return promise
    })
  }

  // eslint-disable-next-line no-unused-vars
  function hotAddUpdateChunk(chunkId, moreModules) {
    if (!hotAvailableFilesMap[chunkId] || !hotRequestedFilesMap[chunkId]) return
    hotRequestedFilesMap[chunkId] = false
    for (var moduleId in moreModules) {
      if (Object.prototype.hasOwnProperty.call(moreModules, moduleId)) {
        hotUpdate[moduleId] = moreModules[moduleId]
      }
    }
    if (--hotWaitingFiles === 0 && hotChunksLoading === 0) {
      hotUpdateDownloaded()
    }
  }

  function hotEnsureUpdateChunk(chunkId) {
    if (!hotAvailableFilesMap[chunkId]) {
      hotWaitingFilesMap[chunkId] = true
    } else {
      hotRequestedFilesMap[chunkId] = true
      hotWaitingFiles++
      hotDownloadUpdateChunk(chunkId)
    }
  }

  function hotUpdateDownloaded() {
    hotSetStatus('ready')
    var deferred = hotDeferred
    hotDeferred = null
    if (!deferred) return
    if (hotApplyOnUpdate) {
      // Wrap deferred object in Promise to mark it as a well-handled Promise to
      // avoid triggering uncaught exception warning in Chrome.
      // See https://bugs.chromium.org/p/chromium/issues/detail?id=465666
      Promise.resolve()
        .then(function() {
          return hotApply(hotApplyOnUpdate)
        })
        .then(
          function(result) {
            deferred.resolve(result)
          },
          function(err) {
            deferred.reject(err)
          }
        )
    } else {
      var outdatedModules = []
      for (var id in hotUpdate) {
        if (Object.prototype.hasOwnProperty.call(hotUpdate, id)) {
          outdatedModules.push(toModuleId(id))
        }
      }
      deferred.resolve(outdatedModules)
    }
  }

  function hotApply(options) {
    if (hotStatus !== 'ready')
      throw new Error('apply() is only allowed in ready status')
    options = options || {}
    return hotApplyInternal(options)
  }

  function hotApplyInternal(options) {
    hotApplyInvalidatedModules()

    var cb
    var i
    var j
    var module
    var moduleId

    function getAffectedStuff(updateModuleId) {
      var outdatedModules = [updateModuleId]
      var outdatedDependencies = {}

      var queue = outdatedModules.map(function(id) {
        return {
          chain: [id],
          id: id,
        }
      })
      while (queue.length > 0) {
        var queueItem = queue.pop()
        var moduleId = queueItem.id
        var chain = queueItem.chain
        module = installedModules[moduleId]
        if (
          !module ||
          (module.hot._selfAccepted && !module.hot._selfInvalidated)
        )
          continue
        if (module.hot._selfDeclined) {
          return {
            type: 'self-declined',
            chain: chain,
            moduleId: moduleId,
          }
        }
        if (module.hot._main) {
          return {
            type: 'unaccepted',
            chain: chain,
            moduleId: moduleId,
          }
        }
        for (var i = 0; i < module.parents.length; i++) {
          var parentId = module.parents[i]
          var parent = installedModules[parentId]
          if (!parent) continue
          if (parent.hot._declinedDependencies[moduleId]) {
            return {
              type: 'declined',
              chain: chain.concat([parentId]),
              moduleId: moduleId,
              parentId: parentId,
            }
          }
          if (outdatedModules.indexOf(parentId) !== -1) continue
          if (parent.hot._acceptedDependencies[moduleId]) {
            if (!outdatedDependencies[parentId])
              outdatedDependencies[parentId] = []
            addAllToSet(outdatedDependencies[parentId], [moduleId])
            continue
          }
          delete outdatedDependencies[parentId]
          outdatedModules.push(parentId)
          queue.push({
            chain: chain.concat([parentId]),
            id: parentId,
          })
        }
      }

      return {
        type: 'accepted',
        moduleId: updateModuleId,
        outdatedModules: outdatedModules,
        outdatedDependencies: outdatedDependencies,
      }
    }

    function addAllToSet(a, b) {
      for (var i = 0; i < b.length; i++) {
        var item = b[i]
        if (a.indexOf(item) === -1) a.push(item)
      }
    }

    // at begin all updates modules are outdated
    // the "outdated" status can propagate to parents if they don't accept the children
    var outdatedDependencies = {}
    var outdatedModules = []
    var appliedUpdate = {}

    var warnUnexpectedRequire = function warnUnexpectedRequire() {
      console.warn(
        '[HMR] unexpected require(' + result.moduleId + ') to disposed module'
      )
    }

    for (var id in hotUpdate) {
      if (Object.prototype.hasOwnProperty.call(hotUpdate, id)) {
        moduleId = toModuleId(id)
        /** @type {TODO} */
        var result
        if (hotUpdate[id]) {
          result = getAffectedStuff(moduleId)
        } else {
          result = {
            type: 'disposed',
            moduleId: id,
          }
        }
        /** @type {Error|false} */
        var abortError = false
        var doApply = false
        var doDispose = false
        var chainInfo = ''
        if (result.chain) {
          chainInfo = '\nUpdate propagation: ' + result.chain.join(' -> ')
        }
        switch (result.type) {
          case 'self-declined':
            if (options.onDeclined) options.onDeclined(result)
            if (!options.ignoreDeclined)
              abortError = new Error(
                'Aborted because of self decline: ' +
                  result.moduleId +
                  chainInfo
              )
            break
          case 'declined':
            if (options.onDeclined) options.onDeclined(result)
            if (!options.ignoreDeclined)
              abortError = new Error(
                'Aborted because of declined dependency: ' +
                  result.moduleId +
                  ' in ' +
                  result.parentId +
                  chainInfo
              )
            break
          case 'unaccepted':
            if (options.onUnaccepted) options.onUnaccepted(result)
            if (!options.ignoreUnaccepted)
              abortError = new Error(
                'Aborted because ' + moduleId + ' is not accepted' + chainInfo
              )
            break
          case 'accepted':
            if (options.onAccepted) options.onAccepted(result)
            doApply = true
            break
          case 'disposed':
            if (options.onDisposed) options.onDisposed(result)
            doDispose = true
            break
          default:
            throw new Error('Unexception type ' + result.type)
        }
        if (abortError) {
          hotSetStatus('abort')
          return Promise.reject(abortError)
        }
        if (doApply) {
          appliedUpdate[moduleId] = hotUpdate[moduleId]
          addAllToSet(outdatedModules, result.outdatedModules)
          for (moduleId in result.outdatedDependencies) {
            if (
              Object.prototype.hasOwnProperty.call(
                result.outdatedDependencies,
                moduleId
              )
            ) {
              if (!outdatedDependencies[moduleId])
                outdatedDependencies[moduleId] = []
              addAllToSet(
                outdatedDependencies[moduleId],
                result.outdatedDependencies[moduleId]
              )
            }
          }
        }
        if (doDispose) {
          addAllToSet(outdatedModules, [result.moduleId])
          appliedUpdate[moduleId] = warnUnexpectedRequire
        }
      }
    }

    // Store self accepted outdated modules to require them later by the module system
    var outdatedSelfAcceptedModules = []
    for (i = 0; i < outdatedModules.length; i++) {
      moduleId = outdatedModules[i]
      if (
        installedModules[moduleId] &&
        installedModules[moduleId].hot._selfAccepted &&
        // removed self-accepted modules should not be required
        appliedUpdate[moduleId] !== warnUnexpectedRequire &&
        // when called invalidate self-accepting is not possible
        !installedModules[moduleId].hot._selfInvalidated
      ) {
        outdatedSelfAcceptedModules.push({
          module: moduleId,
          parents: installedModules[moduleId].parents.slice(),
          errorHandler: installedModules[moduleId].hot._selfAccepted,
        })
      }
    }

    // Now in "dispose" phase
    hotSetStatus('dispose')
    Object.keys(hotAvailableFilesMap).forEach(function(chunkId) {
      if (hotAvailableFilesMap[chunkId] === false) {
        hotDisposeChunk(chunkId)
      }
    })

    var idx
    var queue = outdatedModules.slice()
    while (queue.length > 0) {
      moduleId = queue.pop()
      module = installedModules[moduleId]
      if (!module) continue

      var data = {}

      // Call dispose handlers
      var disposeHandlers = module.hot._disposeHandlers
      for (j = 0; j < disposeHandlers.length; j++) {
        cb = disposeHandlers[j]
        cb(data)
      }
      hotCurrentModuleData[moduleId] = data

      // disable module (this disables requires from this module)
      module.hot.active = false

      // remove module from cache
      delete installedModules[moduleId]

      // when disposing there is no need to call dispose handler
      delete outdatedDependencies[moduleId]

      // remove "parents" references from all children
      for (j = 0; j < module.children.length; j++) {
        var child = installedModules[module.children[j]]
        if (!child) continue
        idx = child.parents.indexOf(moduleId)
        if (idx >= 0) {
          child.parents.splice(idx, 1)
        }
      }
    }

    // remove outdated dependency from module children
    var dependency
    var moduleOutdatedDependencies
    for (moduleId in outdatedDependencies) {
      if (
        Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId)
      ) {
        module = installedModules[moduleId]
        if (module) {
          moduleOutdatedDependencies = outdatedDependencies[moduleId]
          for (j = 0; j < moduleOutdatedDependencies.length; j++) {
            dependency = moduleOutdatedDependencies[j]
            idx = module.children.indexOf(dependency)
            if (idx >= 0) module.children.splice(idx, 1)
          }
        }
      }
    }

    // Now in "apply" phase
    hotSetStatus('apply')

    if (hotUpdateNewHash !== undefined) {
      hotCurrentHash = hotUpdateNewHash
      hotUpdateNewHash = undefined
    }
    hotUpdate = undefined

    // insert new code
    for (moduleId in appliedUpdate) {
      if (Object.prototype.hasOwnProperty.call(appliedUpdate, moduleId)) {
        modules[moduleId] = appliedUpdate[moduleId]
      }
    }

    // call accept handlers
    var error = null
    for (moduleId in outdatedDependencies) {
      if (
        Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId)
      ) {
        module = installedModules[moduleId]
        if (module) {
          moduleOutdatedDependencies = outdatedDependencies[moduleId]
          var callbacks = []
          for (i = 0; i < moduleOutdatedDependencies.length; i++) {
            dependency = moduleOutdatedDependencies[i]
            cb = module.hot._acceptedDependencies[dependency]
            if (cb) {
              if (callbacks.indexOf(cb) !== -1) continue
              callbacks.push(cb)
            }
          }
          for (i = 0; i < callbacks.length; i++) {
            cb = callbacks[i]
            try {
              cb(moduleOutdatedDependencies)
            } catch (err) {
              if (options.onErrored) {
                options.onErrored({
                  type: 'accept-errored',
                  moduleId: moduleId,
                  dependencyId: moduleOutdatedDependencies[i],
                  error: err,
                })
              }
              if (!options.ignoreErrored) {
                if (!error) error = err
              }
            }
          }
        }
      }
    }

    // Load self accepted modules
    for (i = 0; i < outdatedSelfAcceptedModules.length; i++) {
      var item = outdatedSelfAcceptedModules[i]
      moduleId = item.module
      hotCurrentParents = item.parents
      hotCurrentChildModule = moduleId
      try {
        $require$(moduleId)
      } catch (err) {
        if (typeof item.errorHandler === 'function') {
          try {
            item.errorHandler(err)
          } catch (err2) {
            if (options.onErrored) {
              options.onErrored({
                type: 'self-accept-error-handler-errored',
                moduleId: moduleId,
                error: err2,
                originalError: err,
              })
            }
            if (!options.ignoreErrored) {
              if (!error) error = err2
            }
            if (!error) error = err
          }
        } else {
          if (options.onErrored) {
            options.onErrored({
              type: 'self-accept-errored',
              moduleId: moduleId,
              error: err,
            })
          }
          if (!options.ignoreErrored) {
            if (!error) error = err
          }
        }
      }
    }

    // handle errors in accept handlers and self accepted module load
    if (error) {
      hotSetStatus('fail')
      return Promise.reject(error)
    }

    if (hotQueuedInvalidatedModules) {
      return hotApplyInternal(options).then(function(list) {
        outdatedModules.forEach(function(moduleId) {
          if (list.indexOf(moduleId) < 0) list.push(moduleId)
        })
        return list
      })
    }

    hotSetStatus('idle')
    return new Promise(function(resolve) {
      resolve(outdatedModules)
    })
  }

  function hotApplyInvalidatedModules() {
    if (hotQueuedInvalidatedModules) {
      if (!hotUpdate) hotUpdate = {}
      hotQueuedInvalidatedModules.forEach(hotApplyInvalidatedModule)
      hotQueuedInvalidatedModules = undefined
      return true
    }
  }

  function hotApplyInvalidatedModule(moduleId) {
    if (!Object.prototype.hasOwnProperty.call(hotUpdate, moduleId))
      hotUpdate[moduleId] = modules[moduleId]
  }
}
