// taskr babel plugin with Babel 7 support
// https://github.com/lukeed/taskr/pull/305

const extname = require('path').extname
const transform = require('@babel/core').transform

const babelClientOpts = {
  presets: [
    '@babel/preset-typescript',
    [
      '@babel/preset-env',
      {
        modules: 'commonjs',
        targets: {
          esmodules: true,
        },
        loose: true,
        exclude: ['transform-typeof-symbol'],
      },
    ],
    '@babel/preset-react',
  ],
  plugins: [
    // workaround for @taskr/esnext bug replacing `-import` with `-require(`
    // eslint-disable-next-line no-useless-concat
    '@babel/plugin-syntax-dynamic-impor' + 't',
    ['@babel/plugin-proposal-class-properties', { loose: true }],
  ],
}

const babelServerOpts = {
  presets: [
    '@babel/preset-typescript',
    '@babel/preset-react',
    [
      '@babel/preset-env',
      {
        modules: 'commonjs',
        targets: {
          node: '8.3',
        },
        loose: true,
        exclude: ['transform-typeof-symbol'],
      },
    ],
  ],
  plugins: [
    '@babel/plugin-proposal-optional-chaining',
    '@babel/plugin-proposal-nullish-coalescing-operator',
    'babel-plugin-dynamic-import-node',
    ['@babel/plugin-proposal-class-properties', { loose: true }],
  ],
}

module.exports = function(task) {
  // eslint-disable-next-line require-yield
  task.plugin('babel', {}, function*(
    file,
    serverOrClient,
    { stripExtension } = {}
  ) {
    // Don't compile .d.ts
    if (file.base.endsWith('.d.ts')) return

    const babelOpts =
      serverOrClient === 'client' ? babelClientOpts : babelServerOpts

    const options = {
      ...babelOpts,
      plugins: [
        ...babelOpts.plugins,
        // pages dir doesn't need core-js
        serverOrClient === 'client'
          ? [
              '@babel/plugin-transform-runtime',
              {
                corejs: false,
                helpers: true,
                regenerator: false,
                useESModules: false,
              },
            ]
          : false,
      ].filter(Boolean),
      compact: true,
      babelrc: false,
      configFile: false,
      filename: file.base,
    }
    const output = transform(file.data, options)
    const ext = extname(file.base)

    output.code = output.code.replace(
      /@babel\/runtime\//g,
      '@babel/runtime-corejs2/'
    )

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

    file.data = Buffer.from(setNextVersion(output.code))
  })
}

function setNextVersion(code) {
  return code.replace(
    /process\.env\.__NEXT_VERSION/g,
    `"${require('./package.json').version}"`
  )
}
