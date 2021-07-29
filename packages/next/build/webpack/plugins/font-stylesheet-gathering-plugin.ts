import {
  webpack,
  BasicEvaluatedExpression,
  isWebpack5,
  sources,
} from 'next/dist/compiled/webpack/webpack'
import { namedTypes } from 'ast-types'
import {
  getFontDefinitionFromNetwork,
  FontManifest,
} from '../../../server/font-utils'
import postcss from 'postcss'
import minifier from 'cssnano-simple'
import {
  FONT_MANIFEST,
  OPTIMIZED_FONT_PROVIDERS,
} from '../../../shared/lib/constants'

function minifyCss(css: string): Promise<string> {
  return postcss([
    minifier(
      {
        excludeAll: true,
        discardComments: true,
        normalizeWhitespace: { exclude: false },
      },
      postcss
    ),
  ])
    .process(css, { from: undefined })
    .then((res) => res.css)
}

export class FontStylesheetGatheringPlugin {
  compiler?: webpack.Compiler
  gatheredStylesheets: Array<string> = []
  manifestContent: FontManifest = []
  isLikeServerless: boolean

  constructor({ isLikeServerless }: { isLikeServerless: boolean }) {
    this.isLikeServerless = isLikeServerless
  }

  private parserHandler = (
    factory: webpack.compilation.NormalModuleFactory
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
              if (node.name === '_jsx' || node.name === '__jsx') {
                result = new BasicEvaluatedExpression()
                // @ts-ignore
                result.setRange(node.range)
                result.setExpression(node)
                result.setIdentifier(node.name)

                // This was added webpack 5.
                if (isWebpack5) {
                  result.getMembers = () => []
                }
              }
              return result
            })

          const jsxNodeHandler = (node: namedTypes.CallExpression) => {
            if (node.arguments.length !== 2) {
              // A font link tag has only two arguments rel=stylesheet and href='...'
              return
            }
            if (!isNodeCreatingLinkElement(node)) {
              return
            }

            // node.arguments[0] is the name of the tag and [1] are the props.
            const arg1 = node.arguments[1]

            const propsNode =
              arg1.type === 'ObjectExpression'
                ? (arg1 as namedTypes.ObjectExpression)
                : undefined
            const props: { [key: string]: string } = {}
            if (propsNode) {
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
            }

            if (
              !props.rel ||
              props.rel !== 'stylesheet' ||
              !props.href ||
              !OPTIMIZED_FONT_PROVIDERS.some(({ url }) =>
                props.href.startsWith(url)
              )
            ) {
              return false
            }

            this.gatheredStylesheets.push(props.href)

            if (isWebpack5) {
              const buildInfo = parser?.state?.module?.buildInfo

              if (buildInfo) {
                buildInfo.valueDependencies.set(
                  FONT_MANIFEST,
                  this.gatheredStylesheets
                )
              }
            }
          }

          // React JSX transform:
          parser.hooks.call
            .for('_jsx')
            .tap(this.constructor.name, jsxNodeHandler)
          // Next.js JSX transform:
          parser.hooks.call
            .for('__jsx')
            .tap(this.constructor.name, jsxNodeHandler)
          // New React JSX transform:
          parser.hooks.call
            .for('imported var')
            .tap(this.constructor.name, jsxNodeHandler)
        })
    }
  }

  public apply(compiler: webpack.Compiler) {
    this.compiler = compiler
    compiler.hooks.normalModuleFactory.tap(
      this.constructor.name,
      this.parserHandler
    )
    compiler.hooks.make.tapAsync(this.constructor.name, (compilation, cb) => {
      if (this.isLikeServerless) {
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
                  isWebpack5 ? '__webpack_require__' : mainTemplate.requireFn
                }.__NEXT_FONT_MANIFEST__ = ${JSON.stringify(
              this.manifestContent
            )};
            // Enable feature:
            process.env.__NEXT_OPTIMIZE_FONTS = JSON.stringify(true);`
          }
        )
      }
      compilation.hooks.finishModules.tapAsync(
        this.constructor.name,
        async (modules: any, modulesFinished: Function) => {
          let fontStylesheets = this.gatheredStylesheets

          if (isWebpack5) {
            const fontUrls = new Set<string>()
            modules.forEach((module: any) => {
              const fontDependencies = module?.buildInfo?.valueDependencies?.get(
                FONT_MANIFEST
              )
              if (fontDependencies) {
                fontDependencies.forEach((v: string) => fontUrls.add(v))
              }
            })

            fontStylesheets = Array.from(fontUrls)
          }

          const fontDefinitionPromises = fontStylesheets.map((url) =>
            getFontDefinitionFromNetwork(url)
          )

          this.manifestContent = []
          for (let promiseIndex in fontDefinitionPromises) {
            const css = await fontDefinitionPromises[promiseIndex]

            if (css) {
              const content = await minifyCss(css)
              this.manifestContent.push({
                url: fontStylesheets[promiseIndex],
                content,
              })
            }
          }
          if (!isWebpack5) {
            compilation.assets[FONT_MANIFEST] = new sources.RawSource(
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
            assets['../' + FONT_MANIFEST] = new sources.RawSource(
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
  // React has pragma: _jsx.
  // Next has pragma: __jsx.
  return (
    (callee.name === '_jsx' || callee.name === '__jsx') &&
    componentNode.value === 'link'
  )
}
