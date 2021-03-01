// eslint-disable-next-line import/no-extraneous-dependencies
const { relative, basename, resolve } = require('path')
const { Module } = require('module')

// Note:
// "bundles" folder shadows main node_modules in workspace where all installs in
// this shadow node_modules are alias installs only.
// This is because Yarn alias installs have bugs with version deduping where
// transitive versions are not resolved correctly - for example, webpack5
// will end up resolving webpack-sources@1 instead of webpack-sources@2.
// If/when this issue is fixed upstream in Yarn, this "shadowing" workaround can
// then be removed to directly install the bundles/package.json packages into
// the main package.json as normal devDependencies aliases.
const m = new Module(resolve(__dirname, 'bundles', '_'))
m.filename = m.id
m.paths = Module._nodeModulePaths(m.id)
const bundleRequire = m.require
bundleRequire.resolve = (request, options) =>
  Module._resolveFilename(request, m, false, options)

export async function next__polyfill_nomodule(task, opts) {
  await task
    .source(
      opts.src ||
        relative(__dirname, require.resolve('@next/polyfill-nomodule'))
    )
    .target('compiled/polyfills')
}

const externals = {
  // Browserslist (post-css plugins)
  browserslist: 'browserslist',
  'caniuse-lite': 'caniuse-lite', // FIXME: `autoprefixer` will still bundle this because it uses direct imports
  'caniuse-lite/data/features/border-radius':
    'caniuse-lite/data/features/border-radius',
  'caniuse-lite/data/features/css-featurequeries.js':
    'caniuse-lite/data/features/css-featurequeries',

  chalk: 'chalk',
  'node-fetch': 'node-fetch',
  // postcss: 'postcss',

  // webpack
  'node-libs-browser': 'node-libs-browser',

  // sass-loader
  // (also responsible for these dependencies in package.json)
  'node-sass': 'node-sass',
  sass: 'sass',
  fibers: 'fibers',

  chokidar: 'chokidar',
  'jest-worker': 'jest-worker',
  '@ampproject/toolbox-optimizer':
    'next/dist/compiled/@ampproject/toolbox-optimizer',
  'amphtml-validator': 'next/dist/compiled/amphtml-validator',
  arg: 'dist/compiled/arg',
  'async-retry': 'next/dist/compiled/async-retry',
  'async-sema': 'next/dist/compiled/async-sema',
  bfj: 'next/dist/compiled/bfj',
  cacache: 'next/dist/compiled/cacache',
  'cache-loader': 'next/dist/compiled/cache-loader',
  'ci-info': 'next/dist/compiled/ci-info',
  'comment-json': 'next/dist/compiled/comment-json',
  compression: 'next/dist/compiled/compression',
  conf: 'next/dist/compiled/conf',
  'content-type': 'next/dist/compiled/content-type',
  cookie: 'next/dist/compiled/cookie',
  'css-loader': 'next/dist/compiled/css-loader',
  debug: 'next/dist/compiled/debug',
  devalue: 'next/dist/compiled/devalue',
  'escape-string-regexp': 'next/dist/compiled/escape-string-regexp',
  'file-loader': 'next/dist/compiled/file-loader',
  'find-cache-dir': 'next/dist/compiled/find-cache-dir',
  'find-up': 'next/dist/compiled/find-up',
  fresh: 'next/dist/compiled/fresh',
  'gzip-size': 'next/dist/compiled/gzip-size',
  'http-proxy': 'next/dist/compiled/http-proxy',
  'ignore-loader': 'next/dist/compiled/ignore-loader',
  'is-animated': 'next/dist/compiled/is-animated',
  'is-docker': 'next/dist/compiled/is-docker',
  'is-wsl': 'next/dist/compiled/is-wsl',
  json5: 'next/dist/compiled/json5',
  jsonwebtoken: 'next/dist/compiled/jsonwebtoken',
  'loader-utils': 'next/dist/compiled/loader-utils',
  'lodash.curry': 'next/dist/compiled/lodash.curry',
  'lru-cache': 'next/dist/compiled/lru-cache',
  nanoid: 'next/dist/compiled/nanoid',
  'neo-async': 'next/dist/compiled/neo-async',
  ora: 'next/dist/compiled/ora',
  'postcss-flexbugs-fixes': 'next/dist/compiled/postcss-flexbugs-fixes',
  'postcss-loader': 'next/dist/compiled/postcss-loader',
  'postcss-preset-env': 'next/dist/compiled/postcss-preset-env',
  'postcss-scss': 'next/dist/compiled/postcss-scss',
  recast: 'next/dist/compiled/recast',
  'resolve-url-loader': 'next/dist/compiled/resolve-url-loader',
  'sass-loader': 'next/dist/compiled/sass-loader',
  'schema-utils': 'next/dist/compiled/schema-utils',
  'schema-utils3': 'next/dist/compiled/schema-utils3',
  semver: 'next/dist/compiled/semver',
  send: 'next/dist/compiled/send',
  // NB: Used by other dependencies, but Vercel version is a duplicate,
  // version so can be inlined anyway (although may change in future),
  'source-map': 'next/dist/compiled/source-map',
  'string-hash': 'next/dist/compiled/string-hash',
  'strip-ansi': 'next/dist/compiled/strip-ansi',
  terser: 'next/dist/compiled/terser',
  'text-table': 'next/dist/compiled/text-table',
  'thread-loader': 'next/dist/compiled/thread-loader',
  unistore: 'next/dist/compiled/unistore',
  'web-vitals': 'next/dist/compiled/web-vitals',
  'webpack-sources': 'next/dist/compiled/webpack-sources',
  'webpack-sources2': 'next/dist/compiled/webpack-sources2',
  webpack: 'next/dist/compiled/webpack/webpack',
  'path-to-regexp': 'next/dist/compiled/path-to-regexp',
}

const babelBundlePackages = {
  'code-frame': 'next/dist/compiled/babel/code-frame',
  '@babel/core': 'next/dist/compiled/babel/core',
  '@babel/plugin-proposal-class-properties':
    'next/dist/compiled/babel/plugin-proposal-class-properties',
  '@babel/plugin-proposal-export-namespace-from':
    'next/dist/compiled/babel/plugin-proposal-export-namespace-from',
  '@babel/plugin-proposal-numeric-separator':
    'next/dist/compiled/babel/plugin-proposal-numeric-separator',
  '@babel/plugin-proposal-object-rest-spread':
    'next/dist/compiled/babel/plugin-proposal-object-rest-spread',
  '@babel/plugin-syntax-bigint':
    'next/dist/compiled/babel/plugin-syntax-bigint',
  '@babel/plugin-syntax-dynamic-import':
    'next/dist/compiled/babel/plugin-syntax-dynamic-import',
  '@babel/plugin-syntax-jsx': 'next/dist/compiled/babel/plugin-syntax-jsx',
  '@babel/plugin-transform-modules-commonjs':
    'next/dist/compiled/babel/plugin-transform-modules-commonjs',
  '@babel/plugin-transform-runtime':
    'next/dist/compiled/babel/plugin-transform-runtime',
  '@babel/preset-env': 'next/dist/compiled/babel/preset-env',
  '@babel/preset-react': 'next/dist/compiled/babel/preset-react',
  '@babel/preset-typescript': 'next/dist/compiled/babel/preset-typescript',
}

Object.assign(externals, babelBundlePackages)

export async function ncc_amphtml_validator(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('amphtml-validator')))
    .ncc({ packageName: 'amphtml-validator', externals })
    .target('compiled/amphtml-validator')
}

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
    .target('compiled/@ampproject/toolbox-optimizer')
}
export async function ncc_arg(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('arg')))
    .ncc({ packageName: 'arg' })
    .target('compiled/arg')
}

export async function ncc_async_retry(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('async-retry')))
    .ncc({
      packageName: 'async-retry',
      externals,
    })
    .target('compiled/async-retry')
}
export async function ncc_async_sema(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('async-sema')))
    .ncc({ packageName: 'async-sema', externals })
    .target('compiled/async-sema')
}

export async function ncc_babel_bundle(task, opts) {
  const bundleExternals = { ...externals }
  for (const pkg of Object.keys(babelBundlePackages))
    delete bundleExternals[pkg]
  await task
    .source('bundles/babel/bundle.js')
    .ncc({
      packageName: '@babel/core',
      bundleName: 'babel',
      externals: bundleExternals,
    })
    .target('compiled/babel')
}

export async function ncc_babel_bundle_packages(task, opts) {
  await task.source('bundles/babel/packages/*').target('compiled/babel/')
}

export async function ncc_bfj(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('bfj')))
    .ncc({ packageName: 'bfj' })
    .target('compiled/bfj')
}

export async function ncc_cacache(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('cacache')))
    .ncc({ packageName: 'cacache' })
    .target('compiled/cacache')
}

export async function ncc_cache_loader(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('cache-loader')))
    .ncc({ packageName: 'cache-loader', externals })
    .target('compiled/cache-loader')
}

export async function ncc_ci_info(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('ci-info')))
    .ncc({ packageName: 'ci-info', externals })
    .target('compiled/ci-info')
}
export async function ncc_comment_json(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('comment-json')))
    .ncc({ packageName: 'comment-json', externals })
    .target('compiled/comment-json')
}

export async function ncc_compression(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('compression')))
    .ncc({ packageName: 'compression', externals })
    .target('compiled/compression')
}

export async function ncc_conf(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('conf')))
    .ncc({ packageName: 'conf', externals })
    .target('compiled/conf')
}

export async function ncc_content_type(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('content-type')))
    .ncc({ packageName: 'content-type', externals })
    .target('compiled/content-type')
}

export async function ncc_cookie(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('cookie')))
    .ncc({ packageName: 'cookie', externals })
    .target('compiled/cookie')
}

export async function ncc_css_loader(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('css-loader')))
    .ncc({
      packageName: 'css-loader',
      externals: {
        ...externals,
        'schema-utils': 'next/dist/compiled/schema-utils',
      },
      target: 'es5',
    })
    .target('compiled/css-loader')
}

export async function ncc_debug(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('debug')))
    .ncc({ packageName: 'debug', externals })
    .target('compiled/debug')
}

export async function ncc_devalue(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('devalue')))
    .ncc({ packageName: 'devalue', externals })
    .target('compiled/devalue')
}

export async function ncc_escape_string_regexp(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('escape-string-regexp')))
    .ncc({ packageName: 'escape-string-regexp', externals })
    .target('compiled/escape-string-regexp')
}

export async function ncc_file_loader(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('file-loader')))
    .ncc({ packageName: 'file-loader', externals })
    .target('compiled/file-loader')
}

export async function ncc_find_cache_dir(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('find-cache-dir')))
    .ncc({ packageName: 'find-cache-dir', externals })
    .target('compiled/find-cache-dir')
}

export async function ncc_find_up(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('find-up')))
    .ncc({ packageName: 'find-up', externals })
    .target('compiled/find-up')
}

export async function ncc_fresh(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('fresh')))
    .ncc({ packageName: 'fresh', externals })
    .target('compiled/fresh')
}

export async function ncc_gzip_size(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('gzip-size')))
    .ncc({ packageName: 'gzip-size', externals })
    .target('compiled/gzip-size')
}

export async function ncc_http_proxy(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('http-proxy')))
    .ncc({ packageName: 'http-proxy', externals })
    .target('compiled/http-proxy')
}

export async function ncc_ignore_loader(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('ignore-loader')))
    .ncc({ packageName: 'ignore-loader', externals })
    .target('compiled/ignore-loader')
}

export async function ncc_is_animated(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('is-animated')))
    .ncc({ packageName: 'is-animated', externals })
    .target('compiled/is-animated')
}

export async function ncc_is_docker(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('is-docker')))
    .ncc({ packageName: 'is-docker', externals })
    .target('compiled/is-docker')
}

export async function ncc_is_wsl(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('is-wsl')))
    .ncc({ packageName: 'is-wsl', externals })
    .target('compiled/is-wsl')
}

export async function ncc_json5(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('json5')))
    .ncc({ packageName: 'json5', externals })
    .target('compiled/json5')
}

export async function ncc_jsonwebtoken(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('jsonwebtoken')))
    .ncc({ packageName: 'jsonwebtoken', externals })
    .target('compiled/jsonwebtoken')
}

export async function ncc_loader_utils(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('loader-utils')))
    .ncc({ packageName: 'loader-utils', externals })
    .target('compiled/loader-utils')
}

export async function ncc_lodash_curry(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('lodash.curry')))
    .ncc({ packageName: 'lodash.curry', externals })
    .target('compiled/lodash.curry')
}

export async function ncc_lru_cache(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('lru-cache')))
    .ncc({ packageName: 'lru-cache', externals })
    .target('compiled/lru-cache')
}

export async function ncc_nanoid(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('nanoid')))
    .ncc({ packageName: 'nanoid', externals })
    .target('compiled/nanoid')
}

export async function ncc_neo_async(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('neo-async')))
    .ncc({ packageName: 'neo-async', externals })
    .target('compiled/neo-async')
}

export async function ncc_ora(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('ora')))
    .ncc({ packageName: 'ora', externals })
    .target('compiled/ora')
}

export async function ncc_postcss_flexbugs_fixes(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('postcss-flexbugs-fixes')))
    .ncc({ packageName: 'postcss-flexbugs-fixes', externals })
    .target('compiled/postcss-flexbugs-fixes')
}

export async function ncc_postcss_loader(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('postcss-loader')))
    .ncc({ packageName: 'postcss-loader', externals })
    .target('compiled/postcss-loader')
}

export async function ncc_postcss_preset_env(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('postcss-preset-env')))
    .ncc({ packageName: 'postcss-preset-env', externals })
    .target('compiled/postcss-preset-env')
}

export async function ncc_postcss_scss(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('postcss-scss')))
    .ncc({
      packageName: 'postcss-scss',
      externals: {
        postcss: 'postcss',
        'postcss/lib/parser': 'postcss/lib/parser',
        ...externals,
      },
    })
    .target('compiled/postcss-scss')
}

export async function ncc_recast(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('recast')))
    .ncc({ packageName: 'recast', externals })
    .target('compiled/recast')
}

export async function ncc_resolve_url_loader(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('resolve-url-loader')))
    .ncc({ packageName: 'resolve-url-loader', externals })
    .target('compiled/resolve-url-loader')
}

export async function ncc_sass_loader(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('sass-loader')))
    .ncc({
      packageName: 'sass-loader',
      customEmit(path, isRequire) {
        if (isRequire && path === 'sass') return false
        if (path.indexOf('node-sass') !== -1)
          return `eval("require.resolve('node-sass')")`
      },
      externals: {
        ...externals,
        'schema-utils': 'next/dist/compiled/schema-utils3',
      },
      target: 'es5',
    })
    .target('compiled/sass-loader')
}

export async function ncc_schema_utils(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('schema-utils')))
    .ncc({
      packageName: 'schema-utils',
      externals,
    })
    .target('compiled/schema-utils')
}

export async function ncc_schema_utils3(task, opts) {
  await task
    .source(relative(__dirname, bundleRequire.resolve('schema-utils3')))
    .ncc({
      packageName: 'schema-utils3',
      externals,
    })
    .target('compiled/schema-utils3')
}
export async function ncc_semver(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('semver')))
    .ncc({ packageName: 'semver', externals })
    .target('compiled/semver')
}

export async function ncc_send(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('send')))
    .ncc({ packageName: 'send', externals })
    .target('compiled/send')
}

export async function ncc_source_map(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('source-map')))
    .ncc({ packageName: 'source-map', externals })
    .target('compiled/source-map')
}

export async function ncc_string_hash(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('string-hash')))
    .ncc({ packageName: 'string-hash', externals })
    .target('compiled/string-hash')
}

export async function ncc_strip_ansi(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('strip-ansi')))
    .ncc({ packageName: 'strip-ansi', externals })
    .target('compiled/strip-ansi')
}

export async function ncc_terser(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('terser')))
    .ncc({ packageName: 'terser', externals })
    .target('compiled/terser')
}

export async function ncc_text_table(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('text-table')))
    .ncc({ packageName: 'text-table', externals })
    .target('compiled/text-table')
}

export async function ncc_thread_loader(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('thread-loader')))
    .ncc({ packageName: 'thread-loader', externals })
    .target('compiled/thread-loader')
}

export async function ncc_unistore(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('unistore')))
    .ncc({ packageName: 'unistore', externals })
    .target('compiled/unistore')
}

export async function ncc_web_vitals(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('web-vitals')))
    .ncc({ packageName: 'web-vitals', externals, target: 'es5' })
    .target('compiled/web-vitals')
}

export async function ncc_webpack_sources(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('webpack-sources')))
    .ncc({ packageName: 'webpack-sources', externals, target: 'es5' })
    .target('compiled/webpack-sources')
}

export async function ncc_webpack_sources2(task, opts) {
  await task
    .source(relative(__dirname, bundleRequire.resolve('webpack-sources2')))
    .ncc({ packageName: 'webpack-sources2', externals, target: 'es5' })
    .target('compiled/webpack-sources2')
}

export async function ncc_webpack_bundle4(task, opts) {
  await task
    .source('bundles/webpack/bundle4.js')
    .ncc({
      packageName: 'webpack',
      bundleName: 'webpack',
      externals,
      minify: false,
      target: 'es5',
    })
    .target('compiled/webpack')
}

export async function ncc_webpack_bundle5(task, opts) {
  await task
    .source('bundles/webpack/bundle5.js')
    .ncc({
      packageName: 'webpack5',
      bundleName: 'webpack',
      customEmit(path) {
        if (path.endsWith('.runtime.js')) return `'./${basename(path)}'`
      },
      externals: {
        ...externals,
        'schema-utils': 'next/dist/compiled/schema-utils3',
        'webpack-sources': 'next/dist/compiled/webpack-sources2',
      },
      minify: false,
      target: 'es5',
    })
    .target('compiled/webpack')
}

export async function ncc_webpack_bundle_packages(task, opts) {
  await task.source('bundles/webpack/packages/*').target('compiled/webpack/')
}

export async function path_to_regexp(task, opts) {
  await task
    .source(relative(__dirname, require.resolve('path-to-regexp')))
    .target('compiled/path-to-regexp')
}

export async function precompile(task, opts) {
  await task.parallel(['copy_ncced'], opts)
}

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
        'ncc_amphtml_validator',
        'ncc_arg',
        'ncc_async_retry',
        'ncc_async_sema',
        'ncc_babel_bundle',
        'ncc_babel_bundle_packages',
        'ncc_bfj',
        'ncc_cacache',
        'ncc_cache_loader',
        'ncc_ci_info',
        'ncc_comment_json',
        'ncc_compression',
        'ncc_conf',
        'ncc_content_type',
        'ncc_cookie',
        'ncc_css_loader',
        'ncc_debug',
        'ncc_devalue',
        'ncc_escape_string_regexp',
        'ncc_file_loader',
        'ncc_find_cache_dir',
        'ncc_find_up',
        'ncc_fresh',
        'ncc_gzip_size',
        'ncc_http_proxy',
        'ncc_ignore_loader',
        'ncc_is_animated',
        'ncc_is_docker',
        'ncc_is_wsl',
        'ncc_json5',
        'ncc_jsonwebtoken',
        'ncc_loader_utils',
        'ncc_lodash_curry',
        'ncc_lru_cache',
        'ncc_nanoid',
        'ncc_neo_async',
        'ncc_ora',
        'ncc_postcss_flexbugs_fixes',
        'ncc_postcss_loader',
        'ncc_postcss_preset_env',
        'ncc_postcss_scss',
        'ncc_recast',
        'ncc_resolve_url_loader',
        'ncc_sass_loader',
        'ncc_schema_utils',
        'ncc_schema_utils3',
        'ncc_semver',
        'ncc_send',
        'ncc_source_map',
        'ncc_string_hash',
        'ncc_strip_ansi',
        'ncc_terser',
        'ncc_text_table',
        'ncc_thread_loader',
        'ncc_unistore',
        'ncc_web_vitals',
        'ncc_webpack_bundle4',
        'ncc_webpack_bundle5',
        'ncc_webpack_bundle_packages',
        'ncc_webpack_sources',
        'ncc_webpack_sources2',
        'path_to_regexp',
        'next__polyfill_nomodule',
      ],
      opts
    )
}

export async function compile(task, opts) {
  await task.parallel(
    [
      // we compile this each time so that fresh runtime data is pulled
      // before each publish
      'ncc_amp_optimizer',
    ],
    opts
  )
}
