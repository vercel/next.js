import cache from './cache'
import { readdirSync } from 'fs'

// eslint-disable-next-line import/no-extraneous-dependencies
import { RawSourceMap } from 'source-map'
import { Linter } from './linter'
import { CLIEngine } from 'eslint'
import { join } from 'path'

const objectHash = require('object-hash')
const { version } = require('next/package.json')

export default function cacheLoader(
  linter: Linter,
  content: String,
  map?: RawSourceMap
) {
  const stringContent = content.toString()
  const { loaderContext, options } = linter
  const callback = loaderContext.async()

  const dirFiles = readdirSync(options.dir)
  const eslintrc = dirFiles.find((file) =>
    /^.eslintrc.?(js|json|yaml|yml)?$/.test(file)
  )

  let cacheIdentifier
  if (eslintrc) {
    cacheIdentifier = objectHash(require(join(options.dir, eslintrc)))
  } else {
    // Original cache identifier does not bust cache when .eslintrc changes. See: https://github.com/webpack-contrib/eslint-loader/issues/214
    cacheIdentifier = JSON.stringify({
      'next-eslint-loader': version,
      eslint: CLIEngine.version,
    })
  }

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
    .then((report: CLIEngine.LintReport) => {
      try {
        report && linter.printOutput(report)
      } catch (error) {
        if (callback) {
          // TODO: enable the following AST sharing in future.
          // return callback(error, stringContent, map, { sharedBabelAST: ast })
          return callback(error, stringContent, map)
        }
      }
      if (callback) {
        let compilationError = null
        // Do not fail build during dev due to lint errors.
        if (!options.dev && report && report?.errorCount > 0) {
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
