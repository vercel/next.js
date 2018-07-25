// Implementation of this PR: https://github.com/jamiebuilds/react-loadable/pull/132
// Modified to strip out unneeded results for Next's specific use case
const url = require('url')

function buildManifest (compiler, compilation) {
  let context = compiler.options.context
  let manifest = {}

  compilation.chunks.forEach(chunk => {
    chunk.files.forEach(file => {
      for (const module of chunk.modulesIterable) {
        let id = module.id
        let name = typeof module.libIdent === 'function' ? module.libIdent({ context }) : null
        // If it doesn't end in `.js` Next.js can't handle it right now.
        if (!file.match(/\.js$/) || !file.match(/^static\/chunks\//)) {
          return
        }
        let publicPath = url.resolve(compilation.outputOptions.publicPath || '', file)

        let currentModule = module
        if (module.constructor.name === 'ConcatenatedModule') {
          currentModule = module.rootModule
        }
        if (!manifest[currentModule.rawRequest]) {
          manifest[currentModule.rawRequest] = []
        }

        manifest[currentModule.rawRequest].push({ id, name, file, publicPath })
      }
    })
  })

  return manifest
}

export class ReactLoadablePlugin {
  constructor (opts = {}) {
    this.filename = opts.filename
  }

  apply (compiler) {
    compiler.hooks.emit.tapAsync('ReactLoadableManifest', (compilation, callback) => {
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
