import type { webpack } from 'next/dist/compiled/webpack/webpack'

export type InstrumentationInjectLoaderOptions = {
  modules: string[]
}

// Keep in sync with `instrumentation_source` in crates/next-api/src/project.rs.
const NextInstrumentationInjectLoader: webpack.LoaderDefinitionFunction<InstrumentationInjectLoaderOptions> =
  function () {
    const { modules } = this.getOptions()

    // Keep package requests intact so webpack's externals handler can apply
    // serverExternalPackages and the built-in opt-out list. The webpack config
    // sets this module's context to the project root before module creation.
    // The project's own `instrumentation` file runs last, or an empty module
    // when there is none (see `create-compiler-aliases.ts`).
    const allModules = [...modules, 'private-next-instrumentation-user']

    return (
      `const { combineInstrumentation } = require('next/dist/lib/combine-instrumentation');\n` +
      `module.exports = combineInstrumentation([${allModules
        .map((spec) => `require(${JSON.stringify(spec)})`)
        .join(', ')}]);\n`
    )
  }

export default NextInstrumentationInjectLoader
