Object.defineProperty(exports, '__esModule', { value: true })

const cache = new Map()

var CacheHandler = /** @class */ (function () {
  function CacheHandler(options) {
    this.options = options
    this.cache = cache
    console.log('initialized custom cache-handler')
  }
  CacheHandler.prototype.get = function (key) {
    console.log('cache-handler get', key)
    return Promise.resolve(this.cache.get(key))
  }
  CacheHandler.prototype.set = function (key, data) {
    console.log('cache-handler set', key)
    this.cache.set(key, {
      value: data,
      lastModified: Date.now(),
    })
    return Promise.resolve(undefined)
  }
  return CacheHandler
})()

exports.default = CacheHandler
