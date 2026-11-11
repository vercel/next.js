const { createRequire } = require('node:module')

/** Replace dependencies before a driver loads the module under test. */
function createModuleReplacer(fromFilename) {
  const load = createRequire(fromFilename)
  return (request, exports) => {
    const filename = load.resolve(request)
    require.cache[filename] = { id: filename, filename, loaded: true, exports }
  }
}

module.exports = { createModuleReplacer }
