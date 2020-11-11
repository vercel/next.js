// taskr babel plugin with Babel 7 support
// https://github.com/lukeed/taskr/pull/305

const path = require('path')

// eslint-disable-next-line import/no-extraneous-dependencies
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
        bugfixes: true,
        loose: true,
        // This is handled by the Next.js webpack config that will run next/babel over the same code.
        exclude: [
          'transform-typeof-symbol',
          'transform-async-to-generator',
          'transform-spread',
        ],
      },
    ],
    ['@babel/preset-react', { useBuiltIns: true }],
  ],
  plugins: [
    // workaround for @taskr/esnext bug replacing `-import` with `-require(`
    // eslint-disable-next-line no-useless-concat
    '@babel/plugin-syntax-dynamic-impor' + 't',
    ['@babel/plugin-proposal-class-properties', { loose: true }],
  ],
  overrides: [
    {
      test: /\.tsx?$/,
      // eslint-disable-next-line import/no-extraneous-dependencies
      plugins: [require('@babel/plugin-proposal-numeric-separator').default],
    },
  ],
}

const babelServerOpts = {
  presets: [
    '@babel/preset-typescript',
    ['@babel/preset-react', { useBuiltIns: true }],
    [
      '@babel/preset-env',
      {
        modules: 'commonjs',
        targets: {
          node: '8.3',
        },
        loose: true,
        // This is handled by the Next.js webpack config that will run next/babel over the same code.
        exclude: [
          'transform-typeof-symbol',
          'transform-async-to-generator',
          'transform-spread',
        ],
      },
    ],
  ],
  plugins: [
    'babel-plugin-dynamic-import-node',
    ['@babel/plugin-proposal-class-properties', { loose: true }],
  ],
  overrides: [
    {
      test: /\.tsx?$/,
      // eslint-disable-next-line import/no-extraneous-dependencies
      plugins: [require('@babel/plugin-proposal-numeric-separator').default],
    },
  ],
}

module.exports = function (task) {
  // eslint-disable-next-line require-yield
  task.plugin('babel', {}, function* (
    file,
    serverOrClient,
    { stripExtension } = {}
  ) {
    // Don't compile .d.ts
    if (file.base.endsWith('.d.ts')) return

    const babelOpts =
      serverOrClient === 'client' ? babelClientOpts : babelServerOpts

    const filePath = path.join(file.dir, file.base)
    const fullFilePath = path.join(__dirname, filePath)
    const distFilePath = path.dirname(path.join(__dirname, 'dist', filePath))

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
      cwd: __dirname,
      filename: path.join(file.dir, file.base),
      sourceFileName: path.relative(distFilePath, fullFilePath),
      sourceMaps: true,
    }

    const output = transform(file.data, options)
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
        data: Buffer.from(JSON.stringify(output.map)),
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
