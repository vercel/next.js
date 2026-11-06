import {
  createLocalSpan,
  traceLocalSpan,
} from '../../../../../server/lib/trace/local-span-recorder'
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
  const loaderSpan = createLocalSpan({
    name: 'postcss-loader',
    parent: this.currentTraceSpan,
  })
  const callback = this.async()

  traceLocalSpan({ span: loaderSpan }, async () => {
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
      processOptions.map.prev = traceLocalSpan(
        {
          name: 'normalize-source-map',
          parent: loaderSpan,
          synchronous: true,
        },
        () => normalizeSourceMap(sourceMap, this.context)
      )
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
      result = await traceLocalSpan(
        { name: 'postcss-process', parent: loaderSpan },
        () => postcssWithPlugins.process(root || content, processOptions)
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
          break
        default:
          break
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
  }).then(
    ([css, map, { ast }]: any) => {
      callback?.(null, css, map, { ast })
    },
    (err: Error) => {
      callback?.(err)
    }
  )
}
