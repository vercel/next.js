import type { webpack } from 'next/dist/compiled/webpack/webpack'

export type InstrumentationInjectLoaderOptions = {
  modules: string[]
}

// Keep in sync with `instrumentation_source` in crates/next-api/src/project.rs.
const NextInstrumentationInjectLoader: webpack.LoaderDefinitionFunction<InstrumentationInjectLoaderOptions> =
  async function () {
    const { modules } = this.getOptions()

    // Resolve against the project root, not this stub inside `next/dist`.
    const resolve = this.getResolve()
    const rootContext = this.rootContext
    const resolvedModules = await Promise.all(
      modules.map((spec) => resolve(rootContext, spec))
    )

    return (
      `const { combineInstrumentation } = require('next/dist/lib/combine-instrumentation');\n` +
      `module.exports = combineInstrumentation([${resolvedModules
        .map((spec) => `require(${JSON.stringify(spec)})`)
        .join(', ')}]);\n`
    )
  }

export default NextInstrumentationInjectLoader
