import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { Task } from './custom-task.js'
import type { Tasks, QueueFn } from './task.js'
import { resolveCommonjs } from './resolve.cjs'

export { Task }

const resolve = (modulePath: string) =>
  fileURLToPath(import.meta.resolve(modulePath))

const externals: Record<string, string> = {
  // don't bundle caniuse-lite data so users can
  // update it manually
  'caniuse-lite': 'caniuse-lite',
  '/caniuse-lite(/.*)/': 'caniuse-lite$1',

  'node-fetch': 'node-fetch',
  postcss: 'postcss',
  // Ensure latest version is used
  'postcss-safe-parser': 'next/dist/compiled/postcss-safe-parser',

  // sass-loader
  // (also responsible for these dependencies in package.json)
  'node-sass': 'node-sass',
  sass: 'sass',
  fibers: 'fibers',

  chokidar: 'chokidar',
  'jest-worker': 'jest-worker',

  'terser-webpack-plugin':
    'next/dist/build/webpack/plugins/terser-webpack-plugin/src',

  // TODO: Add @swc/helpers to externals once @vercel/ncc switch to swc-loader
}

export const tasks: Tasks<Task> = {}

const nccTasks: Record<
  string,
  | string
  | {
      mod: string
      modPath?: string
      cjs?: boolean
      browserOnly?: boolean
      use?: QueueFn
    }
> = {
  ncc_node_html_parser: 'node-html-parser',
  ncc_napirs_triples: '@napi-rs/triples',
  ncc_p_limit: 'p-limit',
  ncc_raw_body: 'raw-body',
  ncc_image_size: 'image-size',
  ncc_get_orientation: 'get-orientation',
  ncc_hapi_accept: '@hapi/accept',
  ncc_commander: { mod: 'commander', cjs: true },
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
  ncc_acorn: 'acorn', // TODO: Not being used by next?
  ncc_amphtml_validator: 'amphtml-validator',
  ncc_async_retry: 'async-retry',
  ncc_async_sema: 'async-sema',
  // TODO: This one goes to next/src
  // ncc_postcss_plugin_stub_for_cssnano_simple: '',
  // These are Node.js browser polyfills
  ncc_assert: { mod: 'assert/', cjs: true, browserOnly: true },
  ncc_browser_zlib: { mod: 'browserify-zlib', cjs: true, browserOnly: true },
  ncc_buffer: { mod: 'buffer/', cjs: true, browserOnly: true },
  ncc_crypto_browserify: {
    mod: 'crypto-browserify',
    cjs: true,
    browserOnly: true,
  },
  ncc_domain_browser: { mod: 'domain-browser', cjs: true, browserOnly: true },
  ncc_events: { mod: 'events/', cjs: true, browserOnly: true },
  ncc_stream_browserify: {
    mod: 'stream-browserify',
    cjs: true,
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
  ncc_stream_http: { mod: 'stream-http', cjs: true, browserOnly: true },
  ncc_https_browserify: {
    mod: 'https-browserify',
    cjs: true,
    browserOnly: true,
  },
  ncc_os_browserify: {
    mod: 'os-browserify',
    modPath: 'os-browserify/browser',
    cjs: true,
    browserOnly: true,
  },
  ncc_path_browserify: {
    mod: 'path-browserify',
    cjs: true,
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
}

for (let [taskName, modOptions] of Object.entries(nccTasks)) {
  if (typeof modOptions === 'string') {
    modOptions = { mod: modOptions }
  }
  const { mod, modPath = mod, cjs, browserOnly, use } = modOptions

  if (!browserOnly) {
    externals[mod] = `@next/vendored/${mod}`
  }
  tasks[taskName] = async (task) => {
    await task.clear(mod)
    task.source(cjs ? resolveCommonjs(modPath) : resolve(modPath)).ncc({
      packageName: mod,
      externals,
      ...(browserOnly
        ? {
            mainFields: ['browser', 'main'],
            target: 'es5',
          }
        : {}),
    })
    if (use) task.use(use)
    await task.target(mod)
  }
}

export async function copy_regenerator_runtime(task: Task) {
  await task.clear('regenerator-runtime')
  await task
    .source(join(dirname(resolve('regenerator-runtime')), '**/*'))
    .target('regenerator-runtime')
}

export async function ncc(task: Task) {
  await task.parallel(Object.keys(nccTasks))
  await task.serial(['copy_regenerator_runtime'])
}
