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
        esm = false,
      } = {}
    ) {
      // Don't compile .d.ts
      if (file.base.endsWith('.d.ts') || file.base.endsWith('.json')) return

      const isClient = serverOrClient === 'client'

      /** @type {import('@swc/core').Options} */
      const swcClientOptions = {
        module: {
          type: esm ? 'es6' : 'commonjs',
          ignoreDynamic: true,
        },
        jsc: {
          loose: true,
          externalHelpers: true,
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

      /** @type {import('@swc/core').Options} */
      const swcServerOptions = {
        module: {
          type: esm ? 'es6' : 'commonjs',
          ignoreDynamic: true,
        },
        env: {
          targets: {
            // follow the version defined in packages/next/package.json#engine
            node: '14.6.0',
          },
        },
        jsc: {
          loose: true,
          // Do not enable external helpers on server-side files build
          // _is_native_funtion helper is not compatible with edge runtime (need investigate)
          externalHelpers: false,
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
      const distFilePath = path.dirname(
        // we must strip src from filePath as it isn't carried into
        // the dist file path
        path.join(__dirname, 'dist', filePath.replace(/^src[/\\]/, ''))
      )

      const options = {
        filename: path.join(file.dir, file.base),
        sourceMaps: true,
        inlineSourcesContent: false,
        sourceFileName: path.relative(distFilePath, fullFilePath),

        ...swcOptions,
      }

      const source = file.data.toString('utf-8')
      const output = yield transform(source, options)
      const ext = path.extname(file.base)

      // Make sure the output content keeps the `"use client"` directive.
      // TODO: Remove this once SWC fixes the issue.
      if (/^['"]use client['"]/.test(source)) {
        output.code =
          '"use client";\n' +
          output.code
            .split('\n')
            .map((l) => (/^['"]use client['"]/.test(l) ? '' : l))
            .join('\n')
      }

      // Replace `.ts|.tsx` with `.js` in files with an extension
      if (ext) {
        const extRegex = new RegExp(ext.replace('.', '\\.') + '$', 'i')
        // Remove the extension if stripExtension is enabled or replace it with `.js`
        file.base = file.base.replace(extRegex, stripExtension ? '' : '.js')
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
  return code
    .replace(
      /process\.env\.__NEXT_VERSION/g,
      `"${require('./package.json').version}"`
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
