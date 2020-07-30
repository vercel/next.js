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
import {
  FONT_MANIFEST,
  OPTIMIZED_FONT_PROVIDERS,
} from '../../../next-server/lib/constants'

const NormalModule = require('webpack/lib/NormalModule')
const JsonParser = require('webpack/lib/JsonParser')
const JsonGenerator = require('webpack/lib/JsonGenerator')

interface VisitorMap {
  [key: string]: (path: NodePath) => void
}

export class FontStylesheetGatheringPlugin {
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

  private getFontManifestPath(compilation: CompilationType.Compilation) {
    /// @ts-ignore
    return `${compilation.options.output.path}/${FONT_MANIFEST}`
  }

  /**
   * Creates a fake JSON module for serverless case.
   * This is used because at the time of next-serverless compilation the font-manifest is not available on disk.
   */
  private createFakeModule(compilation: CompilationType.Compilation) {
    const filePath = this.getFontManifestPath(compilation)
    return new NormalModule({
      type: 'json',
      parser: new JsonParser({}),
      generator: new JsonGenerator(),
      loaders: [],
      rawRequest: 'private-dot-next/serverless/font-manifest.json',
      request: filePath,
      userRequest: filePath,
      resource: filePath,
    })
  }

  private buildFakeModule(
    fakeJSONModule: any,
    compilation: CompilationType.Compilation,
    moduleContent: string
  ) {
    /**
     * Pathching the file system because it will try to look for
     * the file on disk as soon as we request a "build" for the module.
     * Note: We cannot just patch the filesystem in the very beginning
     * and supply a dummy response because we dont have the response at the beginning.
     */
    const fs = compilation.inputFileSystem
    const readFile = fs.readFile.bind(fs)
    /// @ts-ignore
    fs.readFile = (path, callback) => {
      console.log({ path })
      if (path === fakeJSONModule.resource) {
        return callback(undefined, moduleContent)
      }
      readFile(path, callback)
    }

    /**
     * Start build for the module
     */
    fakeJSONModule.build(
      {},
      compilation,
      compilation.resolverFactory.get(),
      fs,
      () => {
        /// @ts-ignore
        compilation.addModule(fakeJSONModule)
        const pageModules = compilation.modules.filter(
          (module) =>
            module.rawRequest &&
            module.rawRequest.startsWith('next-serverless-loader?page=')
        )

        /**
         * This fake module needs to be added as a dependency
         * module of all the serverless page modules.
         */
        pageModules.forEach((pageModule) => {
          // The dependency is already created just the module is null.
          pageModule.dependencies.find(
            (module: any) =>
              module.request &&
              module.request ===
                'private-dot-next/serverless/font-manifest.json'
          ).module = fakeJSONModule
        })
      }
    )
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
        async (_: any, modulesFinished: Function) => {
          const fontDefinitionPromises = this.gatheredStylesheets.map((url) =>
            getFontDefinitionFromNetwork(url)
          )
          let manifestContent: FontManifest = []

          for (let promiseIndex in fontDefinitionPromises) {
            manifestContent.push({
              url: this.gatheredStylesheets[promiseIndex],
              content: await fontDefinitionPromises[promiseIndex],
            })
          }
          compilation.assets['font-manifest.json'] = new RawSource(
            JSON.stringify(manifestContent, null, '  ')
          )

          /// @ts-ignore
          if (!compilation.findModule(this.getFontManifestPath(compilation))) {
            const fakeJSONModule = this.createFakeModule(compilation)
            this.buildFakeModule(
              fakeJSONModule,
              compilation,
              JSON.stringify(manifestContent, null, '  ')
            )
          }
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
