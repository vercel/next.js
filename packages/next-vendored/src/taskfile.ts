import { fileURLToPath } from 'node:url'
import { join, dirname, resolve } from 'node:path'
import fs from 'node:fs/promises'
import { Task } from './custom-task.js'
import type { Tasks, QueueFn } from '@next/task'
import { resolveCommonjs } from './resolve.cjs'

export { Task }

const resolveModule = (modulePath: string) =>
  fileURLToPath(import.meta.resolve(modulePath))

// Modules that import other compiled modules need to do so from `@next/vendored`
// and that means going up one path.
const next_vendored = '..'

const externals: Record<string, string> = {
  // don't bundle caniuse-lite data so users can
  // update it manually
  'caniuse-lite': 'caniuse-lite',
  '/caniuse-lite(/.*)/': 'caniuse-lite$1',

  'node-fetch': 'node-fetch',
  postcss: 'postcss',
  // Ensure latest version is used
  'postcss-safe-parser': `${next_vendored}/postcss-safe-parser`,

  // sass-loader
  // (also responsible for these dependencies in package.json)
  'node-sass': 'node-sass',
  sass: 'sass',
  fibers: 'fibers',

  chokidar: 'chokidar',
  'jest-worker': 'jest-worker',

  'terser-webpack-plugin':
    'next/dist/build/webpack/plugins/terser-webpack-plugin/src',

  'loader-utils': 'error loader-utils version not specified',
  'schema-utils': 'MISSING_VERSION schema-utils version not specified',

  // TODO: Add @swc/helpers to externals once @vercel/ncc switch to swc-loader
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

externals['next/dist/compiled/babel/code-frame'] =
  'next/dist/compiled/babel/code-frame'

Object.assign(externals, babelCorePackages)

export const tasks: Tasks<Task> = {}

const nccTasks: Record<
  string,
  | string
  | {
      mod: string
      modPath?: string
      esm?: boolean
      browserOnly?: boolean
      use?: QueueFn
      externals?: typeof externals
      minify?: boolean
    }
> = {
  ncc_node_html_parser: 'node-html-parser', // TODO:ESM
  ncc_napirs_triples: '@napi-rs/triples',
  ncc_p_limit: 'p-limit',
  ncc_p_queue: 'p-queue',
  ncc_raw_body: 'raw-body',
  ncc_image_size: 'image-size',
  ncc_hapi_accept: '@hapi/accept',
  ncc_commander: 'commander',
  ncc_node_fetch: 'node-fetch',
  ncc_node_anser: 'anser',
  ncc_node_stacktrace_parser: 'stacktrace-parser',
  ncc_node_data_uri_to_buffer: 'data-uri-to-buffer',
  ncc_node_cssescape: 'css.escape',
  ncc_node_platform: {
    mod: 'platform',
    async use(files) {
      const platformFile = files.find((file) =>
        file.path.endsWith('platform.js')
      )!
      const content = platformFile.data.toString().replace(
        // remove AMD define branch as this forces the module to not
        // be treated as commonjs
        new RegExp(
          'if(typeof define=="function"&&typeof define.amd=="object"&&define.amd){r.platform=d;define((function(){return d}))}else '.replace(
            /[|\\{}()[\]^$+*?.-]/g,
            '\\$&'
          ),
          'g'
        ),
        ''
      )
      platformFile.data = Buffer.from(content, 'utf8')
    },
  },
  ncc_node_shell_quote: 'shell-quote',
  ncc_acorn: 'acorn', // TODO: Not being used by next? // TODO:ESM
  ncc_amphtml_validator: 'amphtml-validator',
  ncc_async_retry: 'async-retry',
  ncc_async_sema: 'async-sema',
  // TODO: This one goes to next/src
  // ncc_postcss_plugin_stub_for_cssnano_simple: '',
  // These are Node.js browser polyfills
  ncc_assert: { mod: 'assert/', browserOnly: true },
  ncc_browser_zlib: { mod: 'browserify-zlib', browserOnly: true },
  ncc_buffer: { mod: 'buffer/', browserOnly: true },
  ncc_crypto_browserify: {
    mod: 'crypto-browserify',
    browserOnly: true,
  },
  ncc_domain_browser: { mod: 'domain-browser', browserOnly: true },
  ncc_events: { mod: 'events/', browserOnly: true },
  ncc_stream_browserify: {
    mod: 'stream-browserify',
    browserOnly: true,
    async use(files) {
      const indexFile = files.find((file) => file.path.endsWith('index.js'))!
      // while ncc'ing readable-stream the browser mapping does not replace the
      // require('stream') with require('events').EventEmitter correctly so we
      // patch this manually as leaving require('stream') causes a circular
      // reference breaking the browser polyfill
      const content = indexFile.data
        .toString()
        .replace(`require("stream")`, `require("events").EventEmitter`)

      indexFile.data = Buffer.from(content, 'utf8')
    },
  },
  ncc_stream_http: { mod: 'stream-http', browserOnly: true },
  ncc_https_browserify: {
    mod: 'https-browserify',
    browserOnly: true,
  },
  ncc_os_browserify: {
    mod: 'os-browserify',
    modPath: 'os-browserify/browser',
    browserOnly: true,
  },
  ncc_path_browserify: {
    mod: 'path-browserify',
    browserOnly: true,
    async use(files) {
      const indexFile = files.find((file) => file.path.endsWith('index.js'))!
      // Remove process usage from path-browserify polyfill for edge-runtime
      const content = indexFile.data
        .toString()
        .replace(/process\.cwd\(\)/g, '""')

      indexFile.data = Buffer.from(content, 'utf8')
    },
  },
  ncc_process: {
    mod: 'process',
    modPath: 'process/browser',
    browserOnly: true,
  },
  ncc_querystring_es3: { mod: 'querystring-es3', browserOnly: true },
  ncc_string_decoder: { mod: 'string_decoder/', browserOnly: true },
  ncc_util: { mod: 'util/', browserOnly: true },
  ncc_punycode: { mod: 'punycode/', browserOnly: true },
  ncc_set_immediate: { mod: 'setimmediate/', browserOnly: true },
  ncc_timers_browserify: {
    mod: 'timers-browserify',
    browserOnly: true,
    externals: { setimmediate: `${next_vendored}/setimmediate` },
  },
  ncc_tty_browserify: { mod: 'tty-browserify', browserOnly: true },
  ncc_vm_browserify: { mod: 'vm-browserify', browserOnly: true },
  // ncc_babel_bundle: {
  //   mod: 'vm-browserify',
  //   browserOnly: true,
  //   externals: Object.keys(babelCorePackages).reduce<Record<string, string>>(
  //     (acc, key) => {
  //       delete acc[key]
  //       return acc
  //     },
  //     {
  //       ...externals,
  //       'next/dist/compiled/babel-packages':
  //         'next/dist/compiled/babel-packages',
  //     }
  //   ),
  // },
  ncc_bytes: 'bytes',
  ncc_ci_info: 'ci-info',
  ncc_cli_select: 'cli-select',
  ncc_comment_json: 'comment-json',
  ncc_compression: 'compression',
  ncc_conf: 'conf',
  ncc_content_disposition: 'content-disposition',
  ncc_content_type: 'content-type',
  ncc_cookie: 'cookie',
  ncc_cross_spawn: 'cross-spawn',
  ncc_debug: 'debug',
  ncc_devalue: 'devalue',
  ncc_find_up: 'find-up',
  ncc_fresh: 'fresh',
  ncc_glob: 'glob',
  ncc_gzip_size: 'gzip-size',
  ncc_http_proxy: 'http-proxy',
  ncc_ignore_loader: 'ignore-loader',
  ncc_is_animated: 'is-animated',
  ncc_is_docker: 'is-docker',
  ncc_is_wsl: 'is-wsl',
  ncc_json5: 'json5',
  // ncc_jsonwebtoken: 'jsonwebtoken', This one uses "dist"
  ncc_loader_runner: 'loader-runner', // TODO: is this being used?
  ncc_loader_utils2: 'loader-utils2',
  ncc_loader_utils3: 'loader-utils3',
  ncc_lodash_curry: 'lodash.curry',
  ncc_lru_cache: 'lru-cache',
  ncc_nanoid: 'nanoid',
  ncc_native_url: {
    mod: 'native-url',
    externals: { querystring: `${next_vendored}/querystring-es3` },
  },
  ncc_neo_async: 'neo-async', // TODO: Not being used by next?
  ncc_ora: 'ora',
  ncc_postcss_safe_parser: 'postcss-safe-parser',
  ncc_postcss_flexbugs_fixes: 'postcss-flexbugs-fixes',
  ncc_postcss_preset_env: 'postcss-preset-env',
  ncc_postcss_scss: {
    mod: 'postcss-scss',
    externals: { 'postcss/lib/parser': 'postcss/lib/parser' },
  },
  ncc_postcss_modules_extract_imports: {
    mod: 'postcss-modules-extract-imports',
    externals: { 'postcss/lib/parser': 'postcss/lib/parser' },
  },
  ncc_postcss_modules_local_by_default: {
    mod: 'postcss-modules-local-by-default',
    externals: { 'postcss/lib/parser': 'postcss/lib/parser' },
  },
  ncc_postcss_modules_scope: {
    mod: 'postcss-modules-scope',
    externals: { 'postcss/lib/parser': 'postcss/lib/parser' },
  },
  ncc_postcss_modules_values: {
    mod: 'postcss-modules-values',
    externals: { 'postcss/lib/parser': 'postcss/lib/parser' },
  },
  ncc_postcss_value_parser: {
    mod: 'postcss-value-parser',
    externals: { 'postcss/lib/parser': 'postcss/lib/parser' },
  },
  ncc_icss_utils: {
    mod: 'icss-utils',
    externals: { 'postcss/lib/parser': 'postcss/lib/parser' },
  },
  ncc_picomatch: 'picomatch',
  ncc_schema_utils2: 'schema-utils2',
  ncc_schema_utils3: 'schema-utils3',
  ncc_semver: 'semver',
  ncc_send: 'send',
  ncc_source_map: 'source-map',
  ncc_source_map08: { mod: 'source-map08', minify: false },
  ncc_string_hash: 'string-hash',
  ncc_strip_ansi: 'strip-ansi',
  ncc_superstruct: 'superstruct',
  ncc_zod: 'zod',
  ncc_nft: '@vercel/nft',
  ncc_tar: 'tar',
  ncc_terser: 'terser',
  ncc_text_table: 'text-table',
  ncc_unistore: 'unistore',
  ncc_watchpack: 'watchpack',
  ncc_ua_parser_js: 'ua-parser-js',
  ncc_ws: 'ws',
  ncc_http_proxy_agent: 'http-proxy-agent',
  ncc_https_proxy_agent: 'https-proxy-agent',
}

for (let [taskName, modOptions] of Object.entries(nccTasks)) {
  if (typeof modOptions === 'string') {
    modOptions = { mod: modOptions }
  }
  const {
    mod,
    modPath = mod,
    esm = false,
    browserOnly,
    use,
    externals: addedExternals,
    minify,
  } = modOptions

  if (!browserOnly) externals[mod] = `${next_vendored}/${mod}`

  let combinedExternals = addedExternals
    ? { ...externals, ...addedExternals }
    : { ...externals }

  // If the module is nested in a namespace scope, we need to update our relative paths
  // in the externals object
  if (mod.startsWith('@')) {
    for (const [key, value] of Object.entries(combinedExternals)) {
      if (value.startsWith('../')) {
        combinedExternals[key] = `../${value}`
      }
    }
  }

  tasks[taskName] = async (task) => {
    await task.clear(mod)
    task
      .source(esm ? resolveModule(modPath) : resolveCommonjs(modPath))
      .ncc(
        Object.assign(
          { packageName: mod, externals: combinedExternals },
          browserOnly && { mainFields: ['browser', 'main'], target: 'es5' },
          minify !== undefined && { minify }
        )
      )
    if (use) task.use(use)
    await task.target(mod)
  }
}

externals['mini-css-extract-plugin'] =
  `${next_vendored}/mini-css-extract-plugin`

export async function ncc_mini_css_extract_plugin(task: Task) {
  const mod = 'mini-css-extract-plugin'
  const modExternals = {
    ...externals,
    './index': './index.js',
    './loader': './loader.js',
    './hmr': './hmr',
    'schema-utils': externals['schema-utils3']!,
    'webpack-sources': externals['webpack-sources1']!,
  }
  const nccOptions = {
    packageName: mod,
    moduleOnly: true,
    externals: modExternals,
  }

  await task.clear(mod)
  await task
    .source(resolve(resolveCommonjs(mod)))
    .ncc({ ...nccOptions, moduleOnly: false })
    .target(mod)
  await task
    .source(resolve(resolveCommonjs(mod), '../index.js'))
    .ncc(nccOptions)
    .target(mod)
  await task
    .source(resolve(resolveCommonjs(mod), '../loader.js'))
    .ncc(nccOptions)
    .target(mod)
  await task
    .source(resolve(resolveCommonjs(mod), '../hmr/hotModuleReplacement.js'))
    .ncc(nccOptions)
    .target(mod + '/hmr')
}

export async function copy_constants_browserify(task: Task) {
  await task.clear('constants-browserify')
  await task
    .source(resolveModule('constants-browserify'))
    .target('constants-browserify')
  await writeJson('constants-browserify/package.json', {
    name: 'constants-browserify',
    main: './constants.json',
  })
}

export async function copy_regenerator_runtime(task: Task) {
  await task.clear('regenerator-runtime')
  await task
    .source(join(dirname(resolveModule('regenerator-runtime')), '**/*'))
    .target('regenerator-runtime')
}

export async function generate_externals(task: Task) {
  await task.clear('externals.json')
  const parsedExternals = Object.entries(externals).reduce<typeof externals>(
    (acc, [key, val]) => {
      acc[key] = val.replace(/^\.\.\//, '@next/vendored/')
      return acc
    },
    {}
  )
  await fs.writeFile('externals.json', JSON.stringify(parsedExternals), 'utf8')
}

export async function ncc(task: Task) {
  await task.parallel([...Object.keys(nccTasks), 'ncc_mini_css_extract_plugin'])
  await task.parallel(['copy_regenerator_runtime', 'copy_constants_browserify'])
}

function writeJson(file: string, obj: any) {
  return fs.writeFile(file, JSON.stringify(obj, null) + '\n')
}
