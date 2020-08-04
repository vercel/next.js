// eslint-disable-next-line import/no-extraneous-dependencies
import { NodePath } from 'ast-types/lib/node-path'
import { compilation as CompilationType, Compiler } from 'webpack'
import { namedTypes } from 'ast-types'
import { RawSource } from 'webpack-sources'
import {
  getFontDefinitionFromNetwork,
  FontManifest,
} from '../../../next-server/server/font-utils'
// @ts-ignore
import BasicEvaluatedExpression from 'webpack/lib/BasicEvaluatedExpression'
import { OPTIMIZED_FONT_PROVIDERS } from '../../../next-server/lib/constants'

interface VisitorMap {
  [key: string]: (path: NodePath) => void
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
              return node.name === '__jsx'
                ? new BasicEvaluatedExpression()
                    //@ts-ignore
                    .setRange(node.range)
                    .setExpression(node)
                    .setIdentifier('__jsx')
                : undefined
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
            this.manifestContent.push({
              url: this.gatheredStylesheets[promiseIndex],
              content: await fontDefinitionPromises[promiseIndex],
            })
          }
          compilation.assets['font-manifest.json'] = new RawSource(
            JSON.stringify(this.manifestContent, null, '  ')
          )
          modulesFinished()
        }
      )
      cb()
    })
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
