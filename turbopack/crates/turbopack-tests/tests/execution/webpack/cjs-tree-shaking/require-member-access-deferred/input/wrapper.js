// Simulates whatwg-url/lib/URL.js pattern: function bodies reference
// `Impl` which is declared at the bottom (deferred require for circular deps).
exports.setup = (obj, constructorArgs) => {
  obj._impl = new Impl.implementation(constructorArgs)
  return obj
}

class URL {
  constructor(url) {
    return exports.setup(Object.create(URL.prototype), [url])
  }
}

exports.interface = URL

// Deferred require at the bottom of the file (handles circular dependencies)
const Impl = require('./impl')
