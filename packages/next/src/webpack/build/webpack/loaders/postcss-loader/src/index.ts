import Warning from './Warning'
import SyntaxError from './Error'
import { normalizeSourceMap, normalizeSourceMapAfterPostcss } from './utils'

/**
 * **PostCSS Loader**
 *
 * Loads && processes CSS with [PostCSS](https://github.com/postcss/postcss)
 */
export default async function loader(
  this: any,
  /** Source */
  content: string,
  /** Source Map */
  sourceMap: any,
  meta: any
): Promise<void> {
  const loaderSpan = this.currentTraceSpan.traceChild('postcss-loader')
  const callback = this.async()

  loaderSpan
    .traceAsyncFn(async () => {
      const options = this.getOptions()
      const file = this.resourcePath

      const useSourceMap =
        typeof options.sourceMap !== 'undefined'
          ? options.sourceMap
          : this.sourceMap

      const processOptions: any = {
        from: file,
        to: file,
      }

      if (useSourceMap) {
        processOptions.map = {
          inline: false,
          annotation: false,
          ...processOptions.map,
        }
      }

      if (sourceMap && processOptions.map) {
        processOptions.map.prev = loaderSpan
          .traceChild('normalize-source-map')
          .traceFn(() => normalizeSourceMap(sourceMap, this.context))
      }

      let root: any

      // Reuse PostCSS AST from other loaders
      if (meta && meta.ast && meta.ast.type === 'postcss') {
        ;({ root } = meta.ast)
        loaderSpan.setAttribute('astUsed', 'true')
      }

      // Initializes postcss with plugins
      const { postcssWithPlugins } = await options.postcss()

      let result

      try {
        result = await loaderSpan
          .traceChild('postcss-process')
          .traceAsyncFn(() =>
            postcssWithPlugins.process(root || content, processOptions)
          )
      } catch (error: any) {
        if (error.file) {
          this.addDependency(error.file)
        }

        if (error.name === 'CssSyntaxError') {
          throw new SyntaxError(error)
        }

        throw error
      }

      for (const warning of result.warnings()) {
        this.emitWarning(new Warning(warning))
      }

      for (const message of result.messages) {
        // eslint-disable-next-line default-case
        switch (message.type) {
          case 'dependency':
            this.addDependency(message.file)
            break
          case 'build-dependency':
            this.addBuildDependency(message.file)
            break
          case 'missing-dependency':
            this.addMissingDependency(message.file)
            break
          case 'context-dependency':
            this.addContextDependency(message.file)
            break
          case 'dir-dependency':
            this.addContextDependency(message.dir)
            break
          case 'asset':
            if (message.content && message.file) {
              this.emitFile(
                message.file,
                message.content,
                message.sourceMap,
                message.info
              )
            }
        }
      }

      let map = result.map ? result.map.toJSON() : undefined

      if (map && useSourceMap) {
        map = normalizeSourceMapAfterPostcss(map, this.context)
      }

      const ast = {
        type: 'postcss',
        version: result.processor.version,
        root: result.root,
      }

      return [result.css, map, { ast }]
    })
    .then(
      ([css, map, { ast }]: any) => {
        callback?.(null, css, map, { ast })
      },
      (err: Error) => {
        callback?.(err)
      }
    )
}
