import type { webpack } from 'next/dist/compiled/webpack/webpack'

/**
 * Loader options for `next-instrumentation-client-loader`. The list of inject
 * specifiers is JSON-stringified so it can travel through the loader query
 * string.
 */
export type InstrumentationClientLoaderOptions = {
  /** JSON-stringified `string[]` of module specifiers. */
  injects: string
}

const NextInstrumentationClientLoader: webpack.LoaderDefinitionFunction<InstrumentationClientLoaderOptions> =
  function () {
    const { injects: injectsStringified } = this.getOptions()
    const injects = JSON.parse(injectsStringified || '[]') as string[]

    const requires = injects
      .map((spec) => `require(${JSON.stringify(spec)});`)
      .join('\n')

    return (
      (requires ? requires + '\n' : '') +
      `module.exports = require('private-next-instrumentation-client-user');\n`
    )
  }

export default NextInstrumentationClientLoader
