// Rspack wrapper. Port of taskfile-webpack.js with a function-based API
// instead of a taskr plugin.

import path from 'node:path'
import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const webpack = require('@rspack/core')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = path.resolve(__dirname, '../..')

/**
 * Run rspack against a config.
 *
 * @param {object} args
 * @param {object} args.config   Rspack configuration object.
 * @param {string} args.name    Human-readable name for logging and stats output.
 * @param {boolean} [args.watch] If true, runs in watch mode and returns the compiler synchronously.
 * @returns {Promise<void> | import('@rspack/core').Compiler}
 */
export function runRspack({ config, name, watch = false }) {
  const compiler = webpack(config)

  if (watch) {
    compiler.watch({}, (err, stats) => {
      if (err || (stats && stats.hasErrors())) {
        console.error(err || stats.toString())
      } else {
        console.log(`${name} compiled successfully.`)
      }
    })
    return compiler
  }

  return new Promise((resolve, reject) => {
    compiler.run(async (err, stats) => {
      if (err || (stats && stats.hasErrors())) {
        reject(new Error(err?.message ?? stats.toString()))
        return
      }

      if (stats.hasWarnings()) {
        console.warn(
          `rspack compiled ${name} with warnings:\n${stats.toString('errors-warnings')}`
        )
      }

      if (process.env.ANALYZE_STATS) {
        try {
          await fs.writeFile(
            path.join(PKG_ROOT, `${name}-stats.json`),
            JSON.stringify(stats.toJson())
          )
        } catch (writeErr) {
          reject(writeErr)
          return
        }
      }

      resolve()
    })
  })
}

export { PKG_ROOT }
