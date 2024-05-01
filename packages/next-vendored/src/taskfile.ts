import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { Task } from './custom-task.js'
import type { Tasks } from './task.js'

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

const nccTasks = {
  ncc_node_html_parser: 'node-html-parser',
  ncc_napirs_triples: '@napi-rs/triples',
  ncc_p_limit: 'p-limit',
  ncc_raw_body: 'raw-body',
  ncc_image_size: 'image-size',
  ncc_get_orientation: 'get-orientation',
  ncc_hapi_accept: '@hapi/accept',
  ncc_commander: 'commander',
  ncc_node_fetch: 'node-fetch',
  ncc_node_anser: 'anser',
  ncc_node_stacktrace_parser: 'stacktrace-parser',
  ncc_node_data_uri_to_buffer: 'data-uri-to-buffer',
  ncc_node_cssescape: 'css.escape',
  ncc_node_platform: 'platform', // TODO: This one has additional logic
  ncc_node_shell_quote: 'shell-quote',
  ncc_acorn: 'acorn', // TODO: Not being used by next?
  ncc_amphtml_validator: 'amphtml-validator',
  ncc_async_retry: 'async-retry',
  ncc_async_sema: 'async-sema',
  // TODO: This one goes to next/src
  // ncc_postcss_plugin_stub_for_cssnano_simple: '',
  // TODO: These use `mainFields`
  // ncc_assert: '',
  // ncc_browser_zlib: '',
  // ncc_buffer: '',
  // ncc_crypto_browserify: '',
  // ncc_domain_browser: '',
  // ncc_events: '',
  // ncc_stream_browserify: '',
  // ncc_stream_http: '',
  // ncc_https_browserify: '',
  // ncc_os_browserify: '',
  // ncc_path_browserify: '',
}

for (const [taskName, moduleName] of Object.entries(nccTasks)) {
  externals[moduleName] = `@next/vendored/${moduleName}`
  tasks[taskName] = async (task) => {
    await task.clear(moduleName)
    await task
      .source(resolve(moduleName))
      .ncc({
        packageName: moduleName,
        externals,
      })
      .target(moduleName)
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
