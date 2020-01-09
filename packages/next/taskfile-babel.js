// taskr babel plugin with Babel 7 support
// https://github.com/lukeed/taskr/pull/305

const extname = require('path').extname
const transform = require('@babel/core').transform

module.exports = function(task) {
  // eslint-disable-next-line require-yield
  task.plugin('babel', {}, function*(file, babelOpts, { stripExtension } = {}) {
    const options = {
      ...babelOpts,
      compact: true,
      comments: false,
      babelrc: false,
      configFile: false,
      filename: file.base,
    }
    const output = transform(file.data, options)
    const ext = extname(file.base)

    // Include declaration files as they are
    if (file.base.endsWith('.d.ts')) return

    // Replace `.ts|.tsx` with `.js` in files with an extension
    if (ext) {
      const extRegex = new RegExp(ext.replace('.', '\\.') + '$', 'i')
      // Remove the extension if stripExtension is enabled or replace it with `.js`
      file.base = file.base.replace(extRegex, stripExtension ? '' : '.js')
    }

    // Workaround for noop.js loading
    if (file.base === 'next-dev.js') {
      output.code = output.code.replace(
        '__REPLACE_NOOP_IMPORT__',
        `import('./dev/noop');`
      )
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
