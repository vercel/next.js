import type { webpack } from 'next/dist/compiled/webpack/webpack'

export type InstrumentationClientLoaderOptions = {
  modules: string[]
}

const NextInstrumentationClientLoader: webpack.LoaderDefinitionFunction<InstrumentationClientLoaderOptions> =
  async function () {
    const { modules } = this.getOptions()

    if (modules.length === 0) {
      return `module.exports = require('private-next-instrumentation-client-user');\n`
    }

    // Resolve each module specifier against the project root so the emitted
    // `require()` calls don't get resolved relative to the stub's location
    // inside `node_modules/next/`. Bare specifiers (npm package names) are
    // resolved against the project's `node_modules`.
    const resolve = this.getResolve()
    const rootContext = this.rootContext
    const resolvedModules = await Promise.all(
      modules.map((spec) => resolve(rootContext, spec))
    )
    const allModules = [
      ...resolvedModules,
      'private-next-instrumentation-client-user',
    ]

    return `module.exports = [${allModules
      .map((spec) => `require(${JSON.stringify(spec)})`)
      .join(',')}];\n`
  }

export default NextInstrumentationClientLoader
