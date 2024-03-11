import type {
  Compiler as WebpackCompiler,
  Template as WebpackTemplate,
  RuntimeModule as WebpackRuntimeModule,
  RuntimeGlobals as WebpackRuntimeGlobals,
  Compilation as WebpackCompilation,
} from 'webpack'

// Shared between webpack 4 and 5:
function injectRefreshFunctions(
  compilation: WebpackCompilation,
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

function webpack4(this: ReactFreshWebpackPlugin, compiler: WebpackCompiler) {
  const { Template } = this
  // Webpack 4 does not have a method to handle interception of module
  // execution.
  // The closest thing we have to emulating this is mimicking the behavior of
  // `strictModuleExceptionHandling` in `MainTemplate`:
  // https://github.com/webpack/webpack/blob/4c644bf1f7cb067c748a52614500e0e2182b2700/lib/MainTemplate.js#L200

  compiler.hooks.compilation.tap('ReactFreshWebpackPlugin', (compilation) => {
    injectRefreshFunctions(compilation, Template)

    const hookRequire: any = (compilation.mainTemplate.hooks as any).require

    // @ts-ignore webpack 5 types compat
    hookRequire.tap('ReactFreshWebpackPlugin', (source: string) => {
      // Webpack 4 evaluates module code on the following line:
      // ```
      // modules[moduleId].call(module.exports, module, module.exports, hotCreateRequire(moduleId));
      // ```
      // https://github.com/webpack/webpack/blob/4c644bf1f7cb067c748a52614500e0e2182b2700/lib/MainTemplate.js#L200

      const lines = source.split('\n')
      // @ts-ignore webpack 5 types compat
      const evalIndex = lines.findIndex((l) =>
        l.includes('modules[moduleId].call(')
      )
      // Unable to find the module execution, that's OK:
      if (evalIndex === -1) {
        return source
      }

      // Legacy CSS implementations will `eval` browser code in a Node.js
      // context to extract CSS. For backwards compatibility, we need to check
      // we're in a browser context before continuing.
      return Template.asString([
        ...lines.slice(0, evalIndex),
        `
        var hasRefresh = typeof self !== "undefined" && !!self.$RefreshInterceptModuleExecution$;
        var cleanup = hasRefresh
          ? self.$RefreshInterceptModuleExecution$(moduleId)
          : function() {};
        try {
        `,
        lines[evalIndex],
        `
        } finally {
          cleanup();
        }
        `,
        ...lines.slice(evalIndex + 1),
      ])
    })
  })
}

function webpack5(this: ReactFreshWebpackPlugin, compiler: WebpackCompiler) {
  const { RuntimeGlobals, RuntimeModule, Template } = this
  class ReactRefreshRuntimeModule extends RuntimeModule {
    constructor() {
      super('react refresh', 5)
    }

    generate() {
      const { runtimeTemplate } = this.compilation!
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

    compilation.hooks.additionalTreeRuntimeRequirements.tap(
      'ReactFreshWebpackPlugin',
      (chunk: any) => {
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
      case 4: {
        webpack4.call(this, compiler)
        break
      }
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
