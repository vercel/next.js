import fs from 'fs'
import path from 'path'
// @ts-ignore no types package
import bfj from 'next/dist/compiled/bfj'
import { spans } from './profiling-plugin'
import { webpack } from 'next/dist/compiled/webpack/webpack'
import { tracer, traceAsyncFn } from '../../tracer'

// This plugin creates a stats.json for a build when enabled
export default class BuildStatsPlugin {
  private distDir: string

  constructor(options: { distDir: string }) {
    this.distDir = options.distDir
  }

  apply(compiler: webpack.Compiler) {
    compiler.hooks.done.tapAsync(
      'NextJsBuildStats',
      async (stats, callback) => {
        tracer.withSpan(spans.get(compiler), async () => {
          try {
            const writeStatsSpan = tracer.startSpan('NextJsBuildStats')
            await traceAsyncFn(writeStatsSpan, () => {
              return new Promise((resolve, reject) => {
                const statsJson = stats.toJson({
                  source: false,
                })
                const fileStream = fs.createWriteStream(
                  path.join(this.distDir, 'next-stats.json')
                )
                const jsonStream = bfj.streamify(statsJson)
                jsonStream.pipe(fileStream)
                jsonStream.on('error', reject)
                fileStream.on('error', reject)
                jsonStream.on('dataError', reject)
                fileStream.on('close', resolve)
              })
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
