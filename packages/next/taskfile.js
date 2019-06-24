const notifier = require('node-notifier')
const relative = require('path').relative

const babelClientOpts = {
  presets: [
    '@babel/preset-typescript',
    [
      '@babel/preset-env',
      {
        modules: 'commonjs',
        targets: {
          esmodules: true
        },
        loose: true,
        exclude: ['transform-typeof-symbol']
      }
    ],
    '@babel/preset-react'
  ],
  plugins: [
    ['@babel/plugin-proposal-class-properties', { loose: true }],
    [
      '@babel/plugin-transform-runtime',
      {
        corejs: 2,
        helpers: true,
        regenerator: false,
        useESModules: false
      }
    ]
  ]
}

const babelServerOpts = {
  presets: [
    '@babel/preset-typescript',
    [
      '@babel/preset-env',
      {
        modules: 'commonjs',
        targets: {
          node: '8.3'
        },
        loose: true,
        exclude: ['transform-typeof-symbol']
      }
    ]
  ],
  plugins: [
    'babel-plugin-dynamic-import-node',
    ['@babel/plugin-proposal-class-properties', { loose: true }]
  ]
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
  await task.parallel([
    'ncc_unistore',
    'ncc_resolve',
    'ncc_arg',
    'ncc_nanoid',
    'ncc_text_table'
  ])
}

export async function compile (task) {
  await task.parallel([
    'cli',
    'bin',
    'server',
    'nextbuild',
    'nextbuildstatic',
    'pages',
    'lib',
    'client'
  ])
}

export async function bin (task, opts) {
  await task
    .source(opts.src || 'bin/*')
    .babel(babelServerOpts, { stripExtension: true })
    .target('dist/bin', { mode: '0755' })
  notify('Compiled binaries')
}

export async function cli (task, opts) {
  await task
    .source(opts.src || 'cli/**/*.+(js|ts|tsx)')
    .babel(babelServerOpts)
    .target('dist/cli')
  notify('Compiled cli files')
}

export async function lib (task, opts) {
  await task
    .source(opts.src || 'lib/**/*.+(js|ts|tsx)')
    .babel(babelServerOpts)
    .target('dist/lib')
  notify('Compiled lib files')
}

export async function server (task, opts) {
  const babelOpts = {
    ...babelServerOpts,
    // the /server files may use React
    presets: [...babelServerOpts.presets, '@babel/preset-react']
  }
  await task
    .source(opts.src || 'server/**/*.+(js|ts|tsx)')
    .babel(babelOpts)
    .target('dist/server')
  notify('Compiled server files')
}

export async function nextbuild (task, opts) {
  await task
    .source(opts.src || 'build/**/*.+(js|ts|tsx)')
    .babel(babelServerOpts)
    .target('dist/build')
  notify('Compiled build files')
}

export async function client (task, opts) {
  await task
    .source(opts.src || 'client/**/*.+(js|ts|tsx)')
    .babel(babelClientOpts)
    .target('dist/client')
  notify('Compiled client files')
}

// export is a reserved keyword for functions
export async function nextbuildstatic (task, opts) {
  await task
    .source(opts.src || 'export/**/*.+(js|ts|tsx)')
    .babel(babelServerOpts)
    .target('dist/export')
  notify('Compiled export files')
}

export async function pages (task, opts) {
  await task
    .source(opts.src || 'pages/**/*.+(js|ts|tsx)')
    .babel(babelClientOpts)
    .target('dist/pages')
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
  await task.watch('export/**/*.+(js|ts|tsx)', 'nextbuildstatic')
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
