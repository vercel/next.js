import { promisify } from 'util'
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
    const callback = this.async()
    const { injects: injectsStringified } = this.getOptions()
    const injects = JSON.parse(injectsStringified || '[]') as string[]

    // No injects: the alias is a transparent passthrough to the user's
    // `instrumentation-client.{pageExt}` (or the empty module fallback).
    if (injects.length === 0) {
      callback(
        null,
        `module.exports = require('private-next-instrumentation-client-user');\n`
      )
      return
    }

    // Resolve each inject specifier against the project root so the emitted
    // `require()` calls don't get resolved relative to the stub's location
    // inside `node_modules/next/`. Bare specifiers (npm package names) are
    // resolved against the project's `node_modules`.
    const resolve = promisify(this.resolve)
    const rootContext = this.rootContext

    Promise.all(injects.map((spec) => resolve(rootContext, spec)))
      .then((resolvedInjects) => {
        const allModules = [
          ...resolvedInjects,
          'private-next-instrumentation-client-user',
        ]

        const lines: string[] = []
        allModules.forEach((spec, i) => {
          lines.push(`var mod_${i} = require(${JSON.stringify(spec)});`)
        })

        // Compose a single `onRouterTransitionStart` that fans out to every
        // module's hook (when exported), in array order, with the user file's
        // hook running last.
        const hookCalls = allModules
          .map(
            // Webpack doesn't transpile this, so use a manual version of optional chaining.
            (_, i) =>
              `    mod_${i} && mod_${i}.onRouterTransitionStart && mod_${i}.onRouterTransitionStart(url, type);`
          )
          .join('\n')

        lines.push(
          `module.exports = {`,
          `  onRouterTransitionStart: function (url, type) {`,
          hookCalls,
          `  },`,
          `};`
        )

        callback(null, lines.join('\n') + '\n')
      })
      .catch((err) => callback(err))
  }

export default NextInstrumentationClientLoader
