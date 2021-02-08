// @ts-ignore
import getOptions from './eslint-loader/get-options'
import cacheLoader from './eslint-loader/cache-loader'
import { loader } from 'webpack'
// eslint-disable-next-line import/no-extraneous-dependencies
import { RawSourceMap } from 'source-map'
import { Linter } from './eslint-loader/linter'

import { tracer, traceFn } from '../../tracer'

const fn: loader.Loader = function (
  content: string | Buffer,
  map?: RawSourceMap
) {
  const span = tracer.startSpan('eslint-loader')
  return traceFn(span, () => {
    const options = traceFn(tracer.startSpan('get-options'), () =>
      getOptions(this)
    )

    let compilationError = null

    span.setAttribute('filename', this.resourcePath)

    const linter = traceFn(
      tracer.startSpan('lint-instantiation'),
      () =>
        new Linter(this, {
          ...options,
          cwd: this._compiler.options.context,
        })
    )

    this.cacheable()

    // return early if cached
    if (options.cache) {
      traceFn(tracer.startSpan('cache-loader'), () =>
        cacheLoader(linter, content.toString(), map)
      )
      return
    }

    const report = traceFn(tracer.startSpan('lint'), () => linter.lint(content))
    report &&
      traceFn(tracer.startSpan('print-output'), () =>
        linter.printOutput(report)
      )

    // Do not fail build during dev due to lint errors.
    if (!options.dev && report && report?.errorCount > 0) {
      compilationError = new Error(`Build failed due to ESLint errors.`)
    }

    // this.callback(compilationError, content, map, { sharedBabelAST: ast })
    return this.callback(compilationError, content, map)
  })
}

export default fn
