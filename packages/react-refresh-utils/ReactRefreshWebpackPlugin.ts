// types only import
import type {
  Compiler as WebpackCompiler,
  Template as WebpackTemplate,
  // @ts-ignore exists in webpack 5
  RuntimeModule as WebpackRuntimeModule,
  // @ts-ignore exists in webpack 5
  RuntimeGlobals as WebpackRuntimeGlobals,
  // @ts-ignore exists in webpack 5
  compilation as WebpackCompilation,
} from 'webpack'

// Shared between webpack 4 and 5:
function injectRefreshFunctions(
  compilation: WebpackCompilation.Compilation,
  Template: typeof WebpackTemplate
) {
  const hookVars: any = (compilation.mainTemplate.hooks as any).localVars

  hookVars.tap('ReactFreshWebpackPlugin', (source: string) =>
    Template.asString([
      source,
      '',
      '// noop fns to prevent runtime errors during initialization',
      'if (typeof self !== "undefined") {',
      Template.indent('self.$RefreshReg$ = function () {};'),
      Template.indent('self.$RefreshSig$ = function () {'),
      Template.indent(Template.indent('return function (type) {')),
      Template.indent(Template.indent(Template.indent('return type;'))),
      Template.indent(Template.indent('};')),
      Template.indent('};'),
      '}',
    ])
  )
}

function webpack5(this: ReactFreshWebpackPlugin, compiler: WebpackCompiler) {
  const { RuntimeGlobals, RuntimeModule, Template } = this
  class ReactRefreshRuntimeModule extends RuntimeModule {
    constructor() {
      super('react refresh', 5)
    }

    generate() {
      // @ts-ignore This exists in webpack 5
      const { runtimeTemplate } = this.compilation
      return Template.asString([
        `if (${RuntimeGlobals.interceptModuleExecution}) {`,
        `${
          RuntimeGlobals.interceptModuleExecution
        }.push(${runtimeTemplate.basicFunction('options', [
          `${
            runtimeTemplate.supportsConst() ? 'const' : 'var'
          } originalFactory = options.factory;`,
          `options.factory = ${runtimeTemplate.basicFunction(
            'moduleObject, moduleExports, webpackRequire',
            [
              // Legacy CSS implementations will `eval` browser code in a Node.js
              // context to extract CSS. For backwards compatibility, we need to check
              // we're in a browser context before continuing.
              `${
                runtimeTemplate.supportsConst() ? 'const' : 'var'
              } hasRefresh = typeof self !== "undefined" && !!self.$RefreshInterceptModuleExecution$;`,
              `${
                runtimeTemplate.supportsConst() ? 'const' : 'var'
              } cleanup = hasRefresh ? self.$RefreshInterceptModuleExecution$(moduleObject.id) : ${
                runtimeTemplate.supportsArrowFunction()
                  ? '() => {}'
                  : 'function() {}'
              };`,
              'try {',
              Template.indent(
                'originalFactory.call(this, moduleObject, moduleExports, webpackRequire);'
              ),
              '} finally {',
              Template.indent(`cleanup();`),
              '}',
            ]
          )}`,
        ])})`,
        '}',
      ])
    }
  }

  // @ts-ignore webpack 5 types compat
  compiler.hooks.compilation.tap('ReactFreshWebpackPlugin', (compilation) => {
    injectRefreshFunctions(compilation, Template)

    // @ts-ignore Exists in webpack 5
    compilation.hooks.additionalTreeRuntimeRequirements.tap(
      'ReactFreshWebpackPlugin',
      (chunk: any) => {
        // @ts-ignore Exists in webpack 5
        compilation.addRuntimeModule(chunk, new ReactRefreshRuntimeModule())
      }
    )
  })
}

class ReactFreshWebpackPlugin {
  webpackMajorVersion: number
  // @ts-ignore exists in webpack 5
  RuntimeGlobals: typeof WebpackRuntimeGlobals
  // @ts-ignore exists in webpack 5
  RuntimeModule: typeof WebpackRuntimeModule
  Template: typeof WebpackTemplate
  constructor(
    { version, RuntimeGlobals, RuntimeModule, Template } = require('webpack')
  ) {
    this.webpackMajorVersion = parseInt(version ?? '', 10)
    this.RuntimeGlobals = RuntimeGlobals
    this.RuntimeModule = RuntimeModule
    this.Template = Template
  }
  apply(compiler: WebpackCompiler) {
    switch (this.webpackMajorVersion) {
      case 5: {
        webpack5.call(this, compiler)
        break
      }
      default: {
        throw new Error(
          `ReactFreshWebpackPlugin does not support webpack v${this.webpackMajorVersion}.`
        )
      }
    }
  }
}

export default ReactFreshWebpackPlugin
