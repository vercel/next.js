const notifier = require('node-notifier')
const relative = require('path').relative

export async function next__polyfill_nomodule(task, opts) {
  await task
    .source(
      opts.src ||
        relative(__dirname, require.resolve('@next/polyfill-nomodule'))
    )
    .target('dist/build/polyfills')
}

export async function finally_polyfill(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('finally-polyfill'))
    )
    .target('dist/build/polyfills')
}

export async function unfetch(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('unfetch')))
    .target('dist/build/polyfills')
}

export async function browser_polyfills(task) {
  await task.parallel([
    'next__polyfill_nomodule',
    'finally_polyfill',
    'unfetch',
  ])
}

const externals = {
  '@babel/core': 'next/dist/compiled/babel--core',
  '@babel/helper-plugin-utils': 'next/dist/compiled/babel--helper-plugin-utils',
  chalk: 'next/dist/compiled/chalk',
  'source-map': 'next/dist/compiled/source-map',
  'node-fetch': 'next/dist/compiled/node-fetch',
}

// eslint-disable-next-line camelcase
export async function ncc_amphtml_validator(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('amphtml-validator'))
    )
    .ncc({ packageName: 'amphtml-validator', externals })
    .target('dist/compiled/amphtml-validator')
}
// eslint-disable-next-line camelcase
export async function ncc_arg(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('arg')))
    .ncc({ packageName: 'arg' })
    .target('dist/compiled/arg')
}
// eslint-disable-next-line camelcase
export async function ncc_async_retry(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('async-retry')))
    .ncc({
      packageName: 'async-retry',
      externals,
    })
    .target('dist/compiled/async-retry')
}
// eslint-disable-next-line camelcase
export async function ncc_async_sema(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('async-sema')))
    .ncc({ packageName: 'async-sema', externals })
    .target('dist/compiled/async-sema')
}
// eslint-disable-next-line camelcase
export async function ncc_babel__core(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('@babel/core')))
    .ncc({ packageName: '@babel/core', externals })
    .target('dist/compiled/babel--core')
}
// eslint-disable-next-line camelcase
export async function ncc_babel__helper_plugin_utils(task, opts) {
  await task
    .source(
      opts.src ||
        relative(__dirname, require.resolve('@babel/helper-plugin-utils'))
    )
    .ncc({ packageName: '@babel/helper-plugin-utils', externals })
    .target('dist/compiled/babel--helper-plugin-utils')
}
// eslint-disable-next-line camelcase
export async function ncc_babel__plugin_proposal_class_properties(task, opts) {
  await task
    .source(
      opts.src ||
        relative(
          __dirname,
          require.resolve('@babel/plugin-proposal-class-properties')
        )
    )
    .ncc({
      packageName: '@babel/plugin-proposal-class-properties',
      externals,
    })
    .target('dist/compiled/babel--plugin-proposal-class-properties')
}
// eslint-disable-next-line camelcase
export async function ncc_babel__plugin_proposal_nullish_coalescing_operator(
  task,
  opts
) {
  await task
    .source(
      opts.src ||
        relative(
          __dirname,
          require.resolve('@babel/plugin-proposal-nullish-coalescing-operator')
        )
    )
    .ncc({
      packageName: '@babel/plugin-proposal-nullish-coalescing-operator',
      externals,
    })
    .target('dist/compiled/babel--plugin-proposal-nullish-coalescing-operator')
}
// eslint-disable-next-line camelcase
export async function ncc_babel__plugin_proposal_numeric_separator(task, opts) {
  await task
    .source(
      opts.src ||
        relative(
          __dirname,
          require.resolve('@babel/plugin-proposal-numeric-separator')
        )
    )
    .ncc({
      packageName: '@babel/plugin-proposal-numeric-separator',
      externals,
    })
    .target('dist/compiled/babel--plugin-proposal-numeric-separator')
}
// eslint-disable-next-line camelcase
export async function ncc_babel__plugin_proposal_object_rest_spread(
  task,
  opts
) {
  await task
    .source(
      opts.src ||
        relative(
          __dirname,
          require.resolve('@babel/plugin-proposal-object-rest-spread')
        )
    )
    .ncc({
      packageName: '@babel/plugin-proposal-object-rest-spread',
      externals,
    })
    .target('dist/compiled/babel--plugin-proposal-object-rest-spread')
}
// eslint-disable-next-line camelcase
export async function ncc_babel__plugin_proposal_optional_chaining(task, opts) {
  await task
    .source(
      opts.src ||
        relative(
          __dirname,
          require.resolve('@babel/plugin-proposal-optional-chaining')
        )
    )
    .ncc({
      packageName: '@babel/plugin-proposal-optional-chaining',
      externals,
    })
    .target('dist/compiled/babel--plugin-proposal-optional-chaining')
}
// eslint-disable-next-line camelcase
export async function ncc_babel__plugin_syntax_bigint(task, opts) {
  await task
    .source(
      opts.src ||
        relative(__dirname, require.resolve('@babel/plugin-syntax-bigint'))
    )
    .ncc({
      packageName: '@babel/plugin-syntax-bigint',
      externals,
    })
    .target('dist/compiled/babel--plugin-syntax-bigint')
}
// eslint-disable-next-line camelcase
export async function ncc_babel__plugin_syntax_dynamic_import(task, opts) {
  await task
    .source(
      opts.src ||
        relative(
          __dirname,
          // eslint-disable-next-line no-useless-concat
          require.resolve('@babel/plugin-syntax-dynamic-i' + 'mport')
        )
    )
    .ncc({
      // eslint-disable-next-line no-useless-concat
      packageName: '@babel/plugin-syntax-dynamic-i' + 'mport',
      externals,
    })
    // eslint-disable-next-line no-useless-concat
    .target('dist/compiled/babel--plugin-syntax-dynamic-i' + 'mport')
}
// eslint-disable-next-line camelcase
export async function ncc_babel__plugin_transform_modules_commonjs(task, opts) {
  await task
    .source(
      opts.src ||
        relative(
          __dirname,
          require.resolve('@babel/plugin-transform-modules-commonjs')
        )
    )
    .ncc({
      packageName: '@babel/plugin-transform-modules-commonjs',
      externals,
    })
    .target('dist/compiled/babel--plugin-transform-modules-commonjs')
}
// eslint-disable-next-line camelcase
export async function ncc_babel__plugin_transform_runtime(task, opts) {
  await task
    .source(
      opts.src ||
        relative(__dirname, require.resolve('@babel/plugin-transform-runtime'))
    )
    .ncc({
      packageName: '@babel/plugin-transform-runtime',
      externals,
    })
    .target('dist/compiled/babel--plugin-transform-runtime')
}
// eslint-disable-next-line camelcase
export async function ncc_babel__preset_env(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('@babel/preset-env'))
    )
    .ncc({ packageName: '@babel/preset-env', externals })
    .target('dist/compiled/babel--preset-env')
}
// eslint-disable-next-line camelcase
export async function ncc_babel__preset_modules(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('@babel/preset-modules'))
    )
    .ncc({ packageName: '@babel/preset-modules', externals })
    .target('dist/compiled/babel--preset-modules')
}
// eslint-disable-next-line camelcase
export async function ncc_babel__preset_react(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('@babel/preset-react'))
    )
    .ncc({ packageName: '@babel/preset-react', externals })
    .target('dist/compiled/babel--preset-react')
}
// eslint-disable-next-line camelcase
export async function ncc_babel__preset_typescript(task, opts) {
  await task
    .source(
      opts.src ||
        relative(__dirname, require.resolve('@babel/preset-typescript'))
    )
    .ncc({ packageName: '@babel/preset-typescript', externals })
    .target('dist/compiled/babel--preset-typescript')
}
// eslint-disable-next-line camelcase
export async function ncc_babel__types(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('@babel/types')))
    .ncc({ packageName: '@babel/types', externals })
    .target('dist/compiled/babel--types')
}
// eslint-disable-next-line camelcase
export async function ncc_babel_loader(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('babel-loader')))
    .ncc({ packageName: 'babel-loader', externals })
    .target('dist/compiled/babel-loader')
}
// eslint-disable-next-line camelcase
export async function ncc_babel_plugin_syntax_jsx(task, opts) {
  await task
    .source(
      opts.src ||
        relative(__dirname, require.resolve('babel-plugin-syntax-jsx'))
    )
    .ncc({ packageName: 'babel-plugin-syntax-jsx', externals })
    .target('dist/compiled/babel-plugin-syntax-jsx')
}
// eslint-disable-next-line camelcase
export async function ncc_babel_plugin_transform_define(task, opts) {
  await task
    .source(
      opts.src ||
        relative(__dirname, require.resolve('babel-plugin-transform-define'))
    )
    .ncc({ packageName: 'babel-plugin-transform-define', externals })
    .target('dist/compiled/babel-plugin-transform-define')
}
// eslint-disable-next-line camelcase
export async function ncc_babel_plugin_transform_react_remove_prop_types(
  task,
  opts
) {
  await task
    .source(
      opts.src ||
        relative(
          __dirname,
          require.resolve('babel-plugin-transform-react-remove-prop-types')
        )
    )
    .ncc({
      packageName: 'babel-plugin-transform-react-remove-prop-types',
      externals,
    })
    .target('dist/compiled/babel-plugin-transform-react-remove-prop-types')
}
// eslint-disable-next-line camelcase
export async function ncc_browserslist(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('browserslist')))
    .ncc({ packageName: 'browserslist' })
    .target('dist/compiled/browserslist')
}
// eslint-disable-next-line camelcase
export async function ncc_chalk(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('chalk')))
    .ncc({ packageName: 'chalk', externals })
    .target('dist/compiled/chalk')
}
// eslint-disable-next-line camelcase
export async function ncc_ci_info(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('ci-info')))
    .ncc({ packageName: 'ci-info', externals })
    .target('dist/compiled/ci-info')
}
// eslint-disable-next-line camelcase
export async function ncc_compression(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('compression')))
    .ncc({ packageName: 'compression', externals })
    .target('dist/compiled/compression')
}
// eslint-disable-next-line camelcase
export async function ncc_conf(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('conf')))
    .ncc({ packageName: 'conf', externals })
    .target('dist/compiled/conf')
}
// eslint-disable-next-line camelcase
export async function ncc_content_type(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('content-type')))
    .ncc({ packageName: 'content-type', externals })
    .target('dist/compiled/content-type')
}
// eslint-disable-next-line camelcase
export async function ncc_cookie(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('cookie')))
    .ncc({ packageName: 'cookie', externals })
    .target('dist/compiled/cookie')
}
// eslint-disable-next-line camelcase
export async function ncc_devalue(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('devalue')))
    .ncc({ packageName: 'devalue', externals })
    .target('dist/compiled/devalue')
}
// eslint-disable-next-line camelcase
export async function ncc_dotenv(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('dotenv')))
    .ncc({ packageName: 'dotenv', externals })
    .target('dist/compiled/dotenv')
}
// eslint-disable-next-line camelcase
export async function ncc_dotenv_expand(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('dotenv-expand')))
    .ncc({ packageName: 'dotenv-expand', externals })
    .target('dist/compiled/dotenv-expand')
}
// eslint-disable-next-line camelcase
export async function ncc_escape_string_regexp(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('escape-string-regexp'))
    )
    .ncc({ packageName: 'escape-string-regexp', externals })
    .target('dist/compiled/escape-string-regexp')
}
// eslint-disable-next-line camelcase
export async function ncc_etag(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('etag')))
    .ncc({ packageName: 'etag', externals })
    .target('dist/compiled/etag')
}
// eslint-disable-next-line camelcase
export async function ncc_find_up(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('find-up')))
    .ncc({ packageName: 'find-up', externals })
    .target('dist/compiled/find-up')
}
// eslint-disable-next-line camelcase
export async function ncc_fresh(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('fresh')))
    .ncc({ packageName: 'fresh', externals })
    .target('dist/compiled/fresh')
}
// eslint-disable-next-line camelcase
export async function ncc_gzip_size(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('gzip-size')))
    .ncc({ packageName: 'gzip-size', externals })
    .target('dist/compiled/gzip-size')
}
// eslint-disable-next-line camelcase
export async function ncc_http_proxy(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('http-proxy')))
    .ncc({ packageName: 'http-proxy', externals })
    .target('dist/compiled/http-proxy')
}
// eslint-disable-next-line camelcase
export async function ncc_is_docker(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('is-docker')))
    .ncc({ packageName: 'is-docker', externals })
    .target('dist/compiled/is-docker')
}
// eslint-disable-next-line camelcase
export async function ncc_is_wsl(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('is-wsl')))
    .ncc({ packageName: 'is-wsl', externals })
    .target('dist/compiled/is-wsl')
}
// eslint-disable-next-line camelcase
export async function ncc_json5(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('json5')))
    .ncc({ packageName: 'json5', externals })
    .target('dist/compiled/json5')
}
// eslint-disable-next-line camelcase
export async function ncc_jsonwebtoken(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('jsonwebtoken')))
    .ncc({ packageName: 'jsonwebtoken', externals })
    .target('dist/compiled/jsonwebtoken')
}
// eslint-disable-next-line camelcase
export async function ncc_launch_editor(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('launch-editor')))
    .ncc({ packageName: 'launch-editor', externals })
    .target('dist/compiled/launch-editor')
}
// eslint-disable-next-line camelcase
export async function ncc_lodash_curry(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('lodash.curry')))
    .ncc({ packageName: 'lodash.curry', externals })
    .target('dist/compiled/lodash.curry')
}
// eslint-disable-next-line camelcase
export async function ncc_lru_cache(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('lru-cache')))
    .ncc({ packageName: 'lru-cache', externals })
    .target('dist/compiled/lru-cache')
}
// eslint-disable-next-line camelcase
export async function ncc_nanoid(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('nanoid')))
    .ncc({ packageName: 'nanoid', externals })
    .target('dist/compiled/nanoid')
}
// eslint-disable-next-line camelcase
export async function ncc_node_fetch(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('node-fetch')))
    .ncc({ packageName: 'node-fetch', externals })
    .target('dist/compiled/node-fetch')
}
// eslint-disable-next-line camelcase
export async function ncc_ora(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('ora')))
    .ncc({ packageName: 'ora', externals })
    .target('dist/compiled/ora')
}
// eslint-disable-next-line camelcase
export async function ncc_raw_body(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('raw-body')))
    .ncc({ packageName: 'raw-body', externals })
    .target('dist/compiled/raw-body')
}
// eslint-disable-next-line camelcase
export async function ncc_recast(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('recast')))
    .ncc({ packageName: 'recast', externals })
    .target('dist/compiled/recast')
}
// eslint-disable-next-line camelcase
export async function ncc_resolve(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('resolve')))
    .ncc({ packageName: 'resolve', externals })
    .target('dist/compiled/resolve')
}
// eslint-disable-next-line camelcase
export async function ncc_send(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('send')))
    .ncc({ packageName: 'send', externals })
    .target('dist/compiled/send')
}
// eslint-disable-next-line camelcase
export async function ncc_source_map(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('source-map')))
    .ncc({ packageName: 'source-map', externals })
    .target('dist/compiled/source-map')
}
// eslint-disable-next-line camelcase
export async function ncc_string_hash(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('string-hash')))
    .ncc({ packageName: 'string-hash', externals })
    .target('dist/compiled/string-hash')
}
// eslint-disable-next-line camelcase
export async function ncc_strip_ansi(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('strip-ansi')))
    .ncc({ packageName: 'strip-ansi', externals })
    .target('dist/compiled/strip-ansi')
}
// eslint-disable-next-line camelcase
export async function ncc_terser(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('terser')))
    .ncc({ packageName: 'terser', externals })
    .target('dist/compiled/terser')
}
// eslint-disable-next-line camelcase
export async function ncc_text_table(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('text-table')))
    .ncc({ packageName: 'text-table', externals })
    .target('dist/compiled/text-table')
}
// eslint-disable-next-line camelcase
export async function ncc_unistore(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('unistore')))
    .ncc({ packageName: 'unistore', externals })
    .target('dist/compiled/unistore')
}

export async function path_to_regexp(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('path-to-regexp')))
    .target('dist/compiled/path-to-regexp')
}

export async function precompile(task) {
  await task.parallel([
    'browser_polyfills',
    'ncc_amphtml_validator',
    'ncc_arg',
    'ncc_async_retry',
    'ncc_async_sema',
    'ncc_babel__core',
    'ncc_babel__helper_plugin_utils',
    'ncc_babel__plugin_proposal_class_properties',
    'ncc_babel__plugin_proposal_nullish_coalescing_operator',
    'ncc_babel__plugin_proposal_numeric_separator',
    'ncc_babel__plugin_proposal_object_rest_spread',
    'ncc_babel__plugin_proposal_optional_chaining',
    'ncc_babel__plugin_syntax_bigint',
    // eslint-disable-next-line no-useless-concat
    'ncc_babel__plugin_syntax_dynamic_i' + 'mport',
    'ncc_babel__plugin_transform_modules_commonjs',
    'ncc_babel__plugin_transform_runtime',
    'ncc_babel__preset_env',
    'ncc_babel__preset_modules',
    'ncc_babel__preset_react',
    'ncc_babel__preset_typescript',
    'ncc_babel__types',
    'ncc_babel_loader',
    'ncc_babel_plugin_syntax_jsx',
    'ncc_babel_plugin_transform_define',
    'ncc_babel_plugin_transform_react_remove_prop_types',
    'ncc_browserslist',
    'ncc_chalk',
    'ncc_ci_info',
    'ncc_compression',
    'ncc_conf',
    'ncc_content_type',
    'ncc_cookie',
    'ncc_devalue',
    'ncc_dotenv',
    'ncc_dotenv_expand',
    'ncc_escape_string_regexp',
    'ncc_etag',
    'ncc_find_up',
    'ncc_fresh',
    'ncc_gzip_size',
    'ncc_http_proxy',
    'ncc_is_docker',
    'ncc_is_wsl',
    'ncc_json5',
    'ncc_jsonwebtoken',
    'ncc_launch_editor',
    'ncc_lodash_curry',
    'ncc_lru_cache',
    'ncc_nanoid',
    'ncc_node_fetch',
    'ncc_ora',
    'ncc_raw_body',
    'ncc_recast',
    'ncc_resolve',
    'ncc_send',
    'ncc_source_map',
    'ncc_string_hash',
    'ncc_strip_ansi',
    'ncc_terser',
    'ncc_text_table',
    'ncc_unistore',
    'path_to_regexp',
  ])
}

export async function compile(task) {
  await task.parallel([
    'cli',
    'bin',
    'server',
    'nextbuild',
    'nextbuildstatic',
    'pages',
    'lib',
    'client',
    'telemetry',
    'nextserverserver',
    'nextserverlib',
  ])
}

export async function bin(task, opts) {
  await task
    .source(opts.src || 'bin/*')
    .babel('server', { stripExtension: true })
    .target('dist/bin', { mode: '0755' })
  notify('Compiled binaries')
}

export async function cli(task, opts) {
  await task
    .source(opts.src || 'cli/**/*.+(js|ts|tsx)')
    .babel('server')
    .target('dist/cli')
  notify('Compiled cli files')
}

export async function lib(task, opts) {
  await task
    .source(opts.src || 'lib/**/*.+(js|ts|tsx)')
    .babel('server')
    .target('dist/lib')
  notify('Compiled lib files')
}

export async function server(task, opts) {
  await task
    .source(opts.src || 'server/**/*.+(js|ts|tsx)')
    .babel('server')
    .target('dist/server')
  notify('Compiled server files')
}

export async function nextbuild(task, opts) {
  await task
    .source(opts.src || 'build/**/*.+(js|ts|tsx)')
    .babel('server')
    .target('dist/build')
  notify('Compiled build files')
}

export async function client(task, opts) {
  await task
    .source(opts.src || 'client/**/*.+(js|ts|tsx)')
    .babel('client')
    .target('dist/client')
  notify('Compiled client files')
}

// export is a reserved keyword for functions
export async function nextbuildstatic(task, opts) {
  await task
    .source(opts.src || 'export/**/*.+(js|ts|tsx)')
    .babel('server')
    .target('dist/export')
  notify('Compiled export files')
}

export async function pages_app(task) {
  await task
    .source('pages/_app.tsx')
    .babel('client')
    .target('dist/pages')
}

export async function pages_error(task) {
  await task
    .source('pages/_error.tsx')
    .babel('client')
    .target('dist/pages')
}

export async function pages_document(task) {
  await task
    .source('pages/_document.tsx')
    .babel('server')
    .target('dist/pages')
}

export async function pages(task, opts) {
  await task.parallel(['pages_app', 'pages_error', 'pages_document'])
}

export async function telemetry(task, opts) {
  await task
    .source(opts.src || 'telemetry/**/*.+(js|ts|tsx)')
    .babel('server')
    .target('dist/telemetry')
  notify('Compiled telemetry files')
}

export async function build(task) {
  await task.serial(['precompile', 'compile'])
}

export default async function(task) {
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
  await task.watch('telemetry/**/*.+(js|ts|tsx)', 'telemetry')
  await task.watch('next-server/server/**/*.+(js|ts|tsx)', 'nextserverserver')
  await task.watch('next-server/lib/**/*.+(js|ts|tsx)', 'nextserverlib')
}

export async function nextserverlib(task, opts) {
  await task
    .source(opts.src || 'next-server/lib/**/*.+(js|ts|tsx)')
    .typescript({ module: 'commonjs' })
    .target('dist/next-server/lib')
  notify('Compiled lib files')
}

export async function nextserverserver(task, opts) {
  await task
    .source(opts.src || 'next-server/server/**/*.+(js|ts|tsx)')
    .typescript({ module: 'commonjs' })
    .target('dist/next-server/server')
  notify('Compiled server files')
}

export async function nextserverbuild(task) {
  await task.parallel(['nextserverserver', 'nextserverlib'])
}

export async function release(task) {
  await task.clear('dist').start('build')
  await task.clear('dist/next-server').start('nextserverbuild')
}

// notification helper
function notify(msg) {
  return notifier.notify({
    title: '▲ Next',
    message: msg,
    icon: false,
  })
}
