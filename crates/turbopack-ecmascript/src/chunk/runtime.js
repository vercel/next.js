;(() => {
  if (Array.isArray(self.TURBOPACK)) {
    var array = self.TURBOPACK
    var chunks = new Set()
    var runnable = []
    var modules = { __proto__: null }
    var cache = { __proto__: null }
    var loading = { __proto__: null }
    var hOP = Object.prototype.hasOwnProperty
    let socket
    // TODO: temporary solution
    var _process =
      typeof process !== 'undefined'
        ? process
        : { env: { NODE_ENV: 'development' } }
    function require(from, id) {
      return getModule(from, id).exports
    }
    var toStringTag = typeof Symbol !== 'undefined' && Symbol.toStringTag
    function defineProp(obj, name, options) {
      if (!hOP.call(obj, name)) Object.defineProperty(obj, name, options)
    }
    function esm(exports, getters) {
      defineProp(exports, '__esModule', { value: true })
      if (toStringTag) defineProp(exports, toStringTag, { value: 'Module' })
      for (var key in getters) {
        defineProp(exports, key, { get: getters[key], enumerable: true })
      }
    }
    function exportValue(module, value) {
      module.exports = value
    }
    function createGetter(obj, key) {
      return () => obj[key]
    }
    function interopEsm(raw, ns, allowExportDefault) {
      var getters = { __proto__: null }
      if (typeof raw === 'object') {
        for (var key in raw) {
          getters[key] = createGetter(raw, key)
        }
      }
      if (!(allowExportDefault && 'default' in getters)) {
        getters['default'] = () => raw
      }
      esm(ns, getters)
    }
    function importModule(from, id, allowExportDefault) {
      var module = getModule(from, id)
      var raw = module.exports
      if (raw.__esModule) return raw
      if (module.interopNamespace) return module.interopNamespace
      var ns = (module.interopNamespace = {})
      interopEsm(raw, ns, allowExportDefault)
      return ns
    }
    function loadFile(id, path) {
      if (chunks.has(id)) return
      if (loading[id]) return loading[id].promise

      var load = (loading[id] = {})
      load.promise = new Promise((resolve, reject) => {
        load.resolve = resolve
        load.reject = reject
      }).catch((ev) => {
        delete loading[id]
        throw ev
      })

      var script = document.createElement('script')
      script.src = path
      script.onerror = load.reject
      document.body.appendChild(script)
      return load.promise
    }
    function getModule(from, id) {
      var cacheEntry = cache[id]
      if (cacheEntry) {
        return cacheEntry
      }
      var module = {
        exports: {},
        loaded: false,
        id,
        parents: new Set(),
        children: new Set(),
        interopNamespace: undefined,
      }
      cache[id] = module
      var moduleFactory = modules[id]
      if (typeof moduleFactory != 'function') {
        throw new Error(
          `Module ${id} was imported from module ${from}, but the module factory is not available`,
        )
      }
      moduleFactory.call(module.exports, {
        e: module.exports,
        r: require.bind(null, id),
        i: importModule.bind(null, id),
        s: esm.bind(null, module.exports),
        v: exportValue.bind(null, module),
        m: module,
        c: cache,
        l: loadFile,
        p: _process,
      })
      module.loaded = true
      if (module.interopNamespace) {
        // in case of a circular dependency: cjs1 -> esm2 -> cjs1
        interopEsm(module.exports, module.interopNamespace)
      }
      return module
    }
    var runtime = { chunks, modules, cache, getModule }
    function op([id, chunkModules, ...run]) {
      chunks.add(id)
      if (loading[id]) {
        loading[id].resolve()
        delete loading[id]
      }
      if (socket) socket.send(JSON.stringify(id))
      for (var m in chunkModules) {
        if (!modules[m]) modules[m] = chunkModules[m]
      }
      runnable.push(...run)
      runnable = runnable.filter((r) => r(runtime))
    }
    if (typeof WebSocket !== 'undefined') {
      var connectingSocket = new WebSocket('ws' + location.origin.slice(4))
      connectingSocket.onopen = () => {
        socket = connectingSocket
        for (var chunk of chunks) {
          socket.send(JSON.stringify(chunk))
        }
        socket.onmessage = (event) => {
          var data = JSON.parse(event.data)
          if (data.type === 'restart' || data.type === 'partial') {
            location.reload()
          }
        }
      }
    }
    self.TURBOPACK = { push: op }
    array.forEach(op)
  }
})()
