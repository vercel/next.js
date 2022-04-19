// eslint-disable-next-line import/no-extraneous-dependencies
const notifier = require('node-notifier')
// eslint-disable-next-line import/no-extraneous-dependencies
const { relative, basename, resolve, join, dirname } = require('path')
// eslint-disable-next-line import/no-extraneous-dependencies
const glob = require('glob')
// eslint-disable-next-line import/no-extraneous-dependencies
const fs = require('fs-extra')

export async function next__polyfill_nomodule(task, opts) {
  await task
    .source(
      opts.src ||
        relative(__dirname, require.resolve('@next/polyfill-nomodule'))
    )
    .target('dist/build/polyfills')
}

export async function next__polyfill_module(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('@next/polyfill-module'))
    )
    .target('dist/build/polyfills')
}

export async function browser_polyfills(task, opts) {
  await task.parallel(
    ['next__polyfill_nomodule', 'next__polyfill_module'],
    opts
  )
}

// eslint-disable-next-line camelcase
export async function copy_regenerator_runtime(task, opts) {
  await task
    .source(join(dirname(require.resolve('regenerator-runtime')), '**/*'))
    .target('compiled/regenerator-runtime')
}

const externals = {
  // don't bundle caniuse-lite data so users can
  // update it manually
  'caniuse-lite': 'caniuse-lite',
  '/caniuse-lite(/.*)/': 'caniuse-lite$1',

  'node-fetch': 'node-fetch',
  postcss: 'postcss',
  // Ensure latest version is used
  'postcss-safe-parser': 'next/dist/compiled/postcss-safe-parser',
  'cssnano-simple': 'next/dist/build/cssnano-simple',

  // sass-loader
  // (also responsible for these dependencies in package.json)
  'node-sass': 'node-sass',
  sass: 'sass',
  fibers: 'fibers',

  chokidar: 'chokidar',
  'jest-worker': 'jest-worker',

  'terser-webpack-plugin':
    'next/dist/build/webpack/plugins/terser-webpack-plugin',
}
// eslint-disable-next-line camelcase
externals['node-html-parser'] = 'next/dist/compiled/node-html-parser'
export async function ncc_node_html_parser(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('node-html-parser'))
    )
    .ncc({ packageName: 'node-html-parser', externals, target: 'es5' })
    .target('compiled/node-html-parser')

  const filePath = join(__dirname, 'compiled/node-html-parser/index.js')
  const content = fs.readFileSync(filePath, 'utf8')
  // remove AMD define branch as this forces the module to not
  // be treated as commonjs in serverless mode
  // TODO: this can be removed after serverless target is removed
  fs.writeFileSync(
    filePath,
    content.replace(
      'if(typeof define=="function"&&typeof define.amd=="object"&&define.amd){define((function(){return E}))}else ',
      ''
    )
  )
}

// eslint-disable-next-line camelcase
externals['@babel/runtime'] = 'next/dist/compiled/@babel/runtime'
export async function copy_babel_runtime(task, opts) {
  const runtimeDir = dirname(require.resolve('@babel/runtime/package.json'))
  const outputDir = join(__dirname, 'compiled/@babel/runtime')
  const runtimeFiles = glob.sync('**/*', {
    cwd: runtimeDir,
    ignore: ['node_modules/**/*'],
  })

  for (const file of runtimeFiles) {
    const inputPath = join(runtimeDir, file)
    const outputPath = join(outputDir, file)

    if (!fs.statSync(inputPath).isFile()) {
      continue
    }
    let contents = fs.readFileSync(inputPath, 'utf8')

    if (inputPath.endsWith('.js')) {
      contents = contents
        .replace(
          'regenerator-runtime',
          'next/dist/compiled/regenerator-runtime'
        )
        .replace('@babel/runtime', 'next/dist/compiled/@babel/runtime')
    }

    if (inputPath.endsWith('package.json')) {
      contents = JSON.stringify({
        ...JSON.parse(contents),
        dependencies: {},
      })
    }

    fs.mkdirSync(dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, contents)
  }
}

// eslint-disable-next-line camelcase
externals['node-fetch'] = 'next/dist/compiled/node-fetch'
export async function ncc_node_fetch(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('node-fetch')))
    .ncc({ packageName: 'node-fetch', externals })
    .target('compiled/node-fetch')
}

// eslint-disable-next-line camelcase
externals['acorn'] = 'next/dist/compiled/acorn'
export async function ncc_acorn(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('acorn')))
    .ncc({ packageName: 'acorn', externals })
    .target('compiled/acorn')
}

// eslint-disable-next-line camelcase
export async function ncc_next__react_dev_overlay(task, opts) {
  const overlayExternals = {
    ...externals,
    react: 'react',
    'react-dom': 'react-dom',
  }
  // dev-overlay needs a newer source-map version
  delete overlayExternals['source-map']

  await task
    .source(
      opts.src ||
        relative(
          __dirname,
          require.resolve('@next/react-dev-overlay/lib/middleware')
        )
    )
    .ncc({
      precompiled: false,
      packageName: '@next/react-dev-overlay',
      externals: overlayExternals,
      target: 'es5',
    })
    .target('dist/compiled/@next/react-dev-overlay')

  await task
    .source(
      opts.src ||
        relative(
          __dirname,
          require.resolve('@next/react-dev-overlay/lib/client')
        )
    )
    .ncc({
      precompiled: false,
      packageName: '@next/react-dev-overlay',
      externals: overlayExternals,
      target: 'es5',
    })
    .target('dist/compiled/@next/react-dev-overlay')

  const clientFile = join(
    __dirname,
    'dist/compiled/@next/react-dev-overlay/client.js'
  )
  const content = fs.readFileSync(clientFile, 'utf8')
  // remove AMD define branch as this forces the module to not
  // be treated as commonjs in serverless/client mode
  fs.writeFileSync(
    clientFile,
    content.replace(
      new RegExp(
        'if(typeof define=="function"&&typeof define.amd=="object"&&define.amd){r.platform=b;define((function(){return b}))}else '.replace(
          /[|\\{}()[\]^$+*?.-]/g,
          '\\$&'
        ),
        'g'
      ),
      ''
    )
  )
}

// eslint-disable-next-line camelcase
externals['watchpack'] = 'next/dist/compiled/watchpack'
export async function ncc_watchpack(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('watchpack')))
    .ncc({ packageName: 'watchpack', externals })
    .target('compiled/watchpack')
}

// eslint-disable-next-line camelcase
externals['jest-worker'] = 'next/dist/compiled/jest-worker'
export async function ncc_jest_worker(task, opts) {
  await fs.remove(join(__dirname, 'compiled/jest-worker'))
  await fs.ensureDir(join(__dirname, 'compiled/jest-worker/workers'))

  const workers = ['processChild.js', 'threadChild.js']

  await task
    .source(opts.src || relative(__dirname, require.resolve('jest-worker')))
    .ncc({ packageName: 'jest-worker', externals })
    .target('compiled/jest-worker')

  for (const worker of workers) {
    const content = await fs.readFile(
      join(
        dirname(require.resolve('jest-worker/package.json')),
        'build/workers',
        worker
      ),
      'utf8'
    )
    await fs.writeFile(
      join(
        dirname(require.resolve('jest-worker/package.json')),
        'build/workers',
        worker + '.tmp.js'
      ),
      content.replace(/require\(file\)/g, '__non_webpack_require__(file)')
    )
    await task
      .source(
        opts.src ||
          relative(
            __dirname,
            join(
              dirname(require.resolve('jest-worker/package.json')),
              'build/workers',
              worker + '.tmp.js'
            )
          )
      )
      .ncc({ externals })
      .target('compiled/jest-worker/out')

    await fs.move(
      join(__dirname, 'compiled/jest-worker/out', worker + '.tmp.js'),
      join(__dirname, 'compiled/jest-worker', worker),
      { overwrite: true }
    )
  }
  await fs.remove(join(__dirname, 'compiled/jest-worker/workers'))
  await fs.remove(join(__dirname, 'compiled/jest-worker/out'))
}

// eslint-disable-next-line camelcase
export async function ncc_react_refresh_utils(task, opts) {
  await fs.remove(join(__dirname, 'dist/compiled/react-refresh'))
  await fs.copy(
    dirname(require.resolve('react-refresh/package.json')),
    join(__dirname, 'dist/compiled/react-refresh')
  )

  const srcDir = dirname(
    require.resolve('@next/react-refresh-utils/package.json')
  )
  const destDir = join(__dirname, 'dist/compiled/@next/react-refresh-utils')
  await fs.remove(destDir)
  await fs.ensureDir(destDir)

  const files = glob.sync('**/*.{js,json}', { cwd: srcDir })

  for (const file of files) {
    if (file === 'tsconfig.json') continue

    const content = await fs.readFile(join(srcDir, file), 'utf8')
    const outputFile = join(destDir, file)

    await fs.ensureDir(dirname(outputFile))
    await fs.writeFile(
      outputFile,
      content.replace(
        /react-refresh\/runtime/g,
        'next/dist/compiled/react-refresh/runtime'
      )
    )
  }
}

// eslint-disable-next-line camelcase
export async function ncc_use_subscription(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('use-subscription'))
    )
    .ncc({
      packageName: 'use-subscription',
      externals: {
        ...externals,
        react: 'react',
        'react-dom': 'react-dom',
      },
      target: 'es5',
    })
    .target('compiled/use-subscription')
}

// eslint-disable-next-line camelcase
externals['chalk'] = 'next/dist/compiled/chalk'
export async function ncc_chalk(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('chalk')))
    .ncc({ packageName: 'chalk', externals })
    .target('compiled/chalk')
}

// eslint-disable-next-line camelcase
externals['browserslist'] = 'next/dist/compiled/browserslist'
export async function ncc_browserslist(task, opts) {
  const browserslistModule = require.resolve('browserslist')
  const nodeFile = join(dirname(browserslistModule), 'node.js')

  const content = await fs.readFile(nodeFile, 'utf8')
  // ensure ncc doesn't attempt to bundle dynamic requires
  // so that they work at runtime correctly
  await fs.writeFile(
    nodeFile,
    content.replace(
      /require\(require\.resolve\(/g,
      `__non_webpack_require__(__non_webpack_require__.resolve(`
    )
  )

  await task
    .source(opts.src || relative(__dirname, require.resolve('browserslist')))
    .ncc({ packageName: 'browserslist', externals })
    .target('compiled/browserslist')

  await fs.writeFile(nodeFile, content)
}

// eslint-disable-next-line camelcase
externals['@napi-rs/triples'] = 'next/dist/compiled/@napi-rs/triples'
export async function ncc_napirs_triples(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('@napi-rs/triples'))
    )
    .ncc({ packageName: '@napi-rs/triples', externals })
    .target('compiled/@napi-rs/triples')
}

// eslint-disable-next-line camelcase
externals['cssnano-simple'] = 'next/dist/compiled/cssnano-simple'
export async function ncc_cssnano_simple(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('cssnano-simple')))
    .ncc({ packageName: 'cssnano-simple', externals })
    .target('compiled/cssnano-simple')
}

// eslint-disable-next-line camelcase
externals['etag'] = 'next/dist/compiled/etag'
export async function ncc_etag(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('etag')))
    .ncc({ packageName: 'etag', externals })
    .target('compiled/etag')
}

// eslint-disable-next-line camelcase
externals['p-limit'] = 'next/dist/compiled/p-limit'
export async function ncc_p_limit(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('p-limit')))
    .ncc({ packageName: 'p-limit', externals })
    .target('compiled/p-limit')
}

// eslint-disable-next-line camelcase
externals['raw-body'] = 'next/dist/compiled/raw-body'
export async function ncc_raw_body(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('raw-body')))
    .ncc({ packageName: 'raw-body', externals })
    .target('compiled/raw-body')
}

// eslint-disable-next-line camelcase
externals['image-size'] = 'next/dist/compiled/image-size'
export async function ncc_image_size(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('image-size')))
    .ncc({ packageName: 'image-size', externals })
    .target('compiled/image-size')
}

// eslint-disable-next-line camelcase
externals['get-orientation'] = 'next/dist/compiled/get-orientation'
export async function ncc_get_orientation(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('get-orientation')))
    .ncc({ packageName: 'get-orientation', externals })
    .target('compiled/get-orientation')
}

// eslint-disable-next-line camelcase
externals['@hapi/accept'] = 'next/dist/compiled/@hapi/accept'
export async function ncc_hapi_accept(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('@hapi/accept')))
    .ncc({ packageName: '@hapi/accept', externals })
    .target('compiled/@hapi/accept')
}

// eslint-disable-next-line camelcase
externals['amphtml-validator'] = 'next/dist/compiled/amphtml-validator'
export async function ncc_amphtml_validator(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('amphtml-validator'))
    )
    .ncc({ packageName: 'amphtml-validator', externals })
    .target('compiled/amphtml-validator')
}

// eslint-disable-next-line camelcase
export async function ncc_assert(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('assert/')))
    .ncc({
      packageName: 'assert',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('compiled/assert')
}

// eslint-disable-next-line camelcase
export async function ncc_browser_zlib(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('browserify-zlib/'))
    )
    .ncc({
      packageName: 'browserify-zlib',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('compiled/browserify-zlib')
}

// eslint-disable-next-line camelcase
export async function ncc_buffer(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('buffer/')))
    .ncc({
      packageName: 'buffer',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('compiled/buffer')
}

// eslint-disable-next-line camelcase
export async function copy_react_is(task, opts) {
  await task
    .source(join(dirname(require.resolve('react-is/package.json')), '**/*'))
    .target('compiled/react-is')
}

// eslint-disable-next-line camelcase
export async function copy_constants_browserify(task, opts) {
  await fs.mkdir(join(__dirname, 'compiled/constants-browserify'), {
    recursive: true,
  })
  await fs.writeFile(
    join(__dirname, 'compiled/constants-browserify/package.json'),
    JSON.stringify({ name: 'constants-browserify', main: './constants.json' })
  )
  await task
    .source(require.resolve('constants-browserify'))
    .target('compiled/constants-browserify')
}

// eslint-disable-next-line camelcase
export async function ncc_crypto_browserify(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('crypto-browserify/'))
    )
    .ncc({
      packageName: 'crypto-browserify',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('compiled/crypto-browserify')
}

// eslint-disable-next-line camelcase
export async function ncc_domain_browser(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('domain-browser/')))
    .ncc({
      packageName: 'domain-browser',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('compiled/domain-browser')
}

// eslint-disable-next-line camelcase
export async function ncc_events(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('events/')))
    .ncc({
      packageName: 'events',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('compiled/events')
}

// eslint-disable-next-line camelcase
export async function ncc_stream_browserify(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('stream-browserify/'))
    )
    .ncc({
      packageName: 'stream-browserify',
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('compiled/stream-browserify')

  // while ncc'ing readable-stream the browser mapping does not replace the
  // require('stream') with require('events').EventEmitter correctly so we
  // patch this manually as leaving require('stream') causes a circular
  // reference breaking the browser polyfill
  const outputFile = join(__dirname, 'compiled/stream-browserify/index.js')

  fs.writeFileSync(
    outputFile,
    fs
      .readFileSync(outputFile, 'utf8')
      .replace(`require("stream")`, `require("events").EventEmitter`)
  )
}

// eslint-disable-next-line camelcase
export async function ncc_stream_http(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('stream-http/')))
    .ncc({
      packageName: 'stream-http',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('compiled/stream-http')
}

// eslint-disable-next-line camelcase
export async function ncc_https_browserify(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('https-browserify/'))
    )
    .ncc({
      packageName: 'https-browserify',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('compiled/https-browserify')
}

// eslint-disable-next-line camelcase
export async function ncc_os_browserify(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('os-browserify/browser'))
    )
    .ncc({
      packageName: 'os-browserify',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('compiled/os-browserify')
}

// eslint-disable-next-line camelcase
export async function ncc_path_browserify(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('path-browserify/'))
    )
    .ncc({
      packageName: 'path-browserify',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('compiled/path-browserify')
}

// eslint-disable-next-line camelcase
export async function ncc_process(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('process/browser')))
    .ncc({
      packageName: 'process',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('compiled/process')
}

// eslint-disable-next-line camelcase
export async function ncc_querystring_es3(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('querystring-es3/'))
    )
    .ncc({
      packageName: 'querystring-es3',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('compiled/querystring-es3')
}

// eslint-disable-next-line camelcase
export async function ncc_string_decoder(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('string_decoder/')))
    .ncc({
      packageName: 'string_decoder',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('compiled/string_decoder')
}

// eslint-disable-next-line camelcase
export async function ncc_util(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('util/')))
    .ncc({
      packageName: 'util',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('compiled/util')
}

// eslint-disable-next-line camelcase
export async function ncc_punycode(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('punycode/')))
    .ncc({
      packageName: 'punycode',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('compiled/punycode')
}

// eslint-disable-next-line camelcase
export async function ncc_set_immediate(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('setimmediate/')))
    .ncc({
      packageName: 'setimmediate',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('compiled/setimmediate')
}

// eslint-disable-next-line camelcase
export async function ncc_timers_browserify(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('timers-browserify/'))
    )
    .ncc({
      packageName: 'timers-browserify',
      externals: {
        ...externals,
        setimmediate: 'next/dist/compiled/setimmediate',
      },
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('compiled/timers-browserify')
}

// eslint-disable-next-line camelcase
export async function ncc_tty_browserify(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('tty-browserify/')))
    .ncc({
      packageName: 'tty-browserify',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('compiled/tty-browserify')
}

// eslint-disable-next-line camelcase
export async function ncc_vm_browserify(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('vm-browserify/')))
    .ncc({
      packageName: 'vm-browserify',
      externals,
      mainFields: ['browser', 'main'],
      target: 'es5',
    })
    .target('compiled/vm-browserify')
}

// eslint-disable-next-line camelcase
externals['@ampproject/toolbox-optimizer'] =
  'next/dist/compiled/@ampproject/toolbox-optimizer'
export async function ncc_amp_optimizer(task, opts) {
  await task
    .source(
      opts.src ||
        relative(__dirname, require.resolve('@ampproject/toolbox-optimizer'))
    )
    .ncc({
      externals,
      precompiled: false,
      packageName: '@ampproject/toolbox-optimizer',
    })
    .target('dist/compiled/@ampproject/toolbox-optimizer')
}
// eslint-disable-next-line camelcase
externals['arg'] = 'next/dist/compiled/arg'
export async function ncc_arg(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('arg')))
    .ncc({ packageName: 'arg' })
    .target('compiled/arg')
}
// eslint-disable-next-line camelcase
externals['async-retry'] = 'next/dist/compiled/async-retry'
export async function ncc_async_retry(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('async-retry')))
    .ncc({
      packageName: 'async-retry',
      externals,
    })
    .target('compiled/async-retry')
}
// eslint-disable-next-line camelcase
externals['async-sema'] = 'next/dist/compiled/async-sema'
export async function ncc_async_sema(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('async-sema')))
    .ncc({ packageName: 'async-sema', externals })
    .target('compiled/async-sema')
}

const babelCorePackages = {
  'code-frame': 'next/dist/compiled/babel/code-frame',
  '@babel/generator': 'next/dist/compiled/babel/generator',
  '@babel/traverse': 'next/dist/compiled/babel/traverse',
  '@babel/types': 'next/dist/compiled/babel/types',
  '@babel/core': 'next/dist/compiled/babel/core',
  '@babel/parser': 'next/dist/compiled/babel/parser',
  '@babel/core/lib/config': 'next/dist/compiled/babel/core-lib-config',
  '@babel/core/lib/transformation/normalize-file':
    'next/dist/compiled/babel/core-lib-normalize-config',
  '@babel/core/lib/transformation/normalize-opts':
    'next/dist/compiled/babel/core-lib-normalize-opts',
  '@babel/core/lib/transformation/block-hoist-plugin':
    'next/dist/compiled/babel/core-lib-block-hoisting-plugin',
  '@babel/core/lib/transformation/plugin-pass':
    'next/dist/compiled/babel/core-lib-plugin-pass',
}

Object.assign(externals, babelCorePackages)

// eslint-disable-next-line camelcase
export async function ncc_babel_bundle(task, opts) {
  const bundleExternals = {
    ...externals,
    'next/dist/compiled/babel-packages': 'next/dist/compiled/babel-packages',
  }
  for (const pkg of Object.keys(babelCorePackages)) {
    delete bundleExternals[pkg]
  }
  await task
    .source(opts.src || 'bundles/babel/bundle.js')
    .ncc({
      packageName: '@babel/core',
      bundleName: 'babel',
      externals: bundleExternals,
    })
    .target('compiled/babel')
}

// eslint-disable-next-line camelcase
export async function ncc_babel_bundle_packages(task, opts) {
  const eslintParseFile = join(
    dirname(require.resolve('@babel/eslint-parser')),
    './parse.cjs'
  )
  const content = fs.readFileSync(eslintParseFile, 'utf-8')
  // Let parser.cjs require @babel/parser directly
  const replacedContent = content
    .replace(
      `const babelParser = require((`,
      `function noop(){};\nconst babelParser = require('@babel/parser');noop((`
    )
    .replace(/require.resolve/g, 'noop')
  await fs.writeFile(eslintParseFile, replacedContent)

  await task
    .source(opts.src || 'bundles/babel/packages-bundle.js')
    .ncc({
      externals: externals,
    })
    .target(`compiled/babel-packages`)

  await fs.writeFile(
    join(__dirname, 'compiled/babel-packages/package.json'),
    JSON.stringify({ name: 'babel-packages', main: './packages-bundle.js' })
  )

  await task
    .source(opts.src || 'bundles/babel/packages/*')
    .target('compiled/babel')
}

// eslint-disable-next-line camelcase
externals['bytes'] = 'next/dist/compiled/bytes'
export async function ncc_bytes(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('bytes')))
    .ncc({ packageName: 'bytes', externals })
    .target('compiled/bytes')
}
// eslint-disable-next-line camelcase
externals['ci-info'] = 'next/dist/compiled/ci-info'
export async function ncc_ci_info(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('ci-info')))
    .ncc({ packageName: 'ci-info', externals })
    .target('compiled/ci-info')
}
// eslint-disable-next-line camelcase
externals['cli-select'] = 'next/dist/compiled/cli-select'
export async function ncc_cli_select(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('cli-select')))
    .ncc({ packageName: 'cli-select', externals })
    .target('compiled/cli-select')
}
externals['comment-json'] = 'next/dist/compiled/comment-json'
export async function ncc_comment_json(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('comment-json')))
    .ncc({ packageName: 'comment-json', externals })
    .target('compiled/comment-json')
}
// eslint-disable-next-line camelcase
externals['compression'] = 'next/dist/compiled/compression'
export async function ncc_compression(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('compression')))
    .ncc({ packageName: 'compression', externals })
    .target('compiled/compression')
}
// eslint-disable-next-line camelcase
externals['conf'] = 'next/dist/compiled/conf'
export async function ncc_conf(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('conf')))
    .ncc({ packageName: 'conf', externals })
    .target('compiled/conf')
}
// eslint-disable-next-line camelcase
externals['content-disposition'] = 'next/dist/compiled/content-disposition'
export async function ncc_content_disposition(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('content-disposition'))
    )
    .ncc({ packageName: 'content-disposition', externals })
    .target('compiled/content-disposition')
}
// eslint-disable-next-line camelcase
externals['content-type'] = 'next/dist/compiled/content-type'
export async function ncc_content_type(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('content-type')))
    .ncc({ packageName: 'content-type', externals })
    .target('compiled/content-type')
}
// eslint-disable-next-line camelcase
externals['cookie'] = 'next/dist/compiled/cookie'
export async function ncc_cookie(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('cookie')))
    .ncc({ packageName: 'cookie', externals })
    .target('compiled/cookie')
}
// eslint-disable-next-line camelcase
externals['cross-spawn'] = 'next/dist/compiled/cross-spawn'
export async function ncc_cross_spawn(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('cross-spawn')))
    .ncc({ packageName: 'cross-spawn', externals })
    .target('compiled/cross-spawn')
}
// eslint-disable-next-line camelcase
externals['debug'] = 'next/dist/compiled/debug'
export async function ncc_debug(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('debug')))
    .ncc({ packageName: 'debug', externals })
    .target('compiled/debug')
}
// eslint-disable-next-line camelcase
externals['devalue'] = 'next/dist/compiled/devalue'
export async function ncc_devalue(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('devalue')))
    .ncc({ packageName: 'devalue', externals })
    .target('compiled/devalue')
}

// eslint-disable-next-line camelcase
externals['find-cache-dir'] = 'next/dist/compiled/find-cache-dir'
export async function ncc_find_cache_dir(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('find-cache-dir')))
    .ncc({ packageName: 'find-cache-dir', externals })
    .target('compiled/find-cache-dir')
}
// eslint-disable-next-line camelcase
externals['find-up'] = 'next/dist/compiled/find-up'
export async function ncc_find_up(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('find-up')))
    .ncc({ packageName: 'find-up', externals })
    .target('compiled/find-up')
}
// eslint-disable-next-line camelcase
externals['fresh'] = 'next/dist/compiled/fresh'
export async function ncc_fresh(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('fresh')))
    .ncc({ packageName: 'fresh', externals })
    .target('compiled/fresh')
}
// eslint-disable-next-line camelcase
externals['glob'] = 'next/dist/compiled/glob'
export async function ncc_glob(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('glob')))
    .ncc({ packageName: 'glob', externals })
    .target('compiled/glob')
}
// eslint-disable-next-line camelcase
externals['gzip-size'] = 'next/dist/compiled/gzip-size'
export async function ncc_gzip_size(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('gzip-size')))
    .ncc({ packageName: 'gzip-size', externals })
    .target('compiled/gzip-size')
}
// eslint-disable-next-line camelcase
externals['http-proxy'] = 'next/dist/compiled/http-proxy'
export async function ncc_http_proxy(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('http-proxy')))
    .ncc({ packageName: 'http-proxy', externals })
    .target('compiled/http-proxy')
}
// eslint-disable-next-line camelcase
externals['ignore-loader'] = 'next/dist/compiled/ignore-loader'
export async function ncc_ignore_loader(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('ignore-loader')))
    .ncc({ packageName: 'ignore-loader', externals })
    .target('compiled/ignore-loader')
}
// eslint-disable-next-line camelcase
externals['is-animated'] = 'next/dist/compiled/is-animated'
export async function ncc_is_animated(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('is-animated')))
    .ncc({ packageName: 'is-animated', externals })
    .target('compiled/is-animated')
}
// eslint-disable-next-line camelcase
externals['is-docker'] = 'next/dist/compiled/is-docker'
export async function ncc_is_docker(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('is-docker')))
    .ncc({ packageName: 'is-docker', externals })
    .target('compiled/is-docker')
}
// eslint-disable-next-line camelcase
externals['is-wsl'] = 'next/dist/compiled/is-wsl'
export async function ncc_is_wsl(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('is-wsl')))
    .ncc({ packageName: 'is-wsl', externals })
    .target('compiled/is-wsl')
}
// eslint-disable-next-line camelcase
externals['json5'] = 'next/dist/compiled/json5'
export async function ncc_json5(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('json5')))
    .ncc({ packageName: 'json5', externals })
    .target('compiled/json5')
}
// eslint-disable-next-line camelcase
externals['jsonwebtoken'] = 'next/dist/compiled/jsonwebtoken'
export async function ncc_jsonwebtoken(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('jsonwebtoken')))
    .ncc({ packageName: 'jsonwebtoken', externals })
    .target('compiled/jsonwebtoken')
}
// eslint-disable-next-line camelcase
externals['loader-utils'] = 'error loader-utils version not specified'
externals['loader-utils2'] = 'next/dist/compiled/loader-utils2'
export async function ncc_loader_utils2(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('loader-utils2')))
    .ncc({ packageName: 'loader-utils2', externals })
    .target('compiled/loader-utils2')
}
// eslint-disable-next-line camelcase
externals['loader-utils3'] = 'next/dist/compiled/loader-utils3'
export async function ncc_loader_utils3(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('loader-utils3')))
    .ncc({ packageName: 'loader-utils3', externals })
    .target('compiled/loader-utils3')
}
// eslint-disable-next-line camelcase
externals['lodash.curry'] = 'next/dist/compiled/lodash.curry'
export async function ncc_lodash_curry(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('lodash.curry')))
    .ncc({ packageName: 'lodash.curry', externals })
    .target('compiled/lodash.curry')
}
// eslint-disable-next-line camelcase
externals['lru-cache'] = 'next/dist/compiled/lru-cache'
export async function ncc_lru_cache(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('lru-cache')))
    .ncc({ packageName: 'lru-cache', externals })
    .target('compiled/lru-cache')
}
// eslint-disable-next-line camelcase
externals['nanoid'] = 'next/dist/compiled/nanoid'
export async function ncc_nanoid(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('nanoid')))
    .ncc({ packageName: 'nanoid', externals })
    .target('compiled/nanoid')
}
// eslint-disable-next-line camelcase
externals['native-url'] = 'next/dist/compiled/native-url'
export async function ncc_native_url(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('native-url')))
    .ncc({ packageName: 'native-url', externals, target: 'es5' })
    .target('compiled/native-url')
}
// eslint-disable-next-line camelcase
externals['neo-async'] = 'next/dist/compiled/neo-async'
export async function ncc_neo_async(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('neo-async')))
    .ncc({ packageName: 'neo-async', externals })
    .target('compiled/neo-async')
}

// eslint-disable-next-line camelcase
externals['ora'] = 'next/dist/compiled/ora'
export async function ncc_ora(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('ora')))
    .ncc({ packageName: 'ora', externals })
    .target('compiled/ora')
}
// eslint-disable-next-line camelcase
externals['postcss-flexbugs-fixes'] =
  'next/dist/compiled/postcss-flexbugs-fixes'
export async function ncc_postcss_flexbugs_fixes(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('postcss-flexbugs-fixes'))
    )
    .ncc({ packageName: 'postcss-flexbugs-fixes', externals })
    .target('compiled/postcss-flexbugs-fixes')
}
// eslint-disable-next-line camelcase
export async function ncc_postcss_safe_parser(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('postcss-safe-parser'))
    )
    .ncc({ packageName: 'postcss-safe-parser', externals })
    .target('compiled/postcss-safe-parser')
}
// eslint-disable-next-line camelcase
externals['postcss-preset-env'] = 'next/dist/compiled/postcss-preset-env'
export async function ncc_postcss_preset_env(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('postcss-preset-env'))
    )
    .ncc({ packageName: 'postcss-preset-env', externals })
    .target('compiled/postcss-preset-env')
}
// eslint-disable-next-line camelcase
externals['postcss-scss'] = 'next/dist/compiled/postcss-scss'
export async function ncc_postcss_scss(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('postcss-scss')))
    .ncc({
      packageName: 'postcss-scss',
      externals: {
        'postcss/lib/parser': 'postcss/lib/parser',
        ...externals,
      },
    })
    .target('compiled/postcss-scss')
}
// eslint-disable-next-line camelcase
externals['postcss-modules-extract-imports'] =
  'next/dist/compiled/postcss-modules-extract-imports'
export async function ncc_postcss_modules_extract_imports(task, opts) {
  await task
    .source(
      opts.src ||
        relative(__dirname, require.resolve('postcss-modules-extract-imports'))
    )
    .ncc({
      packageName: 'postcss-modules-extract-imports',
      externals: {
        'postcss/lib/parser': 'postcss/lib/parser',
        ...externals,
      },
    })
    .target('compiled/postcss-modules-extract-imports')
}
// eslint-disable-next-line camelcase
externals['postcss-modules-local-by-default'] =
  'next/dist/compiled/postcss-modules-local-by-default'
export async function ncc_postcss_modules_local_by_default(task, opts) {
  await task
    .source(
      opts.src ||
        relative(__dirname, require.resolve('postcss-modules-local-by-default'))
    )
    .ncc({
      packageName: 'postcss-modules-local-by-default',
      externals: {
        'postcss/lib/parser': 'postcss/lib/parser',
        ...externals,
      },
    })
    .target('compiled/postcss-modules-local-by-default')
}
// eslint-disable-next-line camelcase
externals['postcss-modules-scope'] = 'next/dist/compiled/postcss-modules-scope'
export async function ncc_postcss_modules_scope(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('postcss-modules-scope'))
    )
    .ncc({
      packageName: 'postcss-modules-scope',
      externals: {
        'postcss/lib/parser': 'postcss/lib/parser',
        ...externals,
      },
    })
    .target('compiled/postcss-modules-scope')
}
// eslint-disable-next-line camelcase
externals['postcss-modules-values'] =
  'next/dist/compiled/postcss-modules-values'
export async function ncc_postcss_modules_values(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('postcss-modules-values'))
    )
    .ncc({
      packageName: 'postcss-modules-values',
      externals: {
        'postcss/lib/parser': 'postcss/lib/parser',
        ...externals,
      },
    })
    .target('compiled/postcss-modules-values')
}
// eslint-disable-next-line camelcase
externals['postcss-value-parser'] = 'next/dist/compiled/postcss-value-parser'
export async function ncc_postcss_value_parser(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('postcss-value-parser'))
    )
    .ncc({
      packageName: 'postcss-value-parser',
      externals: {
        'postcss/lib/parser': 'postcss/lib/parser',
        ...externals,
      },
    })
    .target('compiled/postcss-value-parser')
}
// eslint-disable-next-line camelcase
externals['icss-utils'] = 'next/dist/compiled/icss-utils'
export async function ncc_icss_utils(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('icss-utils')))
    .ncc({
      packageName: 'icss-utils',
      externals: {
        'postcss/lib/parser': 'postcss/lib/parser',
        ...externals,
      },
    })
    .target('compiled/icss-utils')
}
// eslint-disable-next-line camelcase
export async function copy_react_server_dom_webpack(task, opts) {
  await fs.mkdir(join(__dirname, 'compiled/react-server-dom-webpack'), {
    recursive: true,
  })
  await fs.writeFile(
    join(__dirname, 'compiled/react-server-dom-webpack/package.json'),
    JSON.stringify({ name: 'react-server-dom-webpack', main: './index.js' })
  )
  await task
    .source(require.resolve('react-server-dom-webpack'))
    .target('compiled/react-server-dom-webpack')

  await task
    .source(
      join(
        dirname(require.resolve('react-server-dom-webpack')),
        'cjs/react-server-dom-webpack.*'
      )
    )
    .target('compiled/react-server-dom-webpack/cjs')

  await task
    .source(
      join(
        dirname(require.resolve('react-server-dom-webpack')),
        'cjs/react-server-dom-webpack-writer.browser.*'
      )
    )
    .target('compiled/react-server-dom-webpack/cjs')

  await task
    .source(
      join(
        dirname(require.resolve('react-server-dom-webpack')),
        'writer.browser.server.js'
      )
    )
    .target('compiled/react-server-dom-webpack')
}

// eslint-disable-next-line camelcase
externals['sass-loader'] = 'next/dist/compiled/sass-loader'
export async function ncc_sass_loader(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('sass-loader')))
    .ncc({
      packageName: 'sass-loader',
      customEmit(path, isRequire) {
        if (isRequire && path === 'sass') return false
        if (path.indexOf('node-sass') !== -1)
          return `eval("require.resolve('node-sass')")`
      },
      externals: {
        ...externals,
        'schema-utils': externals['schema-utils3'],
        'loader-utils': externals['loader-utils2'],
      },
      target: 'es5',
    })
    .target('compiled/sass-loader')
}
// eslint-disable-next-line camelcase
externals['schema-utils'] = 'MISSING_VERSION schema-utils version not specified'
externals['schema-utils2'] = 'next/dist/compiled/schema-utils2'
export async function ncc_schema_utils2(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('schema-utils2')))
    .ncc({
      packageName: 'schema-utils',
      bundleName: 'schema-utils2',
      externals,
    })
    .target('compiled/schema-utils2')
}
// eslint-disable-next-line camelcase
externals['schema-utils3'] = 'next/dist/compiled/schema-utils3'
export async function ncc_schema_utils3(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('schema-utils3')))
    .ncc({
      packageName: 'schema-utils',
      bundleName: 'schema-utils3',
      externals,
    })
    .target('compiled/schema-utils3')
}
externals['semver'] = 'next/dist/compiled/semver'
export async function ncc_semver(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('semver')))
    .ncc({ packageName: 'semver', externals })
    .target('compiled/semver')
}
// eslint-disable-next-line camelcase
externals['send'] = 'next/dist/compiled/send'
export async function ncc_send(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('send')))
    .ncc({ packageName: 'send', externals })
    .target('compiled/send')
}
// eslint-disable-next-line camelcase
// NB: Used by other dependencies, but Vercel version is a duplicate
// version so can be inlined anyway (although may change in future)
externals['source-map'] = 'next/dist/compiled/source-map'
export async function ncc_source_map(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('source-map')))
    .ncc({ packageName: 'source-map', externals })
    .target('compiled/source-map')
}
// eslint-disable-next-line camelcase
externals['string-hash'] = 'next/dist/compiled/string-hash'
export async function ncc_string_hash(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('string-hash')))
    .ncc({ packageName: 'string-hash', externals })
    .target('compiled/string-hash')
}
// eslint-disable-next-line camelcase
externals['strip-ansi'] = 'next/dist/compiled/strip-ansi'
export async function ncc_strip_ansi(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('strip-ansi')))
    .ncc({ packageName: 'strip-ansi', externals })
    .target('compiled/strip-ansi')
}
// eslint-disable-next-line camelcase
externals['@vercel/nft'] = 'next/dist/compiled/@vercel/nft'
export async function ncc_nft(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('@vercel/nft')))
    .ncc({ packageName: '@vercel/nft', externals })
    .target('compiled/@vercel/nft')
}
// eslint-disable-next-line camelcase
externals['terser'] = 'next/dist/compiled/terser'
export async function ncc_terser(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('terser')))
    .ncc({ packageName: 'terser', externals })
    .target('compiled/terser')
}
// eslint-disable-next-line camelcase
externals['text-table'] = 'next/dist/compiled/text-table'
export async function ncc_text_table(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('text-table')))
    .ncc({ packageName: 'text-table', externals })
    .target('compiled/text-table')
}
// eslint-disable-next-line camelcase
externals['unistore'] = 'next/dist/compiled/unistore'
export async function ncc_unistore(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('unistore')))
    .ncc({ packageName: 'unistore', externals })
    .target('compiled/unistore')
}
// eslint-disable-next-line camelcase
externals['web-vitals'] = 'next/dist/compiled/web-vitals'
export async function ncc_web_vitals(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('web-vitals')))
    .ncc({ packageName: 'web-vitals', externals, target: 'es5' })
    .target('compiled/web-vitals')
}
// eslint-disable-next-line camelcase
externals['webpack-sources'] = 'error webpack-sources version not specified'
externals['webpack-sources1'] = 'next/dist/compiled/webpack-sources1'
export async function ncc_webpack_sources1(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('webpack-sources1'))
    )
    .ncc({ packageName: 'webpack-sources1', externals, target: 'es5' })
    .target('compiled/webpack-sources1')
}
// eslint-disable-next-line camelcase
externals['webpack-sources3'] = 'next/dist/compiled/webpack-sources3'
export async function ncc_webpack_sources3(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('webpack-sources3'))
    )
    .ncc({ packageName: 'webpack-sources3', externals, target: 'es5' })
    .target('compiled/webpack-sources3')
}

// eslint-disable-next-line camelcase
externals['micromatch'] = 'next/dist/compiled/micromatch'
export async function ncc_minimatch(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('micromatch')))
    .ncc({ packageName: 'micromatch', externals })
    .target('compiled/micromatch')
}

// eslint-disable-next-line camelcase
externals['mini-css-extract-plugin'] =
  'next/dist/compiled/mini-css-extract-plugin'
export async function ncc_mini_css_extract_plugin(task, opts) {
  await task
    .source(
      relative(
        __dirname,
        resolve(require.resolve('mini-css-extract-plugin'), '../index.js')
      )
    )
    .ncc({
      externals: {
        ...externals,
        './index': './index.js',
        'schema-utils': externals['schema-utils3'],
        'webpack-sources': externals['webpack-sources1'],
      },
    })
    .target('compiled/mini-css-extract-plugin')
  await task
    .source(
      opts.src ||
        relative(__dirname, require.resolve('mini-css-extract-plugin'))
    )
    .ncc({
      packageName: 'mini-css-extract-plugin',
      externals: {
        ...externals,
        './index': './index.js',
        'schema-utils': externals['schema-utils3'],
      },
    })
    .target('compiled/mini-css-extract-plugin')
}
// eslint-disable-next-line camelcase
externals['web-streams-polyfill'] = 'next/dist/compiled/web-streams-polyfill'
export async function ncc_web_streams_polyfill(task, opts) {
  await task
    .source(
      opts.src ||
        relative(__dirname, require.resolve('web-streams-polyfill/ponyfill'))
    )
    .ncc({ packageName: 'web-streams-polyfill', externals })
    .target('compiled/web-streams-polyfill')
}
// eslint-disable-next-line camelcase
externals['abort-controller'] = 'next/dist/compiled/abort-controller'
export async function ncc_abort_controller(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('abort-controller'))
    )
    .ncc({ packageName: 'abort-controller', externals })
    .target('compiled/abort-controller')
}
// eslint-disable-next-line camelcase
externals['formdata-node'] = 'next/dist/compiled/formdata-node'
export async function ncc_formdata_node(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('formdata-node')))
    .ncc({ packageName: 'formdata-node', externals })
    .target('compiled/formdata-node')
}
// eslint-disable-next-line camelcase
externals['ua-parser-js'] = 'next/dist/compiled/ua-parser-js'
export async function ncc_ua_parser_js(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('ua-parser-js')))
    .ncc({ packageName: 'ua-parser-js', externals })
    .target('compiled/ua-parser-js')
}
// eslint-disable-next-line camelcase
externals['@peculiar/webcrypto'] = 'next/dist/compiled/@peculiar/webcrypto'
export async function ncc_webcrypto(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('@peculiar/webcrypto'))
    )
    .ncc({ packageName: '@peculiar/webcrypto', externals })
    .target('compiled/@peculiar/webcrypto')
}
// eslint-disable-next-line camelcase
externals['uuid'] = 'next/dist/compiled/uuid'
export async function ncc_uuid(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('uuid')))
    .ncc({ packageName: 'uuid', externals })
    .target('compiled/uuid')
}

// eslint-disable-next-line camelcase
export async function ncc_webpack_bundle5(task, opts) {
  const bundleExternals = {
    ...externals,
    'schema-utils': externals['schema-utils3'],
    'webpack-sources': externals['webpack-sources3'],
  }
  for (const pkg of Object.keys(webpackBundlePackages)) {
    delete bundleExternals[pkg]
  }
  await task
    .source(opts.src || 'bundles/webpack/bundle5.js')
    .ncc({
      packageName: 'webpack5',
      bundleName: 'webpack',
      customEmit(path) {
        if (path.endsWith('.runtime.js')) return `'./${basename(path)}'`
      },
      externals: bundleExternals,
      minify: false,
      target: 'es5',
    })
    .target('compiled/webpack')
}

const webpackBundlePackages = {
  webpack: 'next/dist/compiled/webpack/webpack-lib',
  'webpack/lib/NormalModule': 'next/dist/compiled/webpack/NormalModule',
  'webpack/lib/node/NodeTargetPlugin':
    'next/dist/compiled/webpack/NodeTargetPlugin',
}

Object.assign(externals, webpackBundlePackages)

export async function ncc_webpack_bundle_packages(task, opts) {
  await task
    .source(opts.src || 'bundles/webpack/packages/*')
    .target('compiled/webpack/')
}

// eslint-disable-next-line camelcase
externals['ws'] = 'next/dist/compiled/ws'
export async function ncc_ws(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('ws')))
    .ncc({ packageName: 'ws', externals })
    .target('compiled/ws')
}

externals['path-to-regexp'] = 'next/dist/compiled/path-to-regexp'
export async function path_to_regexp(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('path-to-regexp')))
    .target('dist/compiled/path-to-regexp')
}

export async function precompile(task, opts) {
  await task.parallel(
    ['browser_polyfills', 'path_to_regexp', 'copy_ncced'],
    opts
  )
}

// eslint-disable-next-line camelcase
export async function copy_ncced(task) {
  // we don't ncc every time we build since these won't change
  // that often and can be committed to the repo saving build time
  await task.source('compiled/**/*').target('dist/compiled')
}

export async function ncc(task, opts) {
  await task
    .clear('compiled')
    .parallel(
      [
        'ncc_node_html_parser',
        'ncc_watchpack',
        'ncc_chalk',
        'ncc_use_subscription',
        'ncc_napirs_triples',
        'ncc_etag',
        'ncc_p_limit',
        'ncc_raw_body',
        'ncc_cssnano_simple',
        'ncc_image_size',
        'ncc_get_orientation',
        'ncc_hapi_accept',
        'ncc_node_fetch',
        'ncc_acorn',
        'ncc_amphtml_validator',
        'ncc_arg',
        'ncc_async_retry',
        'ncc_async_sema',
        'ncc_assert',
        'ncc_browser_zlib',
        'ncc_buffer',
        'ncc_crypto_browserify',
        'ncc_domain_browser',
        'ncc_events',
        'ncc_stream_browserify',
        'ncc_stream_http',
        'ncc_https_browserify',
        'ncc_os_browserify',
        'ncc_path_browserify',
        'ncc_process',
        'ncc_querystring_es3',
        'ncc_string_decoder',
        'ncc_util',
        'ncc_punycode',
        'ncc_set_immediate',
        'ncc_timers_browserify',
        'ncc_tty_browserify',
        'ncc_vm_browserify',
        'ncc_babel_bundle',
        'ncc_bytes',
        'ncc_ci_info',
        'ncc_cli_select',
        'ncc_comment_json',
        'ncc_compression',
        'ncc_conf',
        'ncc_content_disposition',
        'ncc_content_type',
        'ncc_cookie',
        'ncc_cross_spawn',
        'ncc_debug',
        'ncc_devalue',
        'ncc_find_cache_dir',
        'ncc_find_up',
        'ncc_fresh',
        'ncc_glob',
        'ncc_gzip_size',
        'ncc_http_proxy',
        'ncc_ignore_loader',
        'ncc_is_animated',
        'ncc_is_docker',
        'ncc_is_wsl',
        'ncc_json5',
        'ncc_jsonwebtoken',
        'ncc_loader_utils2',
        'ncc_loader_utils3',
        'ncc_lodash_curry',
        'ncc_lru_cache',
        'ncc_nanoid',
        'ncc_native_url',
        'ncc_neo_async',
        'ncc_ora',
        'ncc_postcss_safe_parser',
        'ncc_postcss_flexbugs_fixes',
        'ncc_postcss_preset_env',
        'ncc_postcss_scss',
        'ncc_postcss_modules_extract_imports',
        'ncc_postcss_modules_local_by_default',
        'ncc_postcss_modules_scope',
        'ncc_postcss_modules_values',
        'ncc_postcss_value_parser',
        'ncc_icss_utils',
        'ncc_sass_loader',
        'ncc_schema_utils2',
        'ncc_schema_utils3',
        'ncc_semver',
        'ncc_send',
        'ncc_source_map',
        'ncc_string_hash',
        'ncc_strip_ansi',
        'ncc_nft',
        'ncc_terser',
        'ncc_text_table',
        'ncc_unistore',
        'ncc_web_vitals',
        'ncc_webpack_bundle5',
        'ncc_webpack_sources1',
        'ncc_webpack_sources3',
        'ncc_ws',
        'ncc_ua_parser_js',
        'ncc_webcrypto',
        'ncc_uuid',
        'ncc_formdata_node',
        'ncc_web_streams_polyfill',
        'ncc_abort_controller',
        'ncc_minimatch',
        'ncc_mini_css_extract_plugin',
      ],
      opts
    )
  await task.parallel(['ncc_webpack_bundle_packages'], opts)
  await task.parallel(['ncc_babel_bundle_packages'], opts)
  await task.serial(
    [
      'ncc_browserslist',
      'copy_regenerator_runtime',
      'copy_babel_runtime',
      'copy_constants_browserify',
      'copy_react_server_dom_webpack',
      'copy_react_is',
      'ncc_jest_worker',
    ],
    opts
  )
}

export async function compile(task, opts) {
  await task.parallel(
    [
      'cli',
      'bin',
      'server',
      'nextbuild',
      'nextbuildstatic',
      'pages',
      'lib',
      'client',
      'telemetry',
      'trace',
      'shared',
      'server_wasm',
      // we compile this each time so that fresh runtime data is pulled
      // before each publish
      'ncc_amp_optimizer',
    ],
    opts
  )
  await task.serial(['ncc_react_refresh_utils', 'ncc_next__react_dev_overlay'])
}

export async function bin(task, opts) {
  await task
    .source(opts.src || 'bin/*')
    .swc('server', { stripExtension: true, dev: opts.dev })
    .target('dist/bin', { mode: '0755' })
  notify('Compiled binaries')
}

export async function cli(task, opts) {
  await task
    .source('cli/**/*.+(js|ts|tsx)')
    .swc('server', { dev: opts.dev })
    .target('dist/cli')
  notify('Compiled cli files')
}

export async function lib(task, opts) {
  await task
    .source(opts.src || 'lib/**/*.+(js|ts|tsx)')
    .swc('server', { dev: opts.dev })
    .target('dist/lib')
  notify('Compiled lib files')
}

export async function server(task, opts) {
  await task
    .source(opts.src || 'server/**/*.+(js|ts|tsx)')
    .swc('server', { dev: opts.dev })
    .target('dist/server')
  notify('Compiled server files')
}

export async function nextbuild(task, opts) {
  await task
    .source(opts.src || 'build/**/*.+(js|ts|tsx)', {
      ignore: ['**/fixture/**', '**/tests/**'],
    })
    .swc('server', { dev: opts.dev })
    .target('dist/build')
  notify('Compiled build files')
}

export async function client(task, opts) {
  await task
    .source(opts.src || 'client/**/*.+(js|ts|tsx)')
    .swc('client', { dev: opts.dev, interopClientDefaultExport: true })
    .target('dist/client')
  notify('Compiled client files')
}

// export is a reserved keyword for functions
export async function nextbuildstatic(task, opts) {
  await task
    .source(opts.src || 'export/**/*.+(js|ts|tsx)')
    .swc('server', { dev: opts.dev })
    .target('dist/export')
  notify('Compiled export files')
}

export async function pages_app(task, opts) {
  await task
    .source('pages/_app.tsx')
    .swc('client', { dev: opts.dev, keepImportAssertions: true })
    .target('dist/pages')
}

export async function pages_app_server(task, opts) {
  await task
    .source('pages/_app.server.tsx')
    .swc('client', { dev: opts.dev, keepImportAssertions: true })
    .target('dist/pages')
}

export async function pages_error(task, opts) {
  await task
    .source('pages/_error.tsx')
    .swc('client', { dev: opts.dev, keepImportAssertions: true })
    .target('dist/pages')
}

export async function pages_document(task, opts) {
  await task
    .source('pages/_document.tsx')
    .swc('server', { dev: opts.dev, keepImportAssertions: true })
    .target('dist/pages')
}

export async function pages(task, opts) {
  await task.parallel(
    ['pages_app', 'pages_app_server', 'pages_error', 'pages_document'],
    opts
  )
}

export async function telemetry(task, opts) {
  await task
    .source(opts.src || 'telemetry/**/*.+(js|ts|tsx)')
    .swc('server', { dev: opts.dev })
    .target('dist/telemetry')
  notify('Compiled telemetry files')
}

export async function trace(task, opts) {
  await task
    .source(opts.src || 'trace/**/*.+(js|ts|tsx)')
    .swc('server', { dev: opts.dev })
    .target('dist/trace')
  notify('Compiled trace files')
}

export async function build(task, opts) {
  await task.serial(['precompile', 'compile'], opts)
}

export default async function (task) {
  const opts = { dev: true }
  await task.clear('dist')
  await task.start('build', opts)
  await task.watch('bin/*', 'bin', opts)
  await task.watch('pages/**/*.+(js|ts|tsx)', 'pages', opts)
  await task.watch('server/**/*.+(js|ts|tsx)', 'server', opts)
  await task.watch('build/**/*.+(js|ts|tsx)', 'nextbuild', opts)
  await task.watch('export/**/*.+(js|ts|tsx)', 'nextbuildstatic', opts)
  await task.watch('client/**/*.+(js|ts|tsx)', 'client', opts)
  await task.watch('lib/**/*.+(js|ts|tsx)', 'lib', opts)
  await task.watch('cli/**/*.+(js|ts|tsx)', 'cli', opts)
  await task.watch('telemetry/**/*.+(js|ts|tsx)', 'telemetry', opts)
  await task.watch('trace/**/*.+(js|ts|tsx)', 'trace', opts)
  await task.watch('shared/**/*.+(js|ts|tsx)', 'shared', opts)
  await task.watch('server/**/*.+(wasm)', 'server_wasm', opts)
}

export async function shared(task, opts) {
  await task
    .source(opts.src || 'shared/**/*.+(js|ts|tsx)')
    .swc('server', { dev: opts.dev })
    .target('dist/shared')
  notify('Compiled shared files')
}

export async function server_wasm(task, opts) {
  await task.source(opts.src || 'server/**/*.+(wasm)').target('dist/server')
  notify('Moved server wasm files')
}

export async function release(task) {
  await task.clear('dist').start('build')
}

// notification helper
function notify(msg) {
  try {
    notifier.notify({
      title: '▲ Next',
      message: msg,
      icon: false,
    })
  } catch (err) {
    // notifier can fail on M1 machines
  }
}
