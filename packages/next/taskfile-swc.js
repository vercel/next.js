// taskr babel plugin with Babel 7 support
// https://github.com/lukeed/taskr/pull/305

const path = require('path')

// eslint-disable-next-line import/no-extraneous-dependencies
const transform = require('@swc/core').transform

module.exports = function (task) {
  // eslint-disable-next-line require-yield
  task.plugin(
    'swc',
    {},
    function* (
      file,
      serverOrClient,
      {
        stripExtension,
        keepImportAssertions = false,
        interopClientDefaultExport = false,
      } = {}
    ) {
      // Don't compile .d.ts
      if (file.base.endsWith('.d.ts')) return

      const isClient = serverOrClient === 'client'

      const swcClientOptions = {
        module: {
          type: 'commonjs',
          ignoreDynamic: true,
        },
        jsc: {
          loose: true,

          target: 'es2016',
          parser: {
            syntax: 'typescript',
            dynamicImport: true,
            importAssertions: true,
            tsx: file.base.endsWith('.tsx'),
          },
          experimental: {
            keepImportAssertions,
          },
          transform: {
            react: {
              pragma: 'React.createElement',
              pragmaFrag: 'React.Fragment',
              throwIfNamespace: true,
              development: false,
              useBuiltins: true,
            },
          },
        },
      }

      const swcServerOptions = {
        module: {
          type: 'commonjs',
          ignoreDynamic: true,
        },
        env: {
          targets: {
            node: '12.0.0',
          },
        },
        jsc: {
          loose: true,

          parser: {
            syntax: 'typescript',
            dynamicImport: true,
            importAssertions: true,
            tsx: file.base.endsWith('.tsx'),
          },
          experimental: {
            keepImportAssertions,
          },
          transform: {
            react: {
              pragma: 'React.createElement',
              pragmaFrag: 'React.Fragment',
              throwIfNamespace: true,
              development: false,
              useBuiltins: true,
            },
          },
        },
      }

      const swcOptions = isClient ? swcClientOptions : swcServerOptions

      const filePath = path.join(file.dir, file.base)
      const fullFilePath = path.join(__dirname, filePath)
      const distFilePath = path.dirname(path.join(__dirname, 'dist', filePath))

      const options = {
        filename: path.join(file.dir, file.base),
        sourceMaps: true,
        inlineSourcesContent: false,
        sourceFileName: path.relative(distFilePath, fullFilePath),

        ...swcOptions,
      }

      const output = yield transform(file.data.toString('utf-8'), options)
      const ext = path.extname(file.base)

      // Replace `.ts|.tsx` with `.js` in files with an extension
      if (ext) {
        const extRegex = new RegExp(ext.replace('.', '\\.') + '$', 'i')
        // Remove the extension if stripExtension is enabled or replace it with `.js`
        file.base = file.base.replace(extRegex, stripExtension ? '' : '.js')
      }

      if (output.map) {
        if (interopClientDefaultExport) {
          output.code += `
if ((typeof exports.default === 'function' || (typeof exports.default === 'object' && exports.default !== null)) && typeof exports.default.__esModule === 'undefined') {
  Object.defineProperty(exports.default, '__esModule', { value: true });
  Object.assign(exports.default, exports);
  module.exports = exports.default;
}
`
        }

        const map = `${file.base}.map`

        output.code += Buffer.from(`\n//# sourceMappingURL=${map}`)

        // add sourcemap to `files` array
        this._.files.push({
          base: map,
          dir: file.dir,
          data: Buffer.from(output.map),
        })
      }

      file.data = Buffer.from(setNextVersion(output.code))
    }
  )
}

function setNextVersion(code) {
  return code.replace(
    /process\.env\.__NEXT_VERSION/g,
    `"${require('./package.json').version}"`
  )
}
