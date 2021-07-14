// taskr babel plugin with Babel 7 support
// https://github.com/lukeed/taskr/pull/305

const path = require('path')

// eslint-disable-next-line import/no-extraneous-dependencies
const transform = require('@swc/core').transform

module.exports = function (task) {
  // eslint-disable-next-line require-yield
  task.plugin('swc', {}, function* (
    file,
    serverOrClient,
    { stripExtension, dev } = {}
  ) {
    // Don't compile .d.ts
    if (file.base.endsWith('.d.ts')) return

    const options = {
      filename: path.join(file.dir, file.base),
      sourceMaps: true,

      module: {
        type: 'commonjs',
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
          tsx: file.base.endsWith('.tsx'),
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

    const output = yield transform(file.data.toString('utf-8'), options)
    const ext = path.extname(file.base)

    // Replace `.ts|.tsx` with `.js` in files with an extension
    if (ext) {
      const extRegex = new RegExp(ext.replace('.', '\\.') + '$', 'i')
      // Remove the extension if stripExtension is enabled or replace it with `.js`
      file.base = file.base.replace(extRegex, stripExtension ? '' : '.js')
    }

    // Workaround for noop.js loading
    if (file.base === 'next-dev.js') {
      output.code = output.code.replace(
        /__REPLACE_NOOP_IMPORT__/g,
        `import('./dev/noop');`
      )
    }

    if (output.map) {
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
  })
}

function setNextVersion(code) {
  return code.replace(
    /process\.env\.__NEXT_VERSION/g,
    `"${require('./package.json').version}"`
  )
}
