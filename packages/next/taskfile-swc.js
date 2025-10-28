// taskr babel plugin with Babel 7 support
// https://github.com/lukeed/taskr/pull/305

const MODERN_BROWSERSLIST_TARGET = require('./src/shared/lib/modern-browserslist-target')

const path = require('path')

const transform = require('@swc/core').transform

module.exports = function (task) {
  task.plugin(
    'swc',
    {},
    function* (
      file,
      serverOrClient,
      { stripExtension, interopClientDefaultExport = false, esm = false } = {}
    ) {
      // Don't compile .d.ts
      if (
        file.base.endsWith('.d.ts') ||
        file.base.endsWith('.json') ||
        file.base.endsWith('.woff2')
      )
        return

      const plugins = [
        ...(file.base.includes('.test.') || file.base.includes('.stories.')
          ? []
          : [[path.join(__dirname, 'next_error_code_swc_plugin.wasm'), {}]]),
      ]

      const isClient = serverOrClient === 'client'
      /** @type {import('@swc/core').Options} */
      const swcClientOptions = {
        module: esm
          ? {
              type: 'es6',
            }
          : {
              type: 'commonjs',
              ignoreDynamic: true,
              exportInteropAnnotation: true,
            },
        env: {
          targets: MODERN_BROWSERSLIST_TARGET,
        },
        jsc: {
          loose: true,
          externalHelpers: true,
          parser: {
            syntax: 'typescript',
            dynamicImport: true,
            importAttributes: true,
            tsx: file.base.endsWith('.tsx'),
          },
          experimental: {
            keepImportAttributes: esm,
            plugins,
          },
          transform: {
            react: {
              runtime: 'automatic',
              pragmaFrag: 'React.Fragment',
              throwIfNamespace: true,
              development: false,
              useBuiltins: true,
            },
          },
        },
      }

      /** @type {import('@swc/core').Options} */
      const swcServerOptions = {
        module: esm
          ? {
              type: 'es6',
            }
          : {
              type: 'commonjs',
              ignoreDynamic: true,
              exportInteropAnnotation: true,
            },
        env: {
          targets: {
            // Ideally, should be same version defined in packages/next/package.json#engines
            // Currently a few minors behind due to babel class transpiling
            // which fails "test/integration/mixed-ssg-serverprops-error/test/index.test.js"
            node: '16.8.0',
          },
        },
        jsc: {
          loose: true,
          // Do not enable external helpers on server-side files build
          // _is_native_function helper is not compatible with edge runtime (need investigate)
          externalHelpers: false,
          parser: {
            syntax: 'typescript',
            dynamicImport: true,
            importAttributes: true,
            tsx: file.base.endsWith('.tsx'),
          },
          experimental: {
            keepImportAttributes: esm,
            plugins,
          },
          transform: {
            react: {
              runtime: 'automatic',
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
      const distFilePath = path.dirname(
        // we must strip src from filePath as it isn't carried into
        // the dist file path
        path.join(__dirname, 'dist', filePath.replace(/^src[/\\]/, ''))
      )

      const options = {
        filename: path.join(file.dir, file.base),
        sourceMaps: true,
        inlineSourcesContent: true,
        sourceFileName: path.relative(distFilePath, fullFilePath),

        ...swcOptions,
      }

      const source = file.data.toString('utf-8')
      const output = yield transform(source, options)
      const ext = path.extname(file.base)

      // Replace `.ts|.tsx` with `.js` in files with an extension
      if (ext) {
        const extRegex = new RegExp(ext.replace('.', '\\.') + '$', 'i')
        // Remove the extension if stripExtension is enabled or replace it with `.js`
        file.base = file.base.replace(
          extRegex,
          stripExtension ? '' : `.${ext === '.mts' ? 'm' : ''}js`
        )
      }

      if (output.map) {
        if (interopClientDefaultExport && !esm) {
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

        const sourceMapPayload = JSON.parse(output.map)
        if ('ignoreList' in sourceMapPayload) {
          throw new Error(
            'SWC already sets an ignoreList. We may no longer need to manually set ignoreList.'
          )
        }
        // ignore-list everything
        sourceMapPayload.ignoreList = sourceMapPayload.sources.map(
          (source, sourceIndex) => {
            return sourceIndex
          }
        )

        // add sourcemap to `files` array
        this._.files.push({
          base: map,
          dir: file.dir,
          data: Buffer.from(JSON.stringify(sourceMapPayload)),
        })
      }

      file.data = Buffer.from(setNextVersion(output.code))
    }
  )
}

function setNextVersion(code) {
  return code
    .replace(
      /process\.env\.__NEXT_VERSION/g,
      `"${require('./package.json').version}"`
    )
    .replace(
      /process\.env\.__NEXT_REQUIRED_NODE_VERSION_RANGE/g,
      `"${require('./package.json').engines.node}"`
    )
    .replace(
      /process\.env\.REQUIRED_APP_REACT_VERSION/,
      `"${
        require('../../package.json').devDependencies[
          'react-server-dom-webpack'
        ]
      }"`
    )
}
