const notifier = require('node-notifier')
const relative = require('path').relative

// eslint-disable-next-line camelcase
export async function ncc_amphtml_validator(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('amphtml-validator'))
    )
    .ncc({ packageName: 'amphtml-validator' })
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
    .ncc({ packageName: 'async-retry' })
    .target('dist/compiled/async-retry')
}
// eslint-disable-next-line camelcase
export async function ncc_async_sema(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('async-sema')))
    .ncc({ packageName: 'async-sema' })
    .target('dist/compiled/async-sema')
}
// eslint-disable-next-line camelcase
export async function ncc_babel__core(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('@babel/core')))
    .ncc({ packageName: '@babel/core' })
    .target('dist/compiled/babel--core')
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
    .ncc({ packageName: '@babel/plugin-proposal-class-properties' })
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
    .ncc({ packageName: '@babel/plugin-proposal-nullish-coalescing-operator' })
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
    .ncc({ packageName: '@babel/plugin-proposal-numeric-separator' })
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
    .ncc({ packageName: '@babel/plugin-proposal-object-rest-spread' })
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
    .ncc({ packageName: '@babel/plugin-proposal-optional-chaining' })
    .target('dist/compiled/babel--plugin-proposal-optional-chaining')
}
// eslint-disable-next-line camelcase
export async function ncc_babel__plugin_syntax_bigint(task, opts) {
  await task
    .source(
      opts.src ||
        relative(__dirname, require.resolve('@babel/plugin-syntax-bigint'))
    )
    .ncc({ packageName: '@babel/plugin-syntax-bigint' })
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
    // eslint-disable-next-line no-useless-concat
    .ncc({ packageName: '@babel/plugin-syntax-dynamic-i' + 'mport' })
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
    .ncc({ packageName: '@babel/plugin-transform-modules-commonjs' })
    .target('dist/compiled/babel--plugin-transform-modules-commonjs')
}
// eslint-disable-next-line camelcase
export async function ncc_babel__plugin_transform_runtime(task, opts) {
  await task
    .source(
      opts.src ||
        relative(__dirname, require.resolve('@babel/plugin-transform-runtime'))
    )
    .ncc({ packageName: '@babel/plugin-transform-runtime' })
    .target('dist/compiled/babel--plugin-transform-runtime')
}
// eslint-disable-next-line camelcase
export async function ncc_babel__preset_env(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('@babel/preset-env'))
    )
    .ncc({ packageName: '@babel/preset-env' })
    .target('dist/compiled/babel--preset-env')
}
// eslint-disable-next-line camelcase
export async function ncc_babel__preset_modules(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('@babel/preset-modules'))
    )
    .ncc({ packageName: '@babel/preset-modules' })
    .target('dist/compiled/babel--preset-modules')
}
// eslint-disable-next-line camelcase
export async function ncc_babel__preset_react(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('@babel/preset-react'))
    )
    .ncc({ packageName: '@babel/preset-react' })
    .target('dist/compiled/babel--preset-react')
}
// eslint-disable-next-line camelcase
export async function ncc_babel__preset_typescript(task, opts) {
  await task
    .source(
      opts.src ||
        relative(__dirname, require.resolve('@babel/preset-typescript'))
    )
    .ncc({ packageName: '@babel/preset-typescript' })
    .target('dist/compiled/babel--preset-typescript')
}
// eslint-disable-next-line camelcase
export async function ncc_babel__types(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('@babel/types')))
    .ncc({ packageName: '@babel/types' })
    .target('dist/compiled/babel--types')
}
// eslint-disable-next-line camelcase
export async function ncc_babel_loader(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('babel-loader')))
    .ncc({
      packageName: 'babel-loader',
      externals: { '@babel/core': 'next/dist/compiled/babel--core' },
    })
    .target('dist/compiled/babel-loader')
}
// eslint-disable-next-line camelcase
export async function ncc_babel_plugin_syntax_jsx(task, opts) {
  await task
    .source(
      opts.src ||
        relative(__dirname, require.resolve('babel-plugin-syntax-jsx'))
    )
    .ncc({ packageName: 'babel-plugin-syntax-jsx' })
    .target('dist/compiled/babel-plugin-syntax-jsx')
}
// eslint-disable-next-line camelcase
export async function ncc_babel_plugin_transform_define(task, opts) {
  await task
    .source(
      opts.src ||
        relative(__dirname, require.resolve('babel-plugin-transform-define'))
    )
    .ncc({ packageName: 'babel-plugin-transform-define' })
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
    .ncc({ packageName: 'babel-plugin-transform-react-remove-prop-types' })
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
    .ncc({ packageName: 'chalk' })
    .target('dist/compiled/chalk')
}
// eslint-disable-next-line camelcase
export async function ncc_ci_info(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('ci-info')))
    .ncc({ packageName: 'ci-info' })
    .target('dist/compiled/ci-info')
}
// eslint-disable-next-line camelcase
export async function ncc_compression(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('compression')))
    .ncc({ packageName: 'compression' })
    .target('dist/compiled/compression')
}
// eslint-disable-next-line camelcase
export async function ncc_content_type(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('content-type')))
    .ncc({ packageName: 'content-type' })
    .target('dist/compiled/content-type')
}
// eslint-disable-next-line camelcase
export async function ncc_cookie(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('cookie')))
    .ncc({ packageName: 'cookie' })
    .target('dist/compiled/cookie')
}
// eslint-disable-next-line camelcase
export async function ncc_devalue(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('devalue')))
    .ncc({ packageName: 'devalue' })
    .target('dist/compiled/devalue')
}
// eslint-disable-next-line camelcase
export async function ncc_dotenv(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('dotenv')))
    .ncc({ packageName: 'dotenv' })
    .target('dist/compiled/dotenv')
}
// eslint-disable-next-line camelcase
export async function ncc_dotenv_expand(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('dotenv-expand')))
    .ncc({ packageName: 'dotenv-expand' })
    .target('dist/compiled/dotenv-expand')
}
// eslint-disable-next-line camelcase
export async function ncc_escape_string_regexp(task, opts) {
  await task
    .source(
      opts.src || relative(__dirname, require.resolve('escape-string-regexp'))
    )
    .ncc({ packageName: 'escape-string-regexp' })
    .target('dist/compiled/escape-string-regexp')
}
// eslint-disable-next-line camelcase
export async function ncc_etag(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('etag')))
    .ncc({ packageName: 'etag' })
    .target('dist/compiled/etag')
}
// eslint-disable-next-line camelcase
export async function ncc_fresh(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('fresh')))
    .ncc({ packageName: 'fresh' })
    .target('dist/compiled/fresh')
}
// eslint-disable-next-line camelcase
export async function ncc_gzip_size(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('gzip-size')))
    .ncc({ packageName: 'gzip-size' })
    .target('dist/compiled/gzip-size')
}
// eslint-disable-next-line camelcase
export async function ncc_http_proxy(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('http-proxy')))
    .ncc({ packageName: 'http-proxy' })
    .target('dist/compiled/http-proxy')
}
// eslint-disable-next-line camelcase
export async function ncc_is_docker(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('is-docker')))
    .ncc({ packageName: 'is-docker' })
    .target('dist/compiled/is-docker')
}
// eslint-disable-next-line camelcase
export async function ncc_is_wsl(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('is-wsl')))
    .ncc({ packageName: 'is-wsl' })
    .target('dist/compiled/is-wsl')
}
// eslint-disable-next-line camelcase
export async function ncc_json5(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('json5')))
    .ncc({ packageName: 'json5' })
    .target('dist/compiled/json5')
}
// eslint-disable-next-line camelcase
export async function ncc_jsonwebtoken(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('jsonwebtoken')))
    .ncc({ packageName: 'jsonwebtoken' })
    .target('dist/compiled/jsonwebtoken')
}
// eslint-disable-next-line camelcase
export async function ncc_nanoid(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('nanoid')))
    .ncc({ packageName: 'nanoid' })
    .target('dist/compiled/nanoid')
}
// eslint-disable-next-line camelcase
export async function ncc_resolve(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('resolve')))
    .ncc({ packageName: 'resolve' })
    .target('dist/compiled/resolve')
}
// eslint-disable-next-line camelcase
export async function ncc_text_table(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('text-table')))
    .ncc({ packageName: 'text-table' })
    .target('dist/compiled/text-table')
}
// eslint-disable-next-line camelcase
export async function ncc_unistore(task, opts) {
  await task
    .source(opts.src || relative(__dirname, require.resolve('unistore')))
    .ncc({ packageName: 'unistore' })
    .target('dist/compiled/unistore')
}

export async function precompile(task) {
  await task.parallel([
    'ncc_amphtml_validator',
    'ncc_arg',
    'ncc_async_retry',
    'ncc_async_sema',
    'ncc_babel__core',
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
    'ncc_content_type',
    'ncc_cookie',
    'ncc_devalue',
    'ncc_dotenv',
    'ncc_dotenv_expand',
    'ncc_escape_string_regexp',
    'ncc_etag',
    'ncc_fresh',
    'ncc_gzip_size',
    'ncc_http_proxy',
    'ncc_is_docker',
    'ncc_is_wsl',
    'ncc_json5',
    'ncc_jsonwebtoken',
    'ncc_nanoid',
    'ncc_resolve',
    'ncc_text_table',
    'ncc_unistore',
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
