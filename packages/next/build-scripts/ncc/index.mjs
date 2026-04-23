#!/usr/bin/env node
// Orchestrates every ncc_* / copy_* recipe that used to live in taskfile.js.
// Most recipes are table-driven (see `simpleRecipes`); the rest have bespoke
// implementations further down.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { nccBundle, PKG_ROOT } from '../lib/ncc.mjs'

const require = createRequire(import.meta.url)
const glob = require('glob')
const resolveFrom = require('resolve-from')
const recast = require('recast')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function abs(p) {
  return path.isAbsolute(p) ? p : path.resolve(PKG_ROOT, p)
}

async function rmrf(p) {
  await fs.rm(abs(p), { recursive: true, force: true })
}

async function writeJson(file, obj, { spaces = 0 } = {}) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(
    file,
    JSON.stringify(obj, null, spaces) + (spaces === 0 ? '\n' : '')
  )
}

async function readJson(p) {
  return JSON.parse(await fs.readFile(p, 'utf8'))
}

// Recursive copy of a glob. Preserves the subpath relative to `srcBase`.
async function copyGlob({ srcBase, pattern, destDir, transform, globOpts = {} }) {
  const matches = glob.sync(pattern, { cwd: srcBase, nodir: true, ...globOpts })
  await Promise.all(
    matches.map(async (rel) => {
      const src = path.join(srcBase, rel)
      const dest = path.join(abs(destDir), rel)
      await fs.mkdir(path.dirname(dest), { recursive: true })
      if (transform) {
        const data = await fs.readFile(src, 'utf8')
        await fs.writeFile(dest, transform(data, rel))
      } else {
        await fs.copyFile(src, dest)
      }
    })
  )
}

// Copy a single file (used for things like LICENSE copies).
async function copyFile(src, destDir) {
  const dest = path.join(abs(destDir), path.basename(src))
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await fs.copyFile(src, dest)
}

// ---------------------------------------------------------------------------
// Shared externals. Kept in insertion order to match taskfile.js, but the
// runtime ordering doesn't matter — only the final shape matters.
// ---------------------------------------------------------------------------

export const externals = {
  'caniuse-lite': 'caniuse-lite',
  '/caniuse-lite(/.*)/': 'caniuse-lite$1',
  'baseline-browser-mapping': 'baseline-browser-mapping',
  '/baseline-browser-mapping(/.*)/': 'baseline-browser-mapping$1',

  postcss: 'postcss',
  'postcss-safe-parser': 'next/dist/compiled/postcss-safe-parser',

  'node-sass': 'node-sass',
  sass: 'sass',
  fibers: 'fibers',

  chokidar: 'chokidar',
  'jest-worker': 'jest-worker',

  'terser-webpack-plugin':
    'next/dist/build/webpack/plugins/terser-webpack-plugin/src',

  punycode: 'punycode/',

  // Extensions added in taskfile.js as it goes.
  'node-html-parser': 'next/dist/compiled/node-html-parser',
  '@vercel/routing-utils': 'next/dist/compiled/@vercel/routing-utils',
  busboy: 'next/dist/compiled/busboy',
  '@mswjs/interceptors/ClientRequest':
    'next/dist/compiled/@mswjs/interceptors/ClientRequest',
  '@babel/runtime': 'next/dist/compiled/@babel/runtime',
  '@vercel/og': 'next/dist/compiled/@vercel/og',
  anser: 'next/dist/compiled/anser',
  'next/dist/compiled/anser': 'next/dist/compiled/anser',
  'stacktrace-parser': 'next/dist/compiled/stacktrace-parser',
  'next/dist/compiled/stacktrace-parser':
    'next/dist/compiled/stacktrace-parser',
  'data-uri-to-buffer': 'next/dist/compiled/data-uri-to-buffer',
  'next/dist/compiled/data-uri-to-buffer':
    'next/dist/compiled/data-uri-to-buffer',
  'css.escape': 'next/dist/compiled/css.escape',
  'next/dist/compiled/css.escape': 'next/dist/compiled/css.escape',
  'shell-quote': 'next/dist/compiled/shell-quote',
  'next/dist/compiled/shell-quote': 'next/dist/compiled/shell-quote',
  acorn: 'next/dist/compiled/acorn',
  '@edge-runtime/cookies': 'next/dist/compiled/@edge-runtime/cookies',
  '@edge-runtime/primitives': 'next/dist/compiled/@edge-runtime/primitives',
  '@edge-runtime/ponyfill': 'next/dist/compiled/@edge-runtime/ponyfill',
  'edge-runtime': 'next/dist/compiled/edge-runtime',
  watchpack: 'next/dist/compiled/watchpack',
  browserslist: 'next/dist/compiled/browserslist',
  '@napi-rs/triples': 'next/dist/compiled/@napi-rs/triples',
  'p-limit': 'next/dist/compiled/p-limit',
  'p-queue': 'next/dist/compiled/p-queue',
  'raw-body': 'next/dist/compiled/raw-body',
  'image-size': 'next/dist/compiled/image-size',
  'image-detector': 'next/dist/compiled/image-detector',
  '@hapi/accept': 'next/dist/compiled/@hapi/accept',
  'async-retry': 'next/dist/compiled/async-retry',
  'async-sema': 'next/dist/compiled/async-sema',
  'postcss-plugin-stub-for-cssnano-simple':
    'next/dist/compiled/postcss-plugin-stub-for-cssnano-simple',

  // babelCorePackages.
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

  'cssnano-simple': 'next/dist/compiled/cssnano-simple',
  bytes: 'next/dist/compiled/bytes',
  'ci-info': 'next/dist/compiled/ci-info',
  'cli-select': 'next/dist/compiled/cli-select',
  commander: 'next/dist/compiled/commander',
  'comment-json': 'next/dist/compiled/comment-json',
  compression: 'next/dist/compiled/compression',
  conf: 'next/dist/compiled/conf',
  'content-disposition': 'next/dist/compiled/content-disposition',
  'content-type': 'next/dist/compiled/content-type',
  cookie: 'next/dist/compiled/cookie',
  'cross-spawn': 'next/dist/compiled/cross-spawn',
  debug: 'next/dist/compiled/debug',
  devalue: 'next/dist/compiled/devalue',
  'find-up': 'next/dist/compiled/find-up',
  fresh: 'next/dist/compiled/fresh',
  glob: 'next/dist/compiled/glob',
  'gzip-size': 'next/dist/compiled/gzip-size',
  'http-proxy': 'next/dist/compiled/http-proxy',
  'ignore-loader': 'next/dist/compiled/ignore-loader',
  'is-animated': 'next/dist/compiled/is-animated',
  'ipaddr.js': 'next/dist/compiled/ipaddr.js',
  'is-docker': 'next/dist/compiled/is-docker',
  'is-wsl': 'next/dist/compiled/is-wsl',
  json5: 'next/dist/compiled/json5',
  jsonwebtoken: 'next/dist/compiled/jsonwebtoken',
  'loader-runner': 'next/dist/compiled/loader-runner',
  'loader-utils': 'error loader-utils version not specified',
  'loader-utils2': 'next/dist/compiled/loader-utils2',
  'loader-utils3': 'next/dist/compiled/loader-utils3',
  'lodash.curry': 'next/dist/compiled/lodash.curry',
  'lru-cache': 'next/dist/compiled/lru-cache',
  nanoid: 'next/dist/compiled/nanoid',
  'native-url': 'next/dist/compiled/native-url',
  'neo-async': 'next/dist/compiled/neo-async',
  ora: 'next/dist/compiled/ora',
  'postcss-flexbugs-fixes': 'next/dist/compiled/postcss-flexbugs-fixes',
  'postcss-preset-env': 'next/dist/compiled/postcss-preset-env',
  'postcss-scss': 'next/dist/compiled/postcss-scss',
  'postcss-modules-extract-imports':
    'next/dist/compiled/postcss-modules-extract-imports',
  'postcss-modules-local-by-default':
    'next/dist/compiled/postcss-modules-local-by-default',
  'postcss-modules-scope': 'next/dist/compiled/postcss-modules-scope',
  'postcss-modules-values': 'next/dist/compiled/postcss-modules-values',
  'postcss-value-parser': 'next/dist/compiled/postcss-value-parser',
  'icss-utils': 'next/dist/compiled/icss-utils',

  scheduler: 'next/dist/compiled/scheduler',
  'schema-utils': 'MISSING_VERSION schema-utils version not specified',
  'schema-utils2': 'next/dist/compiled/schema-utils2',
  'schema-utils3': 'next/dist/compiled/schema-utils3',
  semver: 'next/dist/compiled/semver',
  send: 'next/dist/compiled/send',
  'source-map': 'next/dist/compiled/source-map',
  'source-map08': 'next/dist/compiled/source-map08',
  'next/dist/compiled/source-map08': 'next/dist/compiled/source-map08',
  'serve-handler': 'next/dist/compiled/serve-handler',
  'string-hash': 'next/dist/compiled/string-hash',
  'strip-ansi': 'next/dist/compiled/strip-ansi',
  'next/dist/compiled/strip-ansi': 'next/dist/compiled/strip-ansi',
  '@vercel/blob': 'next/dist/compiled/@vercel/blob',
  '@vercel/nft': 'next/dist/compiled/@vercel/nft',
  tar: 'next/dist/compiled/tar',
  terser: 'next/dist/compiled/terser',
  'text-table': 'next/dist/compiled/text-table',
  unistore: 'next/dist/compiled/unistore',
  superstruct: 'next/dist/compiled/superstruct',
  zod: 'next/dist/compiled/zod',
  'zod-validation-error': 'next/dist/compiled/zod-validation-error',
  'web-vitals': 'next/dist/compiled/web-vitals',
  'web-vitals-attribution': 'next/dist/compiled/web-vitals-attribution',
  'webpack-sources': 'error webpack-sources version not specified',
  'webpack-sources1': 'next/dist/compiled/webpack-sources1',
  'webpack-sources3': 'next/dist/compiled/webpack-sources3',
  picomatch: 'next/dist/compiled/picomatch',
  'mini-css-extract-plugin': 'next/dist/compiled/mini-css-extract-plugin',
  'ua-parser-js': 'next/dist/compiled/ua-parser-js',

  webpack: 'next/dist/compiled/webpack/webpack-lib',
  'webpack/lib/NormalModule': 'next/dist/compiled/webpack/NormalModule',
  'webpack/lib/node/NodeTargetPlugin':
    'next/dist/compiled/webpack/NodeTargetPlugin',

  'write-file-atomic': 'next/dist/compiled/write-file-atomic',
  ws: 'next/dist/compiled/ws',
  'path-to-regexp': 'next/dist/compiled/path-to-regexp',
  '@opentelemetry/api': 'next/dist/compiled/@opentelemetry/api',
  'http-proxy-agent': 'next/dist/compiled/http-proxy-agent',
  'https-proxy-agent': 'next/dist/compiled/https-proxy-agent',
  'safe-stable-stringify': 'next/dist/compiled/safe-stable-stringify',
}

const babelCorePackages = {
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

const webpackBundlePackages = {
  webpack: 'next/dist/compiled/webpack/webpack-lib',
  'webpack/lib/NormalModule': 'next/dist/compiled/webpack/NormalModule',
  'webpack/lib/node/NodeTargetPlugin':
    'next/dist/compiled/webpack/NodeTargetPlugin',
}

// ---------------------------------------------------------------------------
// Simple recipes: a single entry, ncc bundle to a single dir, no post-processing.
// ---------------------------------------------------------------------------

/**
 * @type {Array<{
 *   name: string,
 *   entry?: string | (() => string),
 *   source?: string,
 *   target: string,
 *   packageName?: string,
 *   bundleName?: string,
 *   packageJsonName?: string,
 *   target_es?: string,
 *   browserMain?: boolean,
 *   extraExternals?: Record<string, string>,
 *   minify?: boolean,
 *   esm?: boolean,
 *   resolveBrowser?: string,
 * }>}
 */
const simpleRecipes = [
  { name: 'ncc_node_html_parser', entry: () => require.resolve('node-html-parser'), target: 'src/compiled/node-html-parser', packageName: 'node-html-parser', target_es: 'es5' },
  { name: 'ncc_vercel_routing_utils', entry: () => require.resolve('@vercel/routing-utils/dist/superstatic'), target: 'src/compiled/@vercel/routing-utils', packageName: '@vercel/routing-utils', target_es: 'es5' },
  { name: 'ncc_busboy', entry: () => require.resolve('busboy'), target: 'src/compiled/busboy', packageName: 'busboy', target_es: 'es5' },
  { name: 'ncc_mswjs_interceptors', entry: () => require.resolve('@mswjs/interceptors/ClientRequest'), target: 'src/compiled/@mswjs/interceptors/ClientRequest', packageName: '@mswjs/interceptors/ClientRequest', target_es: 'es5' },
  { name: 'ncc_node_anser', entry: () => require.resolve('anser'), target: 'src/compiled/anser', packageName: 'anser' },
  { name: 'ncc_node_stacktrace_parser', entry: () => require.resolve('stacktrace-parser'), target: 'src/compiled/stacktrace-parser', packageName: 'stacktrace-parser' },
  { name: 'ncc_node_data_uri_to_buffer', entry: () => require.resolve('data-uri-to-buffer'), target: 'src/compiled/data-uri-to-buffer', packageName: 'data-uri-to-buffer' },
  { name: 'ncc_node_cssescape', entry: () => require.resolve('css.escape'), target: 'src/compiled/css.escape', packageName: 'css.escape' },
  { name: 'ncc_node_shell_quote', entry: () => require.resolve('shell-quote'), target: 'src/compiled/shell-quote', packageName: 'shell-quote' },
  { name: 'ncc_acorn', entry: () => require.resolve('acorn'), target: 'src/compiled/acorn', packageName: 'acorn' },
  { name: 'ncc_napirs_triples', entry: () => require.resolve('@napi-rs/triples'), target: 'src/compiled/@napi-rs/triples', packageName: '@napi-rs/triples' },
  { name: 'ncc_p_limit', entry: () => require.resolve('p-limit'), target: 'src/compiled/p-limit', packageName: 'p-limit' },
  { name: 'ncc_p_queue', entry: () => require.resolve('p-queue'), target: 'src/compiled/p-queue', packageName: 'p-queue' },
  { name: 'ncc_raw_body', entry: () => require.resolve('raw-body'), target: 'src/compiled/raw-body', packageName: 'raw-body' },
  { name: 'ncc_image_size', entry: () => require.resolve('image-size'), target: 'src/compiled/image-size', packageName: 'image-size' },
  // ncc_image_detector: input is image-size/dist/detector.js but packageName stays 'image-size'
  // and output goes to src/compiled/image-detector. Needs a manual entry/packageName split.
  { name: 'ncc_image_detector', entry: () => require.resolve('image-size/dist/detector.js'), target: 'src/compiled/image-detector', packageName: 'image-size' },
  { name: 'ncc_hapi_accept', entry: () => require.resolve('@hapi/accept'), target: 'src/compiled/@hapi/accept', packageName: '@hapi/accept' },

  // Browserified polyfills: mainFields: ['browser', 'main'] + target es5.
  { name: 'ncc_assert', entry: () => require.resolve('assert/'), target: 'src/compiled/assert', packageName: 'assert', browserMain: true, target_es: 'es5' },
  { name: 'ncc_browser_zlib', entry: () => require.resolve('browserify-zlib/'), target: 'src/compiled/browserify-zlib', packageName: 'browserify-zlib', browserMain: true, target_es: 'es5' },
  { name: 'ncc_buffer', entry: () => require.resolve('buffer/'), target: 'src/compiled/buffer', packageName: 'buffer', browserMain: true, target_es: 'es5' },
  { name: 'ncc_crypto_browserify', entry: () => require.resolve('crypto-browserify/'), target: 'src/compiled/crypto-browserify', packageName: 'crypto-browserify', browserMain: true, target_es: 'es5' },
  { name: 'ncc_domain_browser', entry: () => require.resolve('domain-browser/'), target: 'src/compiled/domain-browser', packageName: 'domain-browser', browserMain: true, target_es: 'es5' },
  { name: 'ncc_events', entry: () => require.resolve('events/'), target: 'src/compiled/events', packageName: 'events', browserMain: true, target_es: 'es5' },
  { name: 'ncc_stream_http', entry: () => require.resolve('stream-http/'), target: 'src/compiled/stream-http', packageName: 'stream-http', browserMain: true, target_es: 'es5' },
  { name: 'ncc_https_browserify', entry: () => require.resolve('https-browserify/'), target: 'src/compiled/https-browserify', packageName: 'https-browserify', browserMain: true, target_es: 'es5' },
  { name: 'ncc_os_browserify', entry: () => require.resolve('os-browserify/browser'), target: 'src/compiled/os-browserify', packageName: 'os-browserify', browserMain: true, target_es: 'es5' },
  { name: 'ncc_process', entry: () => require.resolve('process/browser'), target: 'src/compiled/process', packageName: 'process', browserMain: true, target_es: 'es5' },
  { name: 'ncc_querystring_es3', entry: () => require.resolve('querystring-es3/'), target: 'src/compiled/querystring-es3', packageName: 'querystring-es3', browserMain: true, target_es: 'es5' },
  { name: 'ncc_string_decoder', entry: () => require.resolve('string_decoder/'), target: 'src/compiled/string_decoder', packageName: 'string_decoder', browserMain: true, target_es: 'es5' },
  { name: 'ncc_util', entry: () => require.resolve('util/'), target: 'src/compiled/util', packageName: 'util', browserMain: true, target_es: 'es5' },
  { name: 'ncc_punycode', entry: () => require.resolve('punycode/'), target: 'src/compiled/punycode', packageName: 'punycode', browserMain: true, target_es: 'es5' },
  { name: 'ncc_set_immediate', entry: () => require.resolve('setimmediate/'), target: 'src/compiled/setimmediate', packageName: 'setimmediate', browserMain: true, target_es: 'es5' },
  { name: 'ncc_tty_browserify', entry: () => require.resolve('tty-browserify/'), target: 'src/compiled/tty-browserify', packageName: 'tty-browserify', browserMain: true, target_es: 'es5' },
  { name: 'ncc_vm_browserify', entry: () => require.resolve('vm-browserify/'), target: 'src/compiled/vm-browserify', packageName: 'vm-browserify', browserMain: true, target_es: 'es5' },
  { name: 'ncc_timers_browserify', entry: () => require.resolve('timers-browserify/'), target: 'src/compiled/timers-browserify', packageName: 'timers-browserify', browserMain: true, target_es: 'es5', extraExternals: { setimmediate: 'next/dist/compiled/setimmediate' } },

  { name: 'ncc_async_retry', entry: () => require.resolve('async-retry'), target: 'src/compiled/async-retry', packageName: 'async-retry' },
  { name: 'ncc_async_sema', entry: () => require.resolve('async-sema'), target: 'src/compiled/async-sema', packageName: 'async-sema' },
  { name: 'ncc_watchpack', entry: () => require.resolve('watchpack'), target: 'src/compiled/watchpack', packageName: 'watchpack' },
  { name: 'ncc_bytes', entry: () => require.resolve('bytes'), target: 'src/compiled/bytes', packageName: 'bytes' },
  { name: 'ncc_ci_info', entry: () => require.resolve('ci-info'), target: 'src/compiled/ci-info', packageName: 'ci-info' },
  { name: 'ncc_cli_select', entry: () => require.resolve('cli-select'), target: 'src/compiled/cli-select', packageName: 'cli-select' },
  { name: 'ncc_commander', entry: () => require.resolve('commander'), target: 'src/compiled/commander', packageName: 'commander' },
  { name: 'ncc_comment_json', entry: () => require.resolve('comment-json'), target: 'src/compiled/comment-json', packageName: 'comment-json' },
  { name: 'ncc_compression', entry: () => require.resolve('compression'), target: 'src/compiled/compression', packageName: 'compression' },
  { name: 'ncc_conf', entry: () => require.resolve('conf'), target: 'src/compiled/conf', packageName: 'conf' },
  { name: 'ncc_content_disposition', entry: () => require.resolve('content-disposition'), target: 'src/compiled/content-disposition', packageName: 'content-disposition' },
  { name: 'ncc_content_type', entry: () => require.resolve('content-type'), target: 'src/compiled/content-type', packageName: 'content-type' },
  { name: 'ncc_cookie', entry: () => require.resolve('cookie'), target: 'src/compiled/cookie', packageName: 'cookie' },
  { name: 'ncc_cross_spawn', entry: () => require.resolve('cross-spawn'), target: 'src/compiled/cross-spawn', packageName: 'cross-spawn' },
  { name: 'ncc_debug', entry: () => require.resolve('debug'), target: 'src/compiled/debug', packageName: 'debug' },
  { name: 'ncc_devalue', entry: () => require.resolve('devalue'), target: 'src/compiled/devalue', packageName: 'devalue' },
  { name: 'ncc_find_up', entry: () => require.resolve('find-up'), target: 'src/compiled/find-up', packageName: 'find-up' },
  { name: 'ncc_fresh', entry: () => require.resolve('fresh'), target: 'src/compiled/fresh', packageName: 'fresh' },
  { name: 'ncc_glob', entry: () => require.resolve('glob'), target: 'src/compiled/glob', packageName: 'glob' },
  { name: 'ncc_gzip_size', entry: () => require.resolve('gzip-size'), target: 'src/compiled/gzip-size', packageName: 'gzip-size' },
  { name: 'ncc_http_proxy', entry: () => require.resolve('http-proxy'), target: 'src/compiled/http-proxy', packageName: 'http-proxy' },
  { name: 'ncc_ignore_loader', entry: () => require.resolve('ignore-loader'), target: 'src/compiled/ignore-loader', packageName: 'ignore-loader' },
  { name: 'ncc_is_animated', entry: () => require.resolve('is-animated'), target: 'src/compiled/is-animated', packageName: 'is-animated' },
  { name: 'ncc_ipaddr_js', entry: () => require.resolve('ipaddr.js'), target: 'src/compiled/ipaddr.js', packageName: 'ipaddr.js' },
  { name: 'ncc_is_docker', entry: () => require.resolve('is-docker'), target: 'src/compiled/is-docker', packageName: 'is-docker' },
  { name: 'ncc_is_wsl', entry: () => require.resolve('is-wsl'), target: 'src/compiled/is-wsl', packageName: 'is-wsl' },
  { name: 'ncc_json5', entry: () => require.resolve('json5'), target: 'src/compiled/json5', packageName: 'json5' },
  { name: 'ncc_jsonwebtoken', entry: () => require.resolve('jsonwebtoken'), target: 'src/compiled/jsonwebtoken', packageName: 'jsonwebtoken', extraExternals: { semver: 'next/dist/lib/semver-noop' } },
  { name: 'ncc_loader_runner', entry: () => require.resolve('loader-runner'), target: 'src/compiled/loader-runner', packageName: 'loader-runner' },
  { name: 'ncc_loader_utils2', entry: () => require.resolve('loader-utils2'), target: 'src/compiled/loader-utils2', packageName: 'loader-utils2' },
  { name: 'ncc_loader_utils3', entry: () => require.resolve('loader-utils3'), target: 'src/compiled/loader-utils3', packageName: 'loader-utils3' },
  { name: 'ncc_lodash_curry', entry: () => require.resolve('lodash.curry'), target: 'src/compiled/lodash.curry', packageName: 'lodash.curry' },
  { name: 'ncc_lru_cache', entry: () => require.resolve('lru-cache'), target: 'src/compiled/lru-cache', packageName: 'lru-cache' },
  { name: 'ncc_nanoid', entry: () => require.resolve('nanoid'), target: 'src/compiled/nanoid', packageName: 'nanoid' },
  { name: 'ncc_native_url', entry: () => require.resolve('native-url'), target: 'src/compiled/native-url', packageName: 'native-url', target_es: 'es5', extraExternals: { querystring: 'next/dist/compiled/querystring-es3' } },
  { name: 'ncc_neo_async', entry: () => require.resolve('neo-async'), target: 'src/compiled/neo-async', packageName: 'neo-async' },
  { name: 'ncc_ora', entry: () => require.resolve('ora'), target: 'src/compiled/ora', packageName: 'ora' },
  { name: 'ncc_postcss_flexbugs_fixes', entry: () => require.resolve('postcss-flexbugs-fixes'), target: 'src/compiled/postcss-flexbugs-fixes', packageName: 'postcss-flexbugs-fixes' },
  { name: 'ncc_postcss_safe_parser', entry: () => require.resolve('postcss-safe-parser'), target: 'src/compiled/postcss-safe-parser', packageName: 'postcss-safe-parser' },
  { name: 'ncc_postcss_preset_env', entry: () => require.resolve('postcss-preset-env'), target: 'src/compiled/postcss-preset-env', packageName: 'postcss-preset-env' },

  // postcss/lib/parser externals: they all share the same pattern.
  { name: 'ncc_postcss_scss', entry: () => require.resolve('postcss-scss'), target: 'src/compiled/postcss-scss', packageName: 'postcss-scss', extraExternals: { 'postcss/lib/parser': 'postcss/lib/parser' } },
  { name: 'ncc_postcss_modules_extract_imports', entry: () => require.resolve('postcss-modules-extract-imports'), target: 'src/compiled/postcss-modules-extract-imports', packageName: 'postcss-modules-extract-imports', extraExternals: { 'postcss/lib/parser': 'postcss/lib/parser' } },
  { name: 'ncc_postcss_modules_local_by_default', entry: () => require.resolve('postcss-modules-local-by-default'), target: 'src/compiled/postcss-modules-local-by-default', packageName: 'postcss-modules-local-by-default', extraExternals: { 'postcss/lib/parser': 'postcss/lib/parser' } },
  { name: 'ncc_postcss_modules_scope', entry: () => require.resolve('postcss-modules-scope'), target: 'src/compiled/postcss-modules-scope', packageName: 'postcss-modules-scope', extraExternals: { 'postcss/lib/parser': 'postcss/lib/parser' } },
  { name: 'ncc_postcss_modules_values', entry: () => require.resolve('postcss-modules-values'), target: 'src/compiled/postcss-modules-values', packageName: 'postcss-modules-values', extraExternals: { 'postcss/lib/parser': 'postcss/lib/parser' } },
  { name: 'ncc_postcss_value_parser', entry: () => require.resolve('postcss-value-parser'), target: 'src/compiled/postcss-value-parser', packageName: 'postcss-value-parser', extraExternals: { 'postcss/lib/parser': 'postcss/lib/parser' } },
  { name: 'ncc_icss_utils', entry: () => require.resolve('icss-utils'), target: 'src/compiled/icss-utils', packageName: 'icss-utils', extraExternals: { 'postcss/lib/parser': 'postcss/lib/parser' } },

  { name: 'ncc_schema_utils2', entry: () => require.resolve('schema-utils2'), target: 'src/compiled/schema-utils2', packageName: 'schema-utils', bundleName: 'schema-utils2' },
  { name: 'ncc_schema_utils3', entry: () => require.resolve('schema-utils3'), target: 'src/compiled/schema-utils3', packageName: 'schema-utils', bundleName: 'schema-utils3' },
  { name: 'ncc_semver', entry: () => require.resolve('semver'), target: 'src/compiled/semver', packageName: 'semver' },
  { name: 'ncc_send', entry: () => require.resolve('send'), target: 'src/compiled/send', packageName: 'send' },
  { name: 'ncc_source_map', entry: () => require.resolve('source-map'), target: 'src/compiled/source-map', packageName: 'source-map' },
  { name: 'ncc_source_map08', entry: () => require.resolve('source-map08'), target: 'src/compiled/source-map08', packageName: 'source-map08', packageJsonName: 'source-map08', minify: false },
  { name: 'ncc_serve_handler', entry: () => require.resolve('serve-handler'), target: 'src/compiled/serve-handler', packageName: 'serve-handler' },
  { name: 'ncc_string_hash', entry: () => require.resolve('string-hash'), target: 'src/compiled/string-hash', packageName: 'string-hash' },
  { name: 'ncc_strip_ansi', entry: () => require.resolve('strip-ansi'), target: 'src/compiled/strip-ansi', packageName: 'strip-ansi' },
  { name: 'ncc_vercel_blob', entry: () => require.resolve('@vercel/blob'), target: 'src/compiled/@vercel/blob', packageName: '@vercel/blob' },
  { name: 'ncc_nft', entry: () => require.resolve('@vercel/nft'), target: 'src/compiled/@vercel/nft', packageName: '@vercel/nft' },
  { name: 'ncc_tar', entry: () => require.resolve('tar'), target: 'src/compiled/tar', packageName: 'tar' },
  { name: 'ncc_terser', entry: () => require.resolve('terser'), target: 'src/compiled/terser', packageName: 'terser' },
  { name: 'ncc_text_table', entry: () => require.resolve('text-table'), target: 'src/compiled/text-table', packageName: 'text-table' },
  { name: 'ncc_unistore', entry: () => require.resolve('unistore'), target: 'src/compiled/unistore', packageName: 'unistore' },
  { name: 'ncc_superstruct', entry: () => require.resolve('superstruct'), target: 'src/compiled/superstruct', packageName: 'superstruct' },
  { name: 'ncc_zod', entry: () => require.resolve('zod'), target: 'src/compiled/zod', packageName: 'zod' },
  { name: 'ncc_zod_validation_error', entry: () => require.resolve('zod-validation-error'), target: 'src/compiled/zod-validation-error', packageName: 'zod-validation-error' },

  { name: 'ncc_web_vitals', entry: () => path.resolve(resolveFrom(PKG_ROOT, 'web-vitals'), '../web-vitals.js'), target: 'src/compiled/web-vitals', packageName: 'web-vitals', target_es: 'es5', esm: false },
  { name: 'ncc_web_vitals_attribution', entry: () => path.resolve(require.resolve('web-vitals'), '../web-vitals.attribution.js'), target: 'src/compiled/web-vitals-attribution', packageName: 'web-vitals', bundleName: 'web-vitals-attribution', target_es: 'es5', esm: false },

  { name: 'ncc_webpack_sources1', entry: () => require.resolve('webpack-sources1'), target: 'src/compiled/webpack-sources1', packageName: 'webpack-sources1', target_es: 'es5' },
  { name: 'ncc_webpack_sources3', entry: () => require.resolve('webpack-sources3'), target: 'src/compiled/webpack-sources3', packageName: 'webpack-sources3', target_es: 'es5' },

  { name: 'ncc_minimatch', entry: () => require.resolve('picomatch'), target: 'src/compiled/picomatch', packageName: 'picomatch' },
  { name: 'ncc_ua_parser_js', entry: () => require.resolve('ua-parser-js'), target: 'src/compiled/ua-parser-js', packageName: 'ua-parser-js' },
  { name: 'ncc_write_file_atomic', entry: () => require.resolve('write-file-atomic'), target: 'src/compiled/write-file-atomic', packageName: 'write-file-atomic' },
  { name: 'ncc_ws', entry: () => require.resolve('ws'), target: 'src/compiled/ws', packageName: 'ws' },
  { name: 'ncc_path_to_regexp', entry: () => require.resolve('path-to-regexp'), target: 'src/compiled/path-to-regexp', packageName: 'path-to-regexp' },
  { name: 'ncc_opentelemetry_api', entry: () => require.resolve('@opentelemetry/api'), target: 'src/compiled/@opentelemetry/api', packageName: '@opentelemetry/api' },
  { name: 'ncc_http_proxy_agent', entry: () => require.resolve('http-proxy-agent'), target: 'src/compiled/http-proxy-agent', packageName: 'http-proxy-agent' },
  { name: 'ncc_https_proxy_agent', entry: () => require.resolve('https-proxy-agent'), target: 'src/compiled/https-proxy-agent', packageName: 'https-proxy-agent' },
  { name: 'ncc_safe_stable_stringify', entry: () => require.resolve('safe-stable-stringify'), target: 'src/compiled/safe-stable-stringify', packageName: 'safe-stable-stringify', target_es: 'es5' },

  // postcss-plugin-stub: source is our own bundle entry, no packageName.
  { name: 'ncc_postcss_plugin_stub_for_cssnano_simple', source: 'src/bundles/postcss-plugin-stub/index.js', target: 'src/compiled/postcss-plugin-stub-for-cssnano-simple' },
]

// Generate a runner for each simple recipe. Each runner is exported by name.
function buildSimpleRunner(recipe) {
  return async function run() {
    const entry = recipe.entry
      ? recipe.entry()
      : abs(recipe.source)
    const options = {}
    if (recipe.browserMain) options.mainFields = ['browser', 'main']
    if (recipe.esm !== undefined) options.esm = recipe.esm
    const packageExternals = recipe.extraExternals
      ? { ...externals, ...recipe.extraExternals }
      : externals
    await nccBundle({
      entry,
      destDir: abs(recipe.target),
      packageName: recipe.packageName,
      bundleName: recipe.bundleName,
      packageJsonName: recipe.packageJsonName,
      minify: recipe.minify,
      target: recipe.target_es,
      externals: packageExternals,
      options,
    })
  }
}

// ---------------------------------------------------------------------------
// Complex recipes.
// ---------------------------------------------------------------------------

export async function ncc_browserslist() {
  // Neutralize browserslist's dynamic require so ncc doesn't try to bundle
  // it. We patch the source in-place (reverting afterwards) because ncc
  // reads from disk.
  const browserslistModule = require.resolve('browserslist')
  const nodeFile = path.join(path.dirname(browserslistModule), 'node.js')
  const original = await fs.readFile(nodeFile, 'utf8')
  const patched = original.replace(
    /require\(require\.resolve\(/g,
    `__non_webpack_require__(__non_webpack_require__.resolve(`
  )
  await fs.writeFile(nodeFile, patched)

  try {
    await nccBundle({
      entry: browserslistModule,
      destDir: abs('src/compiled/browserslist'),
      packageName: 'browserslist',
      externals,
      transformOutput: (code) =>
        code.replace(/process\.env\.BROWSERSLIST_IGNORE_OLD_DATA/g, 'true'),
    })
  } finally {
    await fs.writeFile(nodeFile, original)
  }
}

export async function ncc_babel_bundle() {
  const bundleExternals = { ...externals }
  for (const pkg of Object.keys(babelCorePackages)) {
    delete bundleExternals[pkg]
  }
  bundleExternals['next/dist/compiled/babel-packages'] =
    'next/dist/compiled/babel-packages'

  await nccBundle({
    entry: abs('src/bundles/babel/bundle.js'),
    destDir: abs('src/compiled/babel'),
    packageName: '@babel/core',
    bundleName: 'babel',
    externals: bundleExternals,
  })
}

export async function ncc_babel_bundle_packages() {
  const eslintParseFile = path.join(
    path.dirname(require.resolve('@babel/eslint-parser')),
    './parse.cjs'
  )
  const content = await fs.readFile(eslintParseFile, 'utf-8')
  const replaced = content
    .replace(
      `const babelParser = require((`,
      `function noop(){};\nconst babelParser = require('@babel/parser');noop((`
    )
    .replace(/require.resolve/g, 'noop')
  await fs.writeFile(eslintParseFile, replaced)

  await nccBundle({
    entry: abs('src/bundles/babel/packages-bundle.js'),
    destDir: abs('src/compiled/babel-packages'),
    externals,
  })

  await writeJson(abs('src/compiled/babel-packages/package.json'), {
    name: 'babel-packages',
    main: './packages-bundle.js',
  })

  await copyGlob({
    srcBase: abs('src/bundles/babel/packages'),
    pattern: '*',
    destDir: 'src/compiled/babel',
  })
}

export async function ncc_cssnano_simple_bundle() {
  const bundleExternals = {
    ...externals,
    'postcss-svgo':
      'next/dist/compiled/postcss-plugin-stub-for-cssnano-simple',
  }
  await nccBundle({
    entry: abs('src/bundles/cssnano-simple/index.js'),
    destDir: abs('src/compiled/cssnano-simple'),
    externals: bundleExternals,
  })
}

export async function ncc_webpack_bundle5() {
  const bundleExternals = {
    ...externals,
    'schema-utils': externals['schema-utils3'],
    'webpack-sources': externals['webpack-sources3'],
  }
  for (const pkg of Object.keys(webpackBundlePackages)) {
    delete bundleExternals[pkg]
  }
  await nccBundle({
    entry: abs('src/bundles/webpack/bundle5.js'),
    destDir: abs('src/compiled/webpack'),
    packageName: 'webpack',
    bundleName: 'webpack',
    externals: bundleExternals,
    target: 'es5',
    options: {
      customEmit(p) {
        if (p.endsWith('.runtime.js')) return `'./${path.basename(p)}'`
      },
    },
  })
}

export async function ncc_webpack_bundle_packages() {
  await copyGlob({
    srcBase: abs('src/bundles/webpack/packages'),
    pattern: '*',
    destDir: 'src/compiled/webpack/',
  })
}

export async function ncc_mini_css_extract_plugin() {
  const mainEntry = require.resolve('mini-css-extract-plugin')
  const loaderPath = path.resolve(mainEntry, '../index.js')
  const hmrPath = path.resolve(mainEntry, '../hmr/hotModuleReplacement.js')

  await nccBundle({
    entry: loaderPath,
    destDir: abs('src/compiled/mini-css-extract-plugin'),
    externals: {
      ...externals,
      './index': './index.js',
      'schema-utils': externals['schema-utils3'],
      'webpack-sources': externals['webpack-sources1'],
    },
  })

  await nccBundle({
    entry: hmrPath,
    destDir: abs('src/compiled/mini-css-extract-plugin/hmr'),
    externals: {
      ...externals,
      './hmr': './hmr',
      'schema-utils': 'next/dist/compiled/schema-utils3',
    },
  })

  await nccBundle({
    entry: mainEntry,
    destDir: abs('src/compiled/mini-css-extract-plugin'),
    packageName: 'mini-css-extract-plugin',
    externals: {
      ...externals,
      './index': './index.js',
      'schema-utils': externals['schema-utils3'],
    },
  })
}

export async function ncc_jest_worker() {
  await rmrf('src/compiled/jest-worker')
  await fs.mkdir(abs('src/compiled/jest-worker/workers'), { recursive: true })

  await nccBundle({
    entry: require.resolve('jest-worker'),
    destDir: abs('src/compiled/jest-worker'),
    packageName: 'jest-worker',
    externals,
  })

  const workers = ['processChild.js', 'threadChild.js']
  const jestWorkerRoot = path.dirname(require.resolve('jest-worker/package.json'))

  for (const worker of workers) {
    const sourcePath = path.join(jestWorkerRoot, 'build/workers', worker)
    const tmpPath = sourcePath + '.tmp.js'
    const raw = await fs.readFile(sourcePath, 'utf8')
    await fs.writeFile(
      tmpPath,
      raw.replace(/require\(file\)/g, '__non_webpack_require__(file)')
    )
    await nccBundle({
      entry: tmpPath,
      destDir: abs('src/compiled/jest-worker/out'),
      externals,
    })
    await fs.rename(
      abs(path.join('src/compiled/jest-worker/out', worker + '.tmp.js')),
      abs(path.join('src/compiled/jest-worker', worker))
    )
  }
  await rmrf('src/compiled/jest-worker/workers')
  await rmrf('src/compiled/jest-worker/out')
}

export async function ncc_sass_loader() {
  const sassLoaderPath = require.resolve('sass-loader')
  const utilsPath = path.join(path.dirname(sassLoaderPath), 'utils.js')
  const originalContent = await fs.readFile(utilsPath, 'utf8')

  await fs.writeFile(
    utilsPath,
    originalContent.replace(
      /require\.resolve\(["'](sass|node-sass|sass-embedded)["']\)/g,
      'eval("require").resolve("$1")'
    )
  )

  try {
    await nccBundle({
      entry: sassLoaderPath,
      destDir: abs('src/compiled/sass-loader'),
      packageName: 'sass-loader',
      externals: {
        ...externals,
        'schema-utils': externals['schema-utils3'],
        'loader-utils': externals['loader-utils2'],
      },
      target: 'es5',
    })
  } finally {
    await fs.writeFile(utilsPath, originalContent)
  }
}

export async function ncc_edge_runtime_cookies() {
  const dest = abs('src/compiled/@edge-runtime/cookies')
  const pkg = await readJson(require.resolve('@edge-runtime/cookies/package.json'))
  await rmrf('src/compiled/@edge-runtime/cookies')
  await fs.mkdir(dest, { recursive: true })
  await writeJson(path.join(dest, 'package.json'), {
    name: '@edge-runtime/cookies',
    version: pkg.version,
    main: './index.js',
    license: pkg.license,
  })
  await fs.cp(require.resolve('@edge-runtime/cookies/dist/index.js'), path.join(dest, 'index.js'))
  await fs.cp(require.resolve('@edge-runtime/cookies/dist/index.d.ts'), path.join(dest, 'index.d.ts'))
}

export async function ncc_edge_runtime_primitives() {
  const dest = abs('src/compiled/@edge-runtime/primitives')
  await fs.mkdir(dest, { recursive: true })
  const primitivesPath = path.dirname(
    require.resolve('@edge-runtime/primitives/package.json')
  )
  const pkg = await readJson(require.resolve('@edge-runtime/primitives/package.json'))
  await rmrf('src/compiled/@edge-runtime/primitives')
  await fs.mkdir(dest, { recursive: true })

  for (const file of await fs.readdir(path.join(primitivesPath, 'types'))) {
    await fs.cp(path.join(primitivesPath, 'types', file), path.join(dest, file))
  }
  for (const file of await fs.readdir(path.join(primitivesPath, 'dist'))) {
    await fs.cp(path.join(primitivesPath, 'dist', file), path.join(dest, file))
  }

  await writeJson(path.join(dest, 'package.json'), {
    name: '@edge-runtime/primitives',
    version: pkg.version,
    main: './index.js',
    license: pkg.license,
  })
  await fs.cp(require.resolve('@edge-runtime/primitives'), path.join(dest, 'index.js'))
  await fs.cp(require.resolve('@edge-runtime/primitives/types/index.d.ts'), path.join(dest, 'index.d.ts'))
}

export async function ncc_edge_runtime_ponyfill() {
  const indexFile = await fs.readFile(
    require.resolve('@edge-runtime/ponyfill/src/index.js'),
    'utf8'
  )
  const dest = abs('src/compiled/@edge-runtime/ponyfill')
  await fs.mkdir(dest, { recursive: true })
  await fs.writeFile(
    path.join(dest, 'index.js'),
    indexFile.replace(
      `require('@edge-runtime/primitives')`,
      `require(${JSON.stringify(externals['@edge-runtime/primitives'])})`
    )
  )
  await fs.cp(
    require.resolve('@edge-runtime/ponyfill/src/index.d.ts'),
    path.join(dest, 'index.d.ts')
  )
  const pkg = await readJson(require.resolve('@edge-runtime/ponyfill/package.json'))
  await writeJson(path.join(dest, 'package.json'), {
    name: '@edge-runtime/ponyfill',
    version: pkg.version,
    main: './index.js',
    types: './index.d.ts',
    license: pkg.license,
  })
}

export async function ncc_edge_runtime() {
  const vmPath = resolveFrom(
    path.dirname(require.resolve('edge-runtime')),
    '@edge-runtime/vm/dist/edge-vm'
  )
  const originalVm = await fs.readFile(vmPath, 'utf8')
  await fs.writeFile(
    vmPath,
    originalVm.replace(
      /require\.resolve\('@edge-runtime\/primitives/g,
      `__non_webpack_require__.resolve('next/dist/compiled/@edge-runtime/primitives`
    )
  )

  try {
    await nccBundle({
      entry: require.resolve('edge-runtime'),
      destDir: abs('src/compiled/edge-runtime'),
      packageName: 'edge-runtime',
      externals,
    })

    const outputFile = abs('src/compiled/edge-runtime/index.js')
    const out = await fs.readFile(outputFile, 'utf8')
    await fs.writeFile(outputFile, out.replace(/eval\("require"\)/g, 'require'))
  } finally {
    await fs.writeFile(vmPath, originalVm)
  }
}

export async function ncc_rsc_poison_packages() {
  const serverOnlyDir = path.dirname(require.resolve('server-only'))
  const clientOnlyDir = path.dirname(require.resolve('client-only'))
  await copyGlob({ srcBase: serverOnlyDir, pattern: '*', destDir: 'src/compiled/server-only' })
  await copyGlob({ srcBase: clientOnlyDir, pattern: '*', destDir: 'src/compiled/client-only' })
}

export async function ncc_modelcontextprotocol_sdk() {
  await nccBundle({
    entry: require.resolve('@modelcontextprotocol/sdk/server/mcp.js'),
    destDir: abs('src/compiled/@modelcontextprotocol/sdk/server'),
    externals,
  })
  await nccBundle({
    entry: require.resolve('@modelcontextprotocol/sdk/server/streamableHttp.js'),
    destDir: abs('src/compiled/@modelcontextprotocol/sdk/server'),
    externals,
  })
}

// ---------------------------------------------------------------------------
// These get custom post-processing via transformOutput.
// ---------------------------------------------------------------------------

export async function ncc_stream_browserify() {
  await nccBundle({
    entry: require.resolve('stream-browserify/'),
    destDir: abs('src/compiled/stream-browserify'),
    packageName: 'stream-browserify',
    options: { mainFields: ['browser', 'main'] },
    target: 'es5',
  })
  // readable-stream's browser mapping doesn't replace `require('stream')`
  // with the events fallback, which creates a circular reference. Patch it.
  const outputFile = abs('src/compiled/stream-browserify/index.js')
  const contents = await fs.readFile(outputFile, 'utf8')
  await fs.writeFile(
    outputFile,
    contents.replace(`require("stream")`, `require("events").EventEmitter`)
  )
}

export async function ncc_path_browserify() {
  await nccBundle({
    entry: require.resolve('path-browserify/'),
    destDir: abs('src/compiled/path-browserify'),
    packageName: 'path-browserify',
    externals,
    options: { mainFields: ['browser', 'main'] },
    target: 'es5',
  })
  const filePath = abs('src/compiled/path-browserify/index.js')
  const content = await fs.readFile(filePath, 'utf8')
  // `process.cwd()` is not available in edge-runtime; replace with "".
  await fs.writeFile(filePath, content.replace(/process\.cwd\(\)/g, '""'))
}

// ---------------------------------------------------------------------------
// Copy recipes.
// ---------------------------------------------------------------------------

export async function copy_regenerator_runtime() {
  const srcBase = path.dirname(require.resolve('regenerator-runtime'))
  await copyGlob({
    srcBase,
    pattern: '**/*',
    destDir: 'src/compiled/regenerator-runtime',
  })
}

export async function copy_docs() {
  const docsSource = path.join(PKG_ROOT, '../../docs')
  try {
    await fs.access(docsSource)
  } catch {
    return
  }
  const matches = glob.sync('**/*', { cwd: docsSource, nodir: true })
  await Promise.all(
    matches.map(async (rel) => {
      const src = path.join(docsSource, rel)
      // Rename .mdx to .md so AI agents globbing *.md find them.
      const finalRel = rel.endsWith('.mdx') ? rel.slice(0, -4) + '.md' : rel
      const dest = path.join(abs('dist/docs'), finalRel)
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.copyFile(src, dest)
    })
  )
}

export async function copy_skills() {
  const skillsSource = path.join(PKG_ROOT, '../../skills')
  try {
    await fs.access(skillsSource)
  } catch {
    return
  }
  await copyGlob({
    srcBase: skillsSource,
    pattern: '**/*',
    destDir: 'dist/skills',
  })
}

export async function copy_styled_jsx_assets() {
  const styledJsxPath = path.dirname(require.resolve('styled-jsx/package.json'))
  const typeFiles = glob.sync('*.d.ts', { cwd: styledJsxPath })
  const typesDir = abs('dist/styled-jsx/types')
  await fs.mkdir(typesDir, { recursive: true })
  for (const file of typeFiles) {
    const content = await fs.readFile(path.join(styledJsxPath, file), 'utf8')
    await fs.writeFile(path.join(typesDir, file), content)
  }
}

export async function copy_ncced() {
  await copyGlob({
    srcBase: abs('src/compiled'),
    pattern: '**/*',
    destDir: 'dist/compiled',
  })
}

export async function copy_babel_runtime() {
  const runtimeDir = path.dirname(require.resolve('@babel/runtime/package.json'))
  const outputDir = abs('src/compiled/@babel/runtime')
  const runtimeFiles = glob.sync('**/*', {
    cwd: runtimeDir,
    ignore: ['node_modules/**/*'],
  })

  for (const file of runtimeFiles) {
    const inputPath = path.join(runtimeDir, file)
    const outputPath = path.join(outputDir, file)
    const stat = await fs.stat(inputPath)
    if (!stat.isFile()) continue

    let contents = await fs.readFile(inputPath, 'utf8')
    if (inputPath.endsWith('.js')) {
      contents = contents
        .replace('regenerator-runtime', 'next/dist/compiled/regenerator-runtime')
        .replace('@babel/runtime', 'next/dist/compiled/@babel/runtime')
    }
    if (inputPath.endsWith('package.json')) {
      contents = JSON.stringify({
        ...JSON.parse(contents),
        dependencies: {},
      })
    }
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, contents)
  }
}

export async function copy_vercel_og() {
  const ogRoot = path.dirname(require.resolve('@vercel/og/package.json'))
  const dest = 'src/compiled/@vercel/og'

  for (const pattern of ['./dist/*.ttf', './dist/*.wasm']) {
    await copyGlob({ srcBase: ogRoot, pattern, destDir: dest, globOpts: { nodir: true } })
  }
  await copyFile(path.join(ogRoot, 'LICENSE'), dest)
  await copyGlob({ srcBase: ogRoot, pattern: './dist/index.*.js', destDir: dest })

  // Copy satori types + LICENSE.
  const satoriRoot = path.dirname(require.resolve('satori/package.json'))
  await copyFile(path.join(satoriRoot, 'dist/index.d.ts'), path.join(dest, 'satori'))
  await copyFile(path.join(satoriRoot, 'LICENSE'), path.join(dest, 'satori'))

  // Copy @vercel/og .d.ts files and rewrite `satori` imports.
  await copyGlob({
    srcBase: ogRoot,
    pattern: './dist/**/*.d.ts',
    destDir: dest,
    transform: (src) =>
      src.replace(/['"]satori['"]/g, '"next/dist/compiled/@vercel/og/satori"'),
  })

  await writeJson(
    abs('src/compiled/@vercel/og/package.json'),
    {
      name: '@vercel/og',
      version: require('@vercel/og/package.json').version,
      license: 'MPL-2.0',
      type: 'module',
      main: './index.node.js',
      exports: {
        '.': {
          'edge-light': './index.edge.js',
          import: './index.node.js',
          node: './index.node.js',
          default: './index.node.js',
        },
        './package.json': './package.json',
      },
    },
    { spaces: 2 }
  )
}

export async function copy_constants_browserify() {
  const dest = abs('src/compiled/constants-browserify')
  await fs.mkdir(dest, { recursive: true })
  await writeJson(path.join(dest, 'package.json'), {
    name: 'constants-browserify',
    main: './constants.json',
  })
  const src = require.resolve('constants-browserify')
  await fs.copyFile(src, path.join(dest, path.basename(src)))
}

export async function copy_bundle_analyzer_ui() {
  const bundleAnalyzerPath = path.join(PKG_ROOT, '../../apps/bundle-analyzer/dist')
  try {
    await fs.access(bundleAnalyzerPath)
  } catch {
    return
  }
  await fs.mkdir(abs('dist/bundle-analyzer'), { recursive: true })
  await fs.cp(bundleAnalyzerPath, abs('dist/bundle-analyzer'), {
    recursive: true,
    force: true,
  })
}

// ---------------------------------------------------------------------------
// copy_vendor_react: the giant one. Recast-powered AST rewrites for
// react-server-dom-{webpack,turbopack} plus package.json/LICENSE fan-out
// across the `builtin` and `experimental-builtin` channels.
// ---------------------------------------------------------------------------

async function copyVendorReactImpl({ experimental }) {
  const channel = experimental ? 'experimental-builtin' : 'builtin'
  const packageSuffix = experimental ? '-experimental' : ''

  function overridePackageName(source) {
    const json = JSON.parse(source)
    if (!json.name.endsWith(`-${channel}`)) {
      json.name = json.name + '-' + channel
    }
    return JSON.stringify(
      {
        name: json.name,
        main: json.main,
        exports: json.exports,
        dependencies: json.dependencies,
        peerDependencies: json.peerDependencies,
        browser: json.browser,
      },
      null,
      2
    )
  }

  function aliasVendoredReactPackages(source) {
    return source
      .replace(/require\(["']react["']\)/g, `require("next/dist/compiled/react${packageSuffix}")`)
      .replace(/require\(["']react-dom["']\)/g, `require("next/dist/compiled/react-dom${packageSuffix}")`)
      .replace(/require\(["']scheduler["']\)/g, `require("next/dist/compiled/scheduler${packageSuffix}")`)
  }

  const schedulerDir = path.dirname(
    require.resolve(`scheduler-${channel}/package.json`)
  )
  await copyGlob({
    srcBase: schedulerDir,
    pattern: '*.{json,js}',
    destDir: `src/compiled/scheduler${packageSuffix}`,
    transform: (data, rel) =>
      rel === 'package.json' ? overridePackageName(data) : data,
  })
  await copyGlob({
    srcBase: schedulerDir,
    pattern: 'cjs/**/*.{js,map}',
    destDir: `src/compiled/scheduler${packageSuffix}`,
  })
  await copyFile(path.join(schedulerDir, 'LICENSE'), `src/compiled/scheduler${packageSuffix}`)

  const reactDir = path.dirname(require.resolve(`react-${channel}/package.json`))
  const reactDomDir = path.dirname(require.resolve(`react-dom-${channel}/package.json`))

  await copyGlob({
    srcBase: reactDir,
    pattern: '*.{json,js}',
    destDir: `src/compiled/react${packageSuffix}`,
    transform: (data, rel) =>
      rel === 'package.json' ? overridePackageName(data) : data,
  })
  await copyFile(path.join(reactDir, 'LICENSE'), `src/compiled/react${packageSuffix}`)
  await copyGlob({
    srcBase: reactDir,
    pattern: 'cjs/**/*.{js,map}',
    destDir: `src/compiled/react${packageSuffix}`,
    transform: (data) => aliasVendoredReactPackages(data),
  })

  await copyGlob({
    srcBase: reactDomDir,
    pattern: '*.{json,js}',
    destDir: `src/compiled/react-dom${packageSuffix}`,
    transform: (data, rel) =>
      rel === 'package.json' ? overridePackageName(data) : data,
  })
  await copyFile(path.join(reactDomDir, 'LICENSE'), `src/compiled/react-dom${packageSuffix}`)
  await copyGlob({
    srcBase: reactDomDir,
    pattern: 'cjs/**/*.{js,map}',
    destDir: `src/compiled/react-dom${packageSuffix}`,
    transform: (data) => aliasVendoredReactPackages(data),
  })

  function replaceIdentifiersInAst(ast, replacements) {
    recast.types.namedTypes.File.assert(ast)
    recast.visit(ast, {
      visitIdentifier(p) {
        const replacement = replacements.get(p.node.name)
        if (replacement !== undefined) p.replace(replacement)
        this.traverse(p)
      },
    })
  }

  function parseFile(code, opts) {
    return recast.parse(code, {
      parser: {
        parse(source, options) {
          return require('recast/parsers/acorn').parse(source, {
            ...options,
            ecmaVersion: 'latest',
            sourceType: 'script',
          })
        },
      },
      ...opts,
    })
  }

  function parseExpression(exprCode) {
    const ast = recast.parse(`(${exprCode});`)
    return ast.program.body[0].expression
  }

  const reactDomCompiledDir = abs(`src/compiled/react-dom${packageSuffix}`)
  const itemsToRemove = [
    'static.js',
    'static.browser.js',
    'unstable_testing.js',
    'test-utils.js',
    'server.bun.js',
    'cjs/react-dom-server.bun.development.js',
    'cjs/react-dom-server.bun.production.min.js',
    'cjs/react-dom-test-utils.development.js',
    'cjs/react-dom-test-utils.production.min.js',
    'unstable_server-external-runtime.js',
  ]
  await Promise.all(
    itemsToRemove.map((item) =>
      fs.rm(path.join(reactDomCompiledDir, item), { force: true })
    )
  )

  const reactServerDomWebpackDir = path.dirname(
    require.resolve(`react-server-dom-webpack${packageSuffix}/package.json`)
  )
  await copyFile(
    path.join(reactServerDomWebpackDir, 'LICENSE'),
    `src/compiled/react-server-dom-webpack${packageSuffix}`
  )
  await copyGlob({
    srcBase: reactServerDomWebpackDir,
    pattern: '{package.json,*.js,cjs/**/*.{js,map}}',
    destDir: `src/compiled/react-server-dom-webpack${packageSuffix}`,
    transform: (data, rel) => {
      const base = path.basename(rel)
      const shouldReplace =
        (base.startsWith('react-server-dom-webpack-client') &&
          !base.startsWith('react-server-dom-webpack-client.browser')) ||
        (base.startsWith('react-server-dom-webpack-server') &&
          !base.startsWith('react-server-dom-webpack-server.browser'))
      if (shouldReplace) {
        const ast = parseFile(data, {})
        replaceIdentifiersInAst(
          ast,
          new Map([
            ['__webpack_require__', parseExpression('globalThis.__next_require__')],
          ])
        )
        return recast.print(ast).code
      }
      if (base === 'package.json') return overridePackageName(data)
      return data
    },
  })

  const reactServerDomTurbopackDir = path.dirname(
    require.resolve(`react-server-dom-turbopack${packageSuffix}/package.json`)
  )
  await copyFile(
    path.join(reactServerDomTurbopackDir, 'LICENSE'),
    `src/compiled/react-server-dom-turbopack${packageSuffix}`
  )
  await copyGlob({
    srcBase: reactServerDomTurbopackDir,
    pattern: '{package.json,*.js,cjs/**/*.{js,map}}',
    destDir: `src/compiled/react-server-dom-turbopack${packageSuffix}`,
    transform: (data, rel) => {
      const base = path.basename(rel)
      const shouldReplace =
        (base.startsWith('react-server-dom-turbopack-client') ||
          base.startsWith('react-server-dom-turbopack-server')) &&
        !base.includes('.browser.')
      if (shouldReplace) {
        const ast = parseFile(data, {})
        replaceIdentifiersInAst(
          ast,
          new Map([
            ['__turbopack_load_by_url__', parseExpression('globalThis.__next_chunk_load__')],
            ['__turbopack_require__', parseExpression('globalThis.__next_require__')],
          ])
        )
        return recast.print(ast).code
      }
      if (base === 'package.json') return overridePackageName(data)
      return data
    },
  })
}

export async function copy_vendor_react() {
  await copyVendorReactImpl({ experimental: false })
  await copyVendorReactImpl({ experimental: true })
  // react-is: copy as-is (we currently assume canary and experimental are equal).
  const reactIsRoot = path.dirname(require.resolve('react-is-builtin/package.json'))
  await copyGlob({
    srcBase: reactIsRoot,
    pattern: '**/*',
    destDir: 'src/compiled/react-is',
  })
}

// ---------------------------------------------------------------------------
// react-refresh + @next/font + capsize: these get called from compile.mjs too,
// so export them individually.
// ---------------------------------------------------------------------------

export async function ncc_react_refresh_utils() {
  await rmrf('dist/compiled/react-refresh')
  await fs.cp(
    path.dirname(require.resolve('react-refresh/package.json')),
    abs('dist/compiled/react-refresh'),
    { recursive: true, force: true }
  )

  const srcDir = path.join(
    path.dirname(require.resolve('@next/react-refresh-utils/package.json')),
    'dist'
  )
  const destDir = abs('dist/compiled/@next/react-refresh-utils/dist')
  await rmrf('dist/compiled/@next/react-refresh-utils/dist')
  await fs.mkdir(destDir, { recursive: true })

  const files = glob.sync('**/*.{js,json,map}', { cwd: srcDir })
  for (const file of files) {
    if (file === 'tsconfig.json') continue
    const content = await fs.readFile(path.join(srcDir, file), 'utf8')
    const outputFile = path.join(destDir, file)
    await fs.mkdir(path.dirname(outputFile), { recursive: true })
    await fs.writeFile(
      outputFile,
      content.replace(
        /react-refresh\/runtime/g,
        'next/dist/compiled/react-refresh/runtime'
      )
    )
  }
}

export async function ncc_next_font() {
  const destDir = abs('dist/compiled/@next/font')
  const pkgPath = require.resolve('@next/font/package.json')
  const pkg = await readJson(pkgPath)
  const srcDir = path.dirname(pkgPath)
  await rmrf('dist/compiled/@next/font')
  await fs.mkdir(destDir, { recursive: true })

  const files = glob.sync('{dist,google,local}/**/*.{js,json,d.ts}', {
    cwd: srcDir,
  })
  for (const file of files) {
    const outputFile = path.join(destDir, file)
    await fs.mkdir(path.dirname(outputFile), { recursive: true })
    await fs.cp(path.join(srcDir, file), outputFile)
  }

  await writeJson(path.join(destDir, 'package.json'), {
    name: '@next/font',
    license: pkg.license,
    types: pkg.types,
  })
}

export async function capsize_metrics() {
  const {
    entireMetricsCollection,
  } = require('@capsizecss/metrics/entireMetricsCollection')
  const outputPathDist = abs('dist/server/capsize-font-metrics.json')
  await fs.mkdir(path.dirname(outputPathDist), { recursive: true })
  await writeJson(outputPathDist, entireMetricsCollection, { spaces: 2 })
}

// ---------------------------------------------------------------------------
// Register simple recipes as named exports. Done via a map because `export`
// can't be computed dynamically.
// ---------------------------------------------------------------------------

const simpleRecipeRunners = new Map()
for (const recipe of simpleRecipes) {
  simpleRecipeRunners.set(recipe.name, buildSimpleRunner(recipe))
}

// Named exports for each simple recipe. Keep these in the same order as the
// simpleRecipes table for easier maintenance.
export const ncc_node_html_parser = simpleRecipeRunners.get('ncc_node_html_parser')
export const ncc_vercel_routing_utils = simpleRecipeRunners.get('ncc_vercel_routing_utils')
export const ncc_busboy = simpleRecipeRunners.get('ncc_busboy')
export const ncc_mswjs_interceptors = simpleRecipeRunners.get('ncc_mswjs_interceptors')
export const ncc_node_anser = simpleRecipeRunners.get('ncc_node_anser')
export const ncc_node_stacktrace_parser = simpleRecipeRunners.get('ncc_node_stacktrace_parser')
export const ncc_node_data_uri_to_buffer = simpleRecipeRunners.get('ncc_node_data_uri_to_buffer')
export const ncc_node_cssescape = simpleRecipeRunners.get('ncc_node_cssescape')
export const ncc_node_shell_quote = simpleRecipeRunners.get('ncc_node_shell_quote')
export const ncc_acorn = simpleRecipeRunners.get('ncc_acorn')
export const ncc_napirs_triples = simpleRecipeRunners.get('ncc_napirs_triples')
export const ncc_p_limit = simpleRecipeRunners.get('ncc_p_limit')
export const ncc_p_queue = simpleRecipeRunners.get('ncc_p_queue')
export const ncc_raw_body = simpleRecipeRunners.get('ncc_raw_body')
export const ncc_image_size = simpleRecipeRunners.get('ncc_image_size')
export const ncc_image_detector = simpleRecipeRunners.get('ncc_image_detector')
export const ncc_hapi_accept = simpleRecipeRunners.get('ncc_hapi_accept')
export const ncc_assert = simpleRecipeRunners.get('ncc_assert')
export const ncc_browser_zlib = simpleRecipeRunners.get('ncc_browser_zlib')
export const ncc_buffer = simpleRecipeRunners.get('ncc_buffer')
export const ncc_crypto_browserify = simpleRecipeRunners.get('ncc_crypto_browserify')
export const ncc_domain_browser = simpleRecipeRunners.get('ncc_domain_browser')
export const ncc_events = simpleRecipeRunners.get('ncc_events')
export const ncc_stream_http = simpleRecipeRunners.get('ncc_stream_http')
export const ncc_https_browserify = simpleRecipeRunners.get('ncc_https_browserify')
export const ncc_os_browserify = simpleRecipeRunners.get('ncc_os_browserify')
export const ncc_process = simpleRecipeRunners.get('ncc_process')
export const ncc_querystring_es3 = simpleRecipeRunners.get('ncc_querystring_es3')
export const ncc_string_decoder = simpleRecipeRunners.get('ncc_string_decoder')
export const ncc_util = simpleRecipeRunners.get('ncc_util')
export const ncc_punycode = simpleRecipeRunners.get('ncc_punycode')
export const ncc_set_immediate = simpleRecipeRunners.get('ncc_set_immediate')
export const ncc_tty_browserify = simpleRecipeRunners.get('ncc_tty_browserify')
export const ncc_vm_browserify = simpleRecipeRunners.get('ncc_vm_browserify')
export const ncc_timers_browserify = simpleRecipeRunners.get('ncc_timers_browserify')
export const ncc_async_retry = simpleRecipeRunners.get('ncc_async_retry')
export const ncc_async_sema = simpleRecipeRunners.get('ncc_async_sema')
export const ncc_watchpack = simpleRecipeRunners.get('ncc_watchpack')
export const ncc_bytes = simpleRecipeRunners.get('ncc_bytes')
export const ncc_ci_info = simpleRecipeRunners.get('ncc_ci_info')
export const ncc_cli_select = simpleRecipeRunners.get('ncc_cli_select')
export const ncc_commander = simpleRecipeRunners.get('ncc_commander')
export const ncc_comment_json = simpleRecipeRunners.get('ncc_comment_json')
export const ncc_compression = simpleRecipeRunners.get('ncc_compression')
export const ncc_conf = simpleRecipeRunners.get('ncc_conf')
export const ncc_content_disposition = simpleRecipeRunners.get('ncc_content_disposition')
export const ncc_content_type = simpleRecipeRunners.get('ncc_content_type')
export const ncc_cookie = simpleRecipeRunners.get('ncc_cookie')
export const ncc_cross_spawn = simpleRecipeRunners.get('ncc_cross_spawn')
export const ncc_debug = simpleRecipeRunners.get('ncc_debug')
export const ncc_devalue = simpleRecipeRunners.get('ncc_devalue')
export const ncc_find_up = simpleRecipeRunners.get('ncc_find_up')
export const ncc_fresh = simpleRecipeRunners.get('ncc_fresh')
export const ncc_glob = simpleRecipeRunners.get('ncc_glob')
export const ncc_gzip_size = simpleRecipeRunners.get('ncc_gzip_size')
export const ncc_http_proxy = simpleRecipeRunners.get('ncc_http_proxy')
export const ncc_ignore_loader = simpleRecipeRunners.get('ncc_ignore_loader')
export const ncc_is_animated = simpleRecipeRunners.get('ncc_is_animated')
export const ncc_ipaddr_js = simpleRecipeRunners.get('ncc_ipaddr_js')
export const ncc_is_docker = simpleRecipeRunners.get('ncc_is_docker')
export const ncc_is_wsl = simpleRecipeRunners.get('ncc_is_wsl')
export const ncc_json5 = simpleRecipeRunners.get('ncc_json5')
export const ncc_jsonwebtoken = simpleRecipeRunners.get('ncc_jsonwebtoken')
export const ncc_loader_runner = simpleRecipeRunners.get('ncc_loader_runner')
export const ncc_loader_utils2 = simpleRecipeRunners.get('ncc_loader_utils2')
export const ncc_loader_utils3 = simpleRecipeRunners.get('ncc_loader_utils3')
export const ncc_lodash_curry = simpleRecipeRunners.get('ncc_lodash_curry')
export const ncc_lru_cache = simpleRecipeRunners.get('ncc_lru_cache')
export const ncc_nanoid = simpleRecipeRunners.get('ncc_nanoid')
export const ncc_native_url = simpleRecipeRunners.get('ncc_native_url')
export const ncc_neo_async = simpleRecipeRunners.get('ncc_neo_async')
export const ncc_ora = simpleRecipeRunners.get('ncc_ora')
export const ncc_postcss_flexbugs_fixes = simpleRecipeRunners.get('ncc_postcss_flexbugs_fixes')
export const ncc_postcss_safe_parser = simpleRecipeRunners.get('ncc_postcss_safe_parser')
export const ncc_postcss_preset_env = simpleRecipeRunners.get('ncc_postcss_preset_env')
export const ncc_postcss_scss = simpleRecipeRunners.get('ncc_postcss_scss')
export const ncc_postcss_modules_extract_imports = simpleRecipeRunners.get('ncc_postcss_modules_extract_imports')
export const ncc_postcss_modules_local_by_default = simpleRecipeRunners.get('ncc_postcss_modules_local_by_default')
export const ncc_postcss_modules_scope = simpleRecipeRunners.get('ncc_postcss_modules_scope')
export const ncc_postcss_modules_values = simpleRecipeRunners.get('ncc_postcss_modules_values')
export const ncc_postcss_value_parser = simpleRecipeRunners.get('ncc_postcss_value_parser')
export const ncc_icss_utils = simpleRecipeRunners.get('ncc_icss_utils')
export const ncc_schema_utils2 = simpleRecipeRunners.get('ncc_schema_utils2')
export const ncc_schema_utils3 = simpleRecipeRunners.get('ncc_schema_utils3')
export const ncc_semver = simpleRecipeRunners.get('ncc_semver')
export const ncc_send = simpleRecipeRunners.get('ncc_send')
export const ncc_source_map = simpleRecipeRunners.get('ncc_source_map')
export const ncc_source_map08 = simpleRecipeRunners.get('ncc_source_map08')
export const ncc_serve_handler = simpleRecipeRunners.get('ncc_serve_handler')
export const ncc_string_hash = simpleRecipeRunners.get('ncc_string_hash')
export const ncc_strip_ansi = simpleRecipeRunners.get('ncc_strip_ansi')
export const ncc_vercel_blob = simpleRecipeRunners.get('ncc_vercel_blob')
export const ncc_nft = simpleRecipeRunners.get('ncc_nft')
export const ncc_tar = simpleRecipeRunners.get('ncc_tar')
export const ncc_terser = simpleRecipeRunners.get('ncc_terser')
export const ncc_text_table = simpleRecipeRunners.get('ncc_text_table')
export const ncc_unistore = simpleRecipeRunners.get('ncc_unistore')
export const ncc_superstruct = simpleRecipeRunners.get('ncc_superstruct')
export const ncc_zod = simpleRecipeRunners.get('ncc_zod')
export const ncc_zod_validation_error = simpleRecipeRunners.get('ncc_zod_validation_error')
export const ncc_web_vitals = simpleRecipeRunners.get('ncc_web_vitals')
export const ncc_web_vitals_attribution = simpleRecipeRunners.get('ncc_web_vitals_attribution')
export const ncc_webpack_sources1 = simpleRecipeRunners.get('ncc_webpack_sources1')
export const ncc_webpack_sources3 = simpleRecipeRunners.get('ncc_webpack_sources3')
export const ncc_minimatch = simpleRecipeRunners.get('ncc_minimatch')
export const ncc_ua_parser_js = simpleRecipeRunners.get('ncc_ua_parser_js')
export const ncc_write_file_atomic = simpleRecipeRunners.get('ncc_write_file_atomic')
export const ncc_ws = simpleRecipeRunners.get('ncc_ws')
export const ncc_path_to_regexp = simpleRecipeRunners.get('ncc_path_to_regexp')
export const ncc_opentelemetry_api = simpleRecipeRunners.get('ncc_opentelemetry_api')
export const ncc_http_proxy_agent = simpleRecipeRunners.get('ncc_http_proxy_agent')
export const ncc_https_proxy_agent = simpleRecipeRunners.get('ncc_https_proxy_agent')
export const ncc_safe_stable_stringify = simpleRecipeRunners.get('ncc_safe_stable_stringify')
export const ncc_postcss_plugin_stub_for_cssnano_simple = simpleRecipeRunners.get('ncc_postcss_plugin_stub_for_cssnano_simple')

// ---------------------------------------------------------------------------
// Master task table + main().
// ---------------------------------------------------------------------------

// Order matches the taskfile.js `ncc` task:
//   1) parallel wave of ~120 independent recipes
//   2) ncc_webpack_bundle_packages (after ncc_webpack_bundle5 — actually it
//      runs after the main parallel wave in taskfile.js, but bundle5 is in
//      that wave too. Preserve the taskfile ordering.)
//   3) ncc_babel_bundle_packages (serial, depends on babel packages dir)
//   4) serial wave of recipes that touch source files / share output dirs.

const parallelWave = [
  'ncc_safe_stable_stringify',
  'ncc_node_html_parser',
  'ncc_napirs_triples',
  'ncc_p_limit',
  'ncc_p_queue',
  'ncc_raw_body',
  'ncc_image_size',
  'ncc_image_detector',
  'ncc_hapi_accept',
  'ncc_commander',
  'ncc_node_anser',
  'ncc_node_stacktrace_parser',
  'ncc_node_data_uri_to_buffer',
  'ncc_node_cssescape',
  'ncc_node_shell_quote',
  'ncc_acorn',
  'ncc_async_retry',
  'ncc_async_sema',
  'ncc_postcss_plugin_stub_for_cssnano_simple',
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
  'ncc_find_up',
  'ncc_fresh',
  'ncc_glob',
  'ncc_gzip_size',
  'ncc_http_proxy',
  'ncc_ignore_loader',
  'ncc_is_animated',
  'ncc_ipaddr_js',
  'ncc_is_docker',
  'ncc_is_wsl',
  'ncc_json5',
  'ncc_jsonwebtoken',
  'ncc_loader_runner',
  'ncc_loader_utils2',
  'ncc_loader_utils3',
  'ncc_lodash_curry',
  'ncc_lru_cache',
  'ncc_nanoid',
  'ncc_native_url',
  'ncc_neo_async',
  'ncc_ora',
  'ncc_path_to_regexp',
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
  'ncc_schema_utils2',
  'ncc_schema_utils3',
  'ncc_semver',
  'ncc_send',
  'ncc_source_map',
  'ncc_source_map08',
  'ncc_serve_handler',
  'ncc_string_hash',
  'ncc_strip_ansi',
  'ncc_superstruct',
  'ncc_zod',
  'ncc_zod_validation_error',
  'ncc_vercel_blob',
  'ncc_nft',
  'ncc_tar',
  'ncc_terser',
  'ncc_text_table',
  'ncc_unistore',
  'ncc_watchpack',
  'ncc_web_vitals',
  'ncc_web_vitals_attribution',
  'ncc_webpack_bundle5',
  'ncc_webpack_sources1',
  'ncc_webpack_sources3',
  'ncc_write_file_atomic',
  'ncc_ws',
  'ncc_ua_parser_js',
  'ncc_minimatch',
  'ncc_opentelemetry_api',
  'ncc_http_proxy_agent',
  'ncc_https_proxy_agent',
  'ncc_mini_css_extract_plugin',
]

// These run after the parallel wave; they either depend on earlier outputs
// or mutate shared files (patching source-package code on disk, etc).
const serialWave = [
  'ncc_browserslist',
  'ncc_cssnano_simple_bundle',
  'copy_regenerator_runtime',
  'copy_babel_runtime',
  'copy_vercel_og',
  'copy_constants_browserify',
  'copy_vendor_react',
  'ncc_sass_loader',
  'ncc_jest_worker',
  'ncc_edge_runtime_cookies',
  'ncc_edge_runtime_primitives',
  'ncc_edge_runtime_ponyfill',
  'ncc_edge_runtime',
  'ncc_busboy',
  'ncc_mswjs_interceptors',
  'ncc_rsc_poison_packages',
  'ncc_modelcontextprotocol_sdk',
  'ncc_vercel_routing_utils',
]

// Register non-simple runners so we can look up by name.
const extraRunners = {
  ncc_browserslist,
  ncc_babel_bundle,
  ncc_babel_bundle_packages,
  ncc_cssnano_simple_bundle,
  ncc_webpack_bundle5,
  ncc_webpack_bundle_packages,
  ncc_mini_css_extract_plugin,
  ncc_jest_worker,
  ncc_sass_loader,
  ncc_edge_runtime_cookies,
  ncc_edge_runtime_primitives,
  ncc_edge_runtime_ponyfill,
  ncc_edge_runtime,
  ncc_rsc_poison_packages,
  ncc_modelcontextprotocol_sdk,
  ncc_stream_browserify,
  ncc_path_browserify,
  copy_regenerator_runtime,
  copy_docs,
  copy_skills,
  copy_styled_jsx_assets,
  copy_ncced,
  copy_babel_runtime,
  copy_vercel_og,
  copy_constants_browserify,
  copy_bundle_analyzer_ui,
  copy_vendor_react,
  ncc_react_refresh_utils,
  ncc_next_font,
  capsize_metrics,
}

function getRunner(name) {
  if (simpleRecipeRunners.has(name)) return simpleRecipeRunners.get(name)
  if (name in extraRunners) return extraRunners[name]
  throw new Error(`Unknown ncc task: ${name}`)
}

async function runTask(name) {
  const runner = getRunner(name)
  const t0 = Date.now()
  await runner()
  const elapsed = Date.now() - t0
  console.log(`[ncc] ${name.padEnd(44)} ${elapsed.toString().padStart(6)}ms`)
}

async function runAll() {
  await rmrf('src/compiled')

  // Wave 1: mostly-independent recipes run in parallel.
  await Promise.all(parallelWave.map(runTask))

  // Wave 2: runs after ncc_webpack_bundle5 has produced src/compiled/webpack.
  await runTask('ncc_webpack_bundle_packages')

  // Wave 3: babel packages bundle (reads bundled babel output).
  await runTask('ncc_babel_bundle_packages')

  // Wave 4: ordered recipes that patch source on disk or share output dirs.
  for (const name of serialWave) {
    await runTask(name)
  }
}

async function main() {
  const start = Date.now()
  const args = process.argv.slice(2)
  if (args.length === 0) {
    await runAll()
  } else {
    for (const arg of args) {
      await runTask(arg)
    }
  }
  console.log(`[ncc] TOTAL: ${Date.now() - start}ms`)
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
