import cache from './cache'
// eslint-disable-next-line import/no-extraneous-dependencies
import { RawSourceMap } from 'source-map'
import { Linter, NextLintResult } from './linter'
import { ESLint } from 'eslint'
import { join } from 'path'

const { version } = require('next/package.json')

export default function cacheLoader(
  linter: Linter,
  content: String,
  map?: RawSourceMap
) {
  const stringContent = content.toString()
  const { loaderContext, options } = linter
  const callback = loaderContext.async()
  const cacheIdentifier = JSON.stringify({
    'next-eslint-loader': version,
    eslint: ESLint.version,
  })
  cache({
    cacheDirectory: join(options.distDir, 'cache', 'next-eslint-loader'),
    cacheIdentifier,
    cacheCompression: true,
    options,
    source: content,
    transform() {
      return linter.lint(stringContent)
    },
  })
    .then(({ report, ast }: NextLintResult) => {
      try {
        report && linter.printOutput(report)
      } catch (error) {
        if (callback) {
          // @ts-ignore
          return callback(error, stringContent, map, { sharedBabelAST: ast })
        }
      }
      if (callback) {
        let compilationError = null
        if (report && report?.errorCount > 0) {
          compilationError = new Error(`Build failed due to ESLint errors.`)
        }
        /**
         * We are not sharing the AST right now because they are not compatible
         * with babel transform but this is the plan for near future.
         */
        // return callback(compilationError, stringContent, map, {
        //   sharedBabelAST: ast,
        // })
        return callback(compilationError, stringContent, map)
      }
    })
    .catch((err: any) => {
      // istanbul ignore next
      if (callback) {
        return callback(err)
      }
    })
}
