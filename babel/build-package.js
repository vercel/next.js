import notifier from 'node-notifier'
import del from 'del'
import { join } from 'path'

import { build, watch } from './'

const baseDir = join(__dirname, '..', '..')

const babelBrowserConfig = {
  babelrc: false,
  'presets': [
    ['@babel/preset-env', {
      modules: false,
      loose: true,
      targets: {
        browsers: ['ie >= 11', 'edge >= 16', 'safari >= 9', 'chrome >= 64', 'firefox >= 60']
      },
      exclude: ['transform-typeof-symbol', 'transform-function-name'],
      useBuiltIns: false,
      debug: true
    }],
    '@babel/preset-react'
  ],
  'plugins': [
    require.resolve('./plugins/require-react'),
    '@babel/plugin-proposal-object-rest-spread',
    '@babel/plugin-proposal-class-properties',
    'transform-react-remove-prop-types',
    ['@babel/plugin-transform-runtime', {
      helpers: true
    }]
  ]
}
const babelNodeConfig = {
  babelrc: false,
  presets: [
    ['@babel/preset-env', {
      modules: 'commonjs',
      loose: true,
      targets: {
        node: 'current'
      }
    }],
    '@babel/preset-react'
  ],
  plugins: [
    '@babel/plugin-proposal-class-properties'
  ]
}

async function compile (watch) {
  await node(watch)
  await client(watch)
}

async function node (shouldWatch) {
  const outDir = join(baseDir, 'node')
  await del(`${outDir}/server`, { force: true })
  await del(`${outDir}/lib`, { force: true })

  const files = ['./server/next.js', './server/build/index.js', './server/build/loaders']

  await build(files, {
    base: baseDir,
    outDir,
    keepAlive: true,
    babelOptions: babelNodeConfig
  })
  if (shouldWatch) {
    await watch(files, {
      base: baseDir,
      outDir,
      babelOptions: babelNodeConfig
    })
  }

  notify('Compiled node binaries')
}

async function client (shouldWatch) {
  const outDir = join(baseDir, 'browser')
  await del(outDir, { force: true })

  const files = ['./client', './lib']

  await build(files, {
    base: baseDir,
    outDir,
    keepAlive: shouldWatch,
    babelOptions: babelBrowserConfig
  })
  if (shouldWatch) {
    await watch(files, {
      base: baseDir,
      outDir,
      babelOptions: babelBrowserConfig
    })
  }
  notify('Compiled client files')
}

compile(process.argv[1] === '--watch')

// notification helper
function notify (msg) {
  return notifier.notify({
    title: '▲ Next',
    message: msg,
    icon: false
  })
}
