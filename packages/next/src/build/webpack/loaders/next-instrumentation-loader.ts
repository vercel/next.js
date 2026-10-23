import type { webpack } from 'next/dist/compiled/webpack/webpack'

export type InstrumentationLoaderOptions = {
  modules: string[]
}

const nextInstrumentationLoader: webpack.LoaderDefinitionFunction<InstrumentationLoaderOptions> =
  async function () {
    const { modules } = this.getOptions()
    const resolve = this.getResolve()
    // Resolve plugin modules from the project, not from Next's loader directory.
    const resolved = await Promise.all(
      modules.map((spec) => resolve(this.rootContext, spec))
    )
    if (this.resourcePath !== require.resolve('./instrumentation-stub')) {
      resolved.push(this.resourcePath)
    }
    return `module.exports = require(${JSON.stringify(
      require.resolve('../../../server/instrumentation/compose')
    )}).createInstrumentation([${resolved
      .map((spec) => `require(${JSON.stringify(spec)})`)
      .join(',')}]);\n`
  }

export default nextInstrumentationLoader
