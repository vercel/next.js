// eslint-disable-next-line import/no-extraneous-dependencies
const notifier = require('node-notifier')
// eslint-disable-next-line import/no-extraneous-dependencies
const { relative, basename, resolve, join } = require('path')
const fs = require('fs')

export async function next__polyfill_nomodule(task, opts) {
  await task
    .source(
      opts.src ||
        relative(__dirname, require.resolve('@next/polyfill-nomodule'))
    )
    .target('dist/build/polyfills')
}

export async function browser_polyfills(task, opts) {
  await task.parallel(['next__polyfill_nomodule'], opts)
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
  postcss: 'postcss',
  // Ensure latest version is used
  'postcss-safe-parser': 'next/dist/compiled/postcss-safe-parser',
  'cssnano-simple': 'next/dist/build/cssnano-simple',

  // webpack
  'node-libs-browser': 'next/dist/compiled/node-libs-browser',

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
  await task
    .source(opts.src || 'bundles/babel/packages-bundle.js')
    .ncc({
      externals: externals,
    })
    .target(`compiled/babel-packages`)

  await fs.promises.writeFile(
    join(__dirname, 'compiled/babel-packages/package.json'),
    JSON.stringify({ name: 'babel-packages', main: './packages-bundle.js' })
  )

  await task
    .source(opts.src || 'bundles/babel/packages/*')
    .target('compiled/babel')
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
externals['escape-string-regexp'] = 'next/dist/compiled/escape-string-regexp'
// eslint-disable-next-line camelcase
export async function ncc_escape_string_regexp(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('escape-string-regexp'))
    )
    .ncc({ packageName: 'escape-string-regexp', externals })
    .target('compiled/escape-string-regexp')
}
// eslint-disable-next-line camelcase
externals['file-loader'] = 'next/dist/compiled/file-loader'
export async function ncc_file_loader(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('file-loader')))
    .ncc({
      packageName: 'file-loader',
      externals: {
        ...externals,
        'schema-utils': externals['schema-utils2'],
      },
    })
    .target('compiled/file-loader')
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
externals['loader-utils'] = 'next/dist/compiled/loader-utils'
export async function ncc_loader_utils(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('loader-utils')))
    .ncc({ packageName: 'loader-utils', externals })
    .target('compiled/loader-utils')
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
    .ncc({ packageName: 'native-url', externals })
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
externals['node-libs-browser'] = 'next/dist/compiled/node-libs-browser'
export async function ncc_node_libs_browser(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('node-libs-browser'))
    )
    .ncc({ packageName: 'node-libs-browser', externals })
    .target('compiled/node-libs-browser')
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
externals['resolve-url-loader'] = 'next/dist/compiled/resolve-url-loader'
export async function ncc_resolve_url_loader(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('resolve-url-loader'))
    )
    .ncc({ packageName: 'resolve-url-loader', externals })
    .target('compiled/resolve-url-loader')
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
        'ncc_amphtml_validator',
        'ncc_arg',
        'ncc_async_retry',
        'ncc_async_sema',
        'ncc_babel_bundle',
        'ncc_ci_info',
        'ncc_cli_select',
        'ncc_comment_json',
        'ncc_compression',
        'ncc_conf',
        'ncc_content_type',
        'ncc_cookie',
        'ncc_cross_spawn',
        'ncc_debug',
        'ncc_devalue',
        'ncc_escape_string_regexp',
        'ncc_file_loader',
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
        'ncc_loader_utils',
        'ncc_lodash_curry',
        'ncc_lru_cache',
        'ncc_nanoid',
        'ncc_native_url',
        'ncc_neo_async',
        'ncc_node_libs_browser',
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
        'ncc_resolve_url_loader',
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
        'ncc_webpack_bundle_packages',
        'ncc_webpack_sources1',
        'ncc_webpack_sources3',
        'ncc_ws',
        'ncc_ua_parser_js',
        'ncc_webcrypto',
        'ncc_uuid',
        'ncc_formdata_node',
        'ncc_web_streams_polyfill',
        'ncc_mini_css_extract_plugin',
      ],
      opts
    )
  await task.parallel(['ncc_babel_bundle_packages'], opts)
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
      'vitals',
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
    .swc('client', { dev: opts.dev })
    .target('dist/client')
  notify('Compiled client files')
}

export async function vitals(task, opts) {
  await task
    .source(opts.src || 'vitals/**/*.+(js|ts|tsx)')
    .swc('vitals', { dev: opts.dev })
    .target('dist/vitals')
  notify('Compiled vitals files')
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
    .swc('client', { dev: opts.dev })
    .target('dist/pages')
}

export async function pages_error(task, opts) {
  await task
    .source('pages/_error.tsx')
    .swc('client', { dev: opts.dev })
    .target('dist/pages')
}

export async function pages_document(task, opts) {
  await task
    .source('pages/_document.tsx')
    .swc('server', { dev: opts.dev })
    .target('dist/pages')
}

export async function pages(task, opts) {
  await task.parallel(['pages_app', 'pages_error', 'pages_document'], opts)
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
  await task.watch('vitals/**/*.+(js|ts|tsx)', 'vitals', opts)
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
  return notifier.notify({
    title: '▲ Next',
    message: msg,
    icon: false,
  })
}
