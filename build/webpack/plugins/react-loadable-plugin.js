// Implementation of this PR: https://github.com/jamiebuilds/react-loadable/pull/132
const url = require('url')

function buildManifest (compiler, compilation) {
  let context = compiler.options.context
  let manifest = {}

  compilation.chunks.forEach(chunk => {
    chunk.files.forEach(file => {
      chunk.forEachModule(module => {
        let id = module.id
        let name = typeof module.libIdent === 'function' ? module.libIdent({ context }) : null
        let publicPath = url.resolve(compilation.outputOptions.publicPath || '', file)

        let currentModule = module
        if (module.constructor.name === 'ConcatenatedModule') {
          currentModule = module.rootModule
        }
        if (!manifest[currentModule.rawRequest]) {
          manifest[currentModule.rawRequest] = []
        }

        manifest[currentModule.rawRequest].push({ id, name, file, publicPath })
      })
    })
  })

  return manifest
}

class ReactLoadablePlugin {
  constructor (opts = {}) {
    this.filename = opts.filename
  }

  apply (compiler) {
    compiler.plugin('emit', (compilation, callback) => {
      const manifest = buildManifest(compiler, compilation)
      var json = JSON.stringify(manifest, null, 2)
      compilation.assets[this.filename] = {
        source () {
          return json
        },
        size () {
          return json.length
        }
      }
      callback()
    })
  }
}

function getBundles (manifest, moduleIds) {
  return moduleIds.reduce((bundles, moduleId) => {
    return bundles.concat(manifest[moduleId])
  }, [])
}

exports.ReactLoadablePlugin = ReactLoadablePlugin
exports.getBundles = getBundles
