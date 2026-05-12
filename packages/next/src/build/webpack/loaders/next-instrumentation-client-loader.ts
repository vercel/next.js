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

    // No injects: the alias is a transparent passthrough to the user's
    // `instrumentation-client.{pageExt}` (or the empty module fallback).
    if (injects.length === 0) {
      return `module.exports = require('private-next-instrumentation-client-user');\n`
    }

    injects.push('private-next-instrumentation-client-user')

    // Capture each module's exports so we can compose their
    // `onRouterTransitionStart` hooks. Side effects still run on `require()`,
    // in array order, before the user file is evaluated.
    const lines: string[] = []
    injects.forEach((spec, i) => {
      lines.push(`var mod_${i} = require(${JSON.stringify(spec)});`)
    })

    // Compose a single `onRouterTransitionStart` that fans out to every
    // module's hook (when exported), in array order, with the user file's hook
    // running last.
    const hookCalls = injects
      .map(
        (_, i) =>
          `    mod_${i} && mod_${i}.onRouterTransitionStart && mod_${i}.onRouterTransitionStart(url, type);`
      )
      .join('\n')

    lines.push(
      `module.exports = {`,
      `  onRouterTransitionStart: function (url, type) {`,
      `    ${hookCalls}`,
      `  },`,
      `};`
    )

    return lines.join('\n') + '\n'
  }

export default NextInstrumentationClientLoader
