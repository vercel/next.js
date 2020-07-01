// eslint-disable-next-line import/no-extraneous-dependencies
import { NodePath } from 'ast-types/lib/node-path'
import { visit } from 'next/dist/compiled/recast'
import { compilation as CompilationType, Compiler } from 'webpack'
import { namedTypes } from 'ast-types'
import { RawSource } from 'webpack-sources'
import {
  getFontDefinitionFromNetwork,
  FontManifest,
} from '../../../next-server/server/font-utils'

interface VisitorMap {
  [key: string]: (path: NodePath) => void
}

export default class FontStylesheetGatheringPlugin {
  compiler?: Compiler
  gatheredStylesheets: Array<string> = []

  private parserHandler = (
    factory: CompilationType.NormalModuleFactory
  ): void => {
    const JS_TYPES = ['auto', 'esm', 'dynamic']
    // Do an extra walk per module and add interested visitors to the walk.
    for (const type of JS_TYPES) {
      factory.hooks.parser
        .for('javascript/' + type)
        .tap(this.constructor.name, (parser) => {
          var that = this
          parser.hooks.program.tap(this.constructor.name, (ast: any) => {
            // We will only optimize fonts from first party code.
            if (parser?.state?.module?.resource.includes('node_modules')) {
              return
            }
            visit(ast, {
              visitCallExpression: function (path) {
                const { node }: { node: namedTypes.CallExpression } = path
                if (!node.arguments || node.arguments.length < 2) {
                  return false
                }
                if (isNodeCreatingLinkElement(node)) {
                  const propsNode = node
                    .arguments[1] as namedTypes.ObjectExpression
                  if (!propsNode.properties) {
                    return false
                  }
                  const props: {
                    [key: string]: string
                  } = propsNode.properties.reduce(
                    (originalProps, prop: any) => {
                      // todo check the type of prop
                      // @ts-ignore
                      originalProps[prop.key.name] = prop.value.value
                      return originalProps
                    },
                    {}
                  )

                  if (
                    !props.rel ||
                    props.rel !== 'stylesheet' ||
                    !props.href ||
                    !props.href.startsWith('https://')
                  ) {
                    return false
                  }
                  that.gatheredStylesheets.push(props.href)
                }
                this.traverse(path)
                return false
              },
            })
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
      compilation.hooks.finishModules.tapAsync(
        this.constructor.name,
        async (_, modulesFinished) => {
          const allContent = this.gatheredStylesheets.map((url) =>
            getFontDefinitionFromNetwork(url)
          )
          let manifestContent: FontManifest = []

          for (let promiseIndex in allContent) {
            manifestContent.push({
              url: this.gatheredStylesheets[promiseIndex],
              content: await allContent[promiseIndex],
            })
          }
          compilation.assets['font-manifest.json'] = new RawSource(
            JSON.stringify(manifestContent, null, '  ')
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
