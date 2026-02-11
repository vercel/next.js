import { webpack } from 'next/dist/compiled/webpack/webpack'
import type { NextConfigComplete } from '../../../server/config-shared'
import createDebug from 'next/dist/compiled/debug'

const debug = createDebug('next:deferred-entries-plugin')
const PLUGIN_NAME = 'DeferredEntriesPlugin'

interface DeferredEntriesPluginOptions {
  dev: boolean
  config: NextConfigComplete
  deferredEntrypoints?: webpack.EntryObject
}

/**
 * A webpack plugin that handles deferred entries by:
 * 1. Accepting deferred entrypoints separately from the main config
 * 2. After non-deferred entries are compiled, calling the onBeforeDeferredEntries callback
 * 3. Then adding and compiling the deferred entries within the same compilation
 *
 * This approach avoids module ID conflicts that would occur with separate compilations.
 */
export class DeferredEntriesPlugin {
  private onBeforeDeferredEntries?: () => Promise<void>
  private deferredEntrypoints?: webpack.EntryObject
  private callbackCalled: boolean = false

  constructor(options: DeferredEntriesPluginOptions) {
    this.onBeforeDeferredEntries =
      options.config.experimental.onBeforeDeferredEntries
    this.deferredEntrypoints = options.deferredEntrypoints
  }

  apply(compiler: webpack.Compiler) {
    // Skip if no deferred entrypoints to process
    if (
      !this.deferredEntrypoints ||
      Object.keys(this.deferredEntrypoints).length === 0
    ) {
      return
    }

    // Use finishMake hook to add deferred entries after all initial entries are processed
    // This is the same pattern used by FlightClientEntryPlugin
    compiler.hooks.finishMake.tapPromise(PLUGIN_NAME, async (compilation) => {
      // Only process if we haven't called callback yet
      if (this.callbackCalled) {
        return
      }

      this.callbackCalled = true

      // Call the onBeforeDeferredEntries callback
      if (this.onBeforeDeferredEntries) {
        debug('calling onBeforeDeferredEntries callback')
        await this.onBeforeDeferredEntries()
        debug('onBeforeDeferredEntries callback completed')
      }

      // Add deferred entries to compilation
      const addEntryPromises: Promise<void>[] = []
      const bundler = webpack

      debug('adding deferred entries:', Object.keys(this.deferredEntrypoints!))

      for (const [name, entryData] of Object.entries(
        this.deferredEntrypoints!
      )) {
        debug('processing deferred entry:', name, entryData)
        // Normalize entry data structure
        let entry: {
          import?: string | string[]
          layer?: string
          runtime?: string | false
          dependOn?: string | string[]
        }

        if (typeof entryData === 'string') {
          entry = { import: [entryData] }
        } else if (Array.isArray(entryData)) {
          entry = { import: entryData }
        } else {
          entry = entryData as typeof entry
        }

        // Get imports array
        const imports = entry.import
          ? Array.isArray(entry.import)
            ? entry.import
            : [entry.import]
          : []

        if (imports.length === 0) {
          continue
        }

        // Normalize dependOn to always be an array
        const dependOn = entry.dependOn
          ? Array.isArray(entry.dependOn)
            ? entry.dependOn
            : [entry.dependOn]
          : undefined

        // Create dependencies for all imports
        for (const importPath of imports) {
          if (typeof importPath !== 'string') {
            continue
          }

          const dep = bundler.EntryPlugin.createDependency(importPath, {
            name,
          })

          addEntryPromises.push(
            new Promise((resolve, reject) => {
              compilation.addEntry(
                compiler.context,
                dep,
                {
                  name,
                  layer: entry.layer,
                  runtime: entry.runtime,
                  dependOn,
                },
                (err) => {
                  if (err) {
                    reject(err)
                  } else {
                    resolve()
                  }
                }
              )
            })
          )
        }
      }

      await Promise.all(addEntryPromises)
    })
  }
}
