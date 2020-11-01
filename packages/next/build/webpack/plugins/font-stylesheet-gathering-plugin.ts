import webpack, { compilation as CompilationType, Compiler } from 'webpack'
import { namedTypes } from 'ast-types'
import sources from 'webpack-sources'
import {
  getFontDefinitionFromNetwork,
  FontManifest,
} from '../../../next-server/server/font-utils'
import postcss from 'postcss'
import minifier from 'cssnano-simple'
import { OPTIMIZED_FONT_PROVIDERS } from '../../../next-server/lib/constants'

// @ts-ignore: TODO: remove ignore when webpack 5 is stable
const { RawSource } = webpack.sources || sources

const isWebpack5 = parseInt(webpack.version!) === 5

let BasicEvaluatedExpression: any
if (isWebpack5) {
  BasicEvaluatedExpression = require('webpack/lib/javascript/BasicEvaluatedExpression')
} else {
  BasicEvaluatedExpression = require('webpack/lib/BasicEvaluatedExpression')
}

async function minifyCss(css: string): Promise<string> {
  return new Promise((resolve) =>
    postcss([
      minifier({
        excludeAll: true,
        discardComments: true,
        normalizeWhitespace: { exclude: false },
      }),
    ])
      .process(css, { from: undefined })
      .then((res) => {
        resolve(res.css)
      })
  )
}

export class FontStylesheetGatheringPlugin {
  compiler?: Compiler
  gatheredStylesheets: Array<string> = []
  manifestContent: FontManifest = []

  private parserHandler = (
    factory: CompilationType.NormalModuleFactory
  ): void => {
    const JS_TYPES = ['auto', 'esm', 'dynamic']
    // Do an extra walk per module and add interested visitors to the walk.
    for (const type of JS_TYPES) {
      factory.hooks.parser
        .for('javascript/' + type)
        .tap(this.constructor.name, (parser: any) => {
          /**
           * Webpack fun facts:
           * `parser.hooks.call.for` cannot catch calls for user defined identifiers like `__jsx`
           * it can only detect calls for native objects like `window`, `this`, `eval` etc.
           * In order to be able to catch calls of variables like `__jsx`, first we need to catch them as
           * Identifier and then return `BasicEvaluatedExpression` whose `id` and `type` webpack matches to
           * invoke hook for call.
           * See: https://github.com/webpack/webpack/blob/webpack-4/lib/Parser.js#L1931-L1932.
           */
          parser.hooks.evaluate
            .for('Identifier')
            .tap(this.constructor.name, (node: namedTypes.Identifier) => {
              // We will only optimize fonts from first party code.
              if (parser?.state?.module?.resource.includes('node_modules')) {
                return
              }
              let result
              if (node.name === '__jsx') {
                result = new BasicEvaluatedExpression()
                // @ts-ignore
                result.setRange(node.range)
                result.setExpression(node)
                result.setIdentifier('__jsx')

                // This was added webpack 5.
                if (isWebpack5) {
                  result.getMembers = () => []
                }
              }
              return result
            })

          parser.hooks.call
            .for('__jsx')
            .tap(this.constructor.name, (node: namedTypes.CallExpression) => {
              if (node.arguments.length !== 2) {
                // A font link tag has only two arguments rel=stylesheet and href='...'
                return
              }
              if (!isNodeCreatingLinkElement(node)) {
                return
              }

              // node.arguments[0] is the name of the tag and [1] are the props.
              const propsNode = node.arguments[1] as namedTypes.ObjectExpression
              const props: { [key: string]: string } = {}
              propsNode.properties.forEach((prop) => {
                if (prop.type !== 'Property') {
                  return
                }
                if (
                  prop.key.type === 'Identifier' &&
                  prop.value.type === 'Literal'
                ) {
                  props[prop.key.name] = prop.value.value as string
                }
              })
              if (
                !props.rel ||
                props.rel !== 'stylesheet' ||
                !props.href ||
                !OPTIMIZED_FONT_PROVIDERS.some((url) =>
                  props.href.startsWith(url)
                )
              ) {
                return false
              }

              this.gatheredStylesheets.push(props.href)
            })
        })
    }
  }

  public apply(compiler: Compiler) {
    this.compiler = compiler
    compiler.hooks.normalModuleFactory.tap(
      this.constructor.name,
      this.parserHandler
    )
    compiler.hooks.make.tapAsync(this.constructor.name, (compilation, cb) => {
      // @ts-ignore
      if (compilation.options.output.path.endsWith('serverless')) {
        /**
         * Inline font manifest for serverless case only.
         * For target: server drive the manifest through physical file and less of webpack magic.
         */
        const mainTemplate = compilation.mainTemplate
        mainTemplate.hooks.requireExtensions.tap(
          this.constructor.name,
          (source: string) => {
            return `${source}
                // Font manifest declaration
                ${
                  mainTemplate.requireFn
                }.__NEXT_FONT_MANIFEST__ = ${JSON.stringify(
              this.manifestContent
            )};`
          }
        )
      }
      compilation.hooks.finishModules.tapAsync(
        this.constructor.name,
        async (_: any, modulesFinished: Function) => {
          const fontDefinitionPromises = this.gatheredStylesheets.map((url) =>
            getFontDefinitionFromNetwork(url)
          )

          this.manifestContent = []
          for (let promiseIndex in fontDefinitionPromises) {
            const css = await fontDefinitionPromises[promiseIndex]
            const content = await minifyCss(css)
            this.manifestContent.push({
              url: this.gatheredStylesheets[promiseIndex],
              content,
            })
          }
          if (!isWebpack5) {
            compilation.assets['font-manifest.json'] = new RawSource(
              JSON.stringify(this.manifestContent, null, '  ')
            )
          }
          modulesFinished()
        }
      )
      cb()
    })

    if (isWebpack5) {
      compiler.hooks.make.tap(this.constructor.name, (compilation) => {
        // @ts-ignore TODO: Remove ignore when webpack 5 is stable
        compilation.hooks.processAssets.tap(
          {
            name: this.constructor.name,
            // @ts-ignore TODO: Remove ignore when webpack 5 is stable
            stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
          },
          (assets: any) => {
            assets['font-manifest.json'] = new RawSource(
              JSON.stringify(this.manifestContent, null, '  ')
            )
          }
        )
      })
    }
  }
}

function isNodeCreatingLinkElement(node: namedTypes.CallExpression) {
  const callee = node.callee as namedTypes.Identifier
  if (callee.type !== 'Identifier') {
    return false
  }
  const componentNode = node.arguments[0] as namedTypes.Literal
  if (componentNode.type !== 'Literal') {
    return false
  }
  // Next has pragma: __jsx.
  return callee.name === '__jsx' && componentNode.value === 'link'
}
