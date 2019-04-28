const notifier = require('node-notifier')
const relative = require('path').relative

const babelClientOpts = {
  presets: [
    '@babel/preset-typescript',
    ['@babel/preset-env', {
      modules: 'commonjs',
      targets: {
        browsers: ['IE 11']
      },
      loose: true,
      exclude: ['transform-typeof-symbol']
    }],
    '@babel/preset-react'
  ],
  plugins: [
    ['@babel/plugin-proposal-class-properties', { loose: true }],
    ['@babel/plugin-transform-runtime', {
      corejs: 2,
      helpers: true,
      regenerator: false,
      useESModules: false
    }],
    ['babel-plugin-transform-async-to-promises', {
      inlineHelpers: true
    }]
  ]
}

const babelServerOpts = {
  presets: [
    '@babel/preset-typescript',
    ['@babel/preset-env', {
      modules: 'commonjs',
      targets: {
        node: '8.3'
      },
      loose: true,
      exclude: ['transform-typeof-symbol']
    }]
  ],
  plugins: [
    ['@babel/plugin-proposal-class-properties', { loose: true }]
  ]
}

// eslint-disable-next-line camelcase
export async function ncc_webpack (task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('webpack')))
    .ncc({
      packageName: 'webpack'
    })
    .target('dist/compiled/webpack')

  notify('Compiled webpack')
}

// eslint-disable-next-line camelcase
export async function ncc_webpack_module (task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('webpack/buildin/module')))
    .ncc()
    .target('dist/compiled/webpack/buildin')

  notify('Compiled webpack/buildin/module')
}

// eslint-disable-next-line camelcase
export async function ncc_webpack_harmony_module (task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('webpack/buildin/harmony-module')))
    .ncc()
    .target('dist/compiled/webpack/buildin')

  notify('Compiled webpack/buildin/harmony-module')
}

// eslint-disable-next-line camelcase
export async function ncc_webpack_graph_helpers (task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('webpack/lib/GraphHelpers')))
    .ncc()
    .target('dist/compiled/webpack/lib')

  notify('Compiled webpack/lib/GraphHelpers')
}

// eslint-disable-next-line camelcase
export async function ncc_webpack_hot_middleware (task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('webpack-hot-middleware')))
    .ncc({
      externals: ['chokidar', 'webpack'],
      packageName: 'webpack-hot-middleware'
    })
    .target('dist/compiled/webpack-hot-middleware')

  notify('Compiled webpack-hot-middleware')
}

// eslint-disable-next-line camelcase
export async function ncc_autodll_webpack_plugin (task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('autodll-webpack-plugin')))
    .ncc({
      externals: ['chokidar', 'webpack'],
      packageName: 'autodll-webpack-plugin'
    })
    .target('dist/compiled/autodll-webpack-plugin')

  notify('Compiled autodll-webpack-plugin')
}

// eslint-disable-next-line camelcase
export async function ncc_webpack_dev_middleware (task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('webpack-dev-middleware')))
    .ncc({
      externals: ['chokidar', 'webpack'],
      packageName: 'webpack-dev-middleware'
    })
    .target('dist/compiled/webpack-dev-middleware')

  notify('Compiled webpack-dev-middleware')
}

// eslint-disable-next-line camelcase
export async function ncc_arg (task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('arg')))
    .ncc({ packageName: 'arg' })
    .target('dist/compiled/arg')
}

// eslint-disable-next-line camelcase
export async function ncc_resolve (task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('resolve')))
    .ncc({ packageName: 'resolve' })
    .target('dist/compiled/resolve')
}

// eslint-disable-next-line camelcase
export async function ncc_nanoid (task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('nanoid')))
    .ncc({ packageName: 'nanoid' })
    .target('dist/compiled/nanoid')
}

// eslint-disable-next-line camelcase
export async function ncc_unistore (task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('unistore')))
    .ncc({ packageName: 'unistore' })
    .target('dist/compiled/unistore')
}

// eslint-disable-next-line camelcase
export async function ncc_text_table (task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('text-table')))
    .ncc({ packageName: 'text-table' })
    .target('dist/compiled/text-table')
}

export async function precompile (task) {
  await task.parallel(['ncc_webpack', 'ncc_webpack_module', 'ncc_webpack_harmony_module', 'ncc_webpack_graph_helpers', 'ncc_webpack_hot_middleware', 'ncc_autodll_webpack_plugin', 'ncc_webpack_dev_middleware', 'ncc_unistore', 'ncc_resolve', 'ncc_arg', 'ncc_nanoid', 'ncc_text_table'])
}

export async function compile (task) {
  await task.parallel(['cli', 'bin', 'server', 'nextbuild', 'nextbuildstatic', 'pages', 'lib', 'client'])
}

export async function bin (task, opts) {
  const babelOpts = {
    ...babelServerOpts,
    plugins: [ ...babelServerOpts.plugins, 'babel-plugin-dynamic-import-node' ]
  }
  await task.source(opts.src || 'bin/*').babel(babelOpts, { stripExtension: true }).target('dist/bin', { mode: '0755' })
  notify('Compiled binaries')
}

export async function cli (task, opts) {
  await task.source(opts.src || 'cli/**/*.+(js|ts|tsx)').babel(babelServerOpts).target('dist/cli')
  notify('Compiled cli files')
}

export async function lib (task, opts) {
  await task.source(opts.src || 'lib/**/*.+(js|ts|tsx)').babel(babelServerOpts).target('dist/lib')
  notify('Compiled lib files')
}

export async function server (task, opts) {
  const babelOpts = {
    ...babelServerOpts,
    // the /server files may use React
    presets: [ ...babelServerOpts.presets, '@babel/preset-react' ]
  }
  await task.source(opts.src || 'server/**/*.+(js|ts|tsx)').babel(babelOpts).target('dist/server')
  notify('Compiled server files')
}

export async function nextbuild (task, opts) {
  await task.source(opts.src || 'build/**/*.+(js|ts|tsx)').babel(babelServerOpts).target('dist/build')
  notify('Compiled build files')
}

export async function client (task, opts) {
  await task.source(opts.src || 'client/**/*.+(js|ts|tsx)').babel(babelClientOpts).target('dist/client')
  notify('Compiled client files')
}

// export is a reserved keyword for functions
export async function nextbuildstatic (task, opts) {
  await task.source(opts.src || 'export/**/*.+(js|ts|tsx)').babel(babelServerOpts).target('dist/export')
  notify('Compiled export files')
}

export async function pages (task, opts) {
  await task.source(opts.src || 'pages/**/*.+(js|ts|tsx)').babel(babelClientOpts).target('dist/pages')
}

export async function build (task) {
  await task.serial(['precompile', 'compile'])
}

export default async function (task) {
  await task.clear('dist')
  await task.start('build')
  await task.watch('bin/*', 'bin')
  await task.watch('pages/**/*.+(js|ts|tsx)', 'pages')
  await task.watch('server/**/*.+(js|ts|tsx)', 'server')
  await task.watch('build/**/*.+(js|ts|tsx)', 'nextbuild')
  await task.watch('export/**/*.+(js|ts|tsx)', 'nextexport')
  await task.watch('client/**/*.+(js|ts|tsx)', 'client')
  await task.watch('lib/**/*.+(js|ts|tsx)', 'lib')
  await task.watch('cli/**/*.+(js|ts|tsx)', 'cli')
}

export async function release (task) {
  await task.clear('dist').start('build')
}

// notification helper
function notify (msg) {
  return notifier.notify({
    title: '▲ Next',
    message: msg,
    icon: false
  })
}
