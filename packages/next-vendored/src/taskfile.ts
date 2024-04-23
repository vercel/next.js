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
