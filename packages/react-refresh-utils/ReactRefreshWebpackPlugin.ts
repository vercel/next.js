import { Compiler, Template, version } from 'webpack'

function webpack4(compiler: Compiler) {
  // Webpack 4 does not have a method to handle interception of module
  // execution.
  // The closest thing we have to emulating this is mimicking the behavior of
  // `strictModuleExceptionHandling` in `MainTemplate`:
  // https://github.com/webpack/webpack/blob/4c644bf1f7cb067c748a52614500e0e2182b2700/lib/MainTemplate.js#L200

  compiler.hooks.compilation.tap('ReactFreshWebpackPlugin', (compilation) => {
    const hookRequire: typeof compilation['mainTemplate']['hooks']['requireExtensions'] = (compilation
      .mainTemplate.hooks as any).require

    hookRequire.tap('ReactFreshWebpackPlugin', (source, _chunk, _hash) => {
      // Webpack 4 evaluates module code on the following line:
      // ```
      // modules[moduleId].call(module.exports, module, module.exports, hotCreateRequire(moduleId));
      // ```
      // https://github.com/webpack/webpack/blob/4c644bf1f7cb067c748a52614500e0e2182b2700/lib/MainTemplate.js#L200

      const lines = source.split('\n')
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

class ReactFreshWebpackPlugin {
  apply(compiler: Compiler) {
    const webpackMajorVersion = parseInt(version ?? '', 10)

    switch (webpackMajorVersion) {
      case 4: {
        webpack4(compiler)
        break
      }
      default: {
        throw new Error(
          `ReactFreshWebpackPlugin does not support webpack v${webpackMajorVersion}.`
        )
      }
    }
  }
}

export default ReactFreshWebpackPlugin
