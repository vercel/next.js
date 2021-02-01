import fs from 'fs'
import path from 'path'
import { spans } from './profiling-plugin'
import { webpack } from 'next/dist/compiled/webpack/webpack'
import { tracer, traceFn, traceAsyncFn } from '../../tracer'

// This plugin creates a stats.json for a build when enabled
export default class BuildStatsPlugin {
  private distDir: string

  constructor(options: { distDir: string }) {
    this.distDir = options.distDir
  }

  apply(compiler: webpack.Compiler) {
    compiler.hooks.done.tapAsync(
      'NextJsBuildStats',
      async (compilation, callback) => {
        tracer.withSpan(spans.get(compiler), async () => {
          try {
            const statsSpan = tracer.startSpan('NextJsBuildStats-stats-toJSON')

            const statsString = traceFn(statsSpan, () => {
              return JSON.stringify(compilation.toJson())
            })
            const writeStatsSpan = tracer.startSpan(
              'NextJsBuildStats-stats-writeStats'
            )

            await traceAsyncFn(writeStatsSpan, () => {
              return fs.promises.writeFile(
                path.join(this.distDir, 'next-stats.json'),
                statsString
              )
            })
            callback()
          } catch (err) {
            callback(err)
          }
        })
      }
    )
  }
}
