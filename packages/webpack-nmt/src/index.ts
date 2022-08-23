import { spawnSync } from 'child_process'
import { join } from 'path'

import { Compilation, WebpackPluginInstance, Compiler } from 'webpack'

export interface NodeModuleTracePluginOptions {
  cwd?: string
  // relative to cwd
  contextDirectory?: string
  // additional PATH environment variable to use for spawning the `node-file-trace` process
  path?: string
  // log options
  log?: {
    all?: boolean
    detail?: boolean
    // Default is `error`
    level?:
      | 'bug'
      | 'fatal'
      | 'error'
      | 'warning'
      | 'hint'
      | 'note'
      | 'suggestions'
      | 'info'
  }
}

export class NodeModuleTracePlugin implements WebpackPluginInstance {
  static PluginName = 'NodeModuleTracePlugin'

  private readonly chunksToTrace = new Set<string>()

  constructor(private readonly options?: NodeModuleTracePluginOptions) {}

  apply(compiler: Compiler) {
    compiler.hooks.compilation.tap(
      NodeModuleTracePlugin.PluginName,
      (compilation) => {
        compilation.hooks.processAssets.tap(
          {
            name: NodeModuleTracePlugin.PluginName,
            stage: Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE,
          },
          () => this.createTraceAssets(compilation),
        )
      },
    )
    compiler.hooks.afterDone.tap(NodeModuleTracePlugin.PluginName, () =>
      this.runTrace(),
    )
  }

  private createTraceAssets(compilation: Compilation) {
    const outputPath = compilation.outputOptions.path!

    const isTraceable = (file: string) =>
      !file.endsWith('.wasm') && !file.endsWith('.map')

    for (const entrypoint of compilation.entrypoints.values()) {
      for (const chunk of entrypoint
        .getEntrypointChunk()
        .getAllReferencedChunks()) {
        for (const file of chunk.files) {
          if (isTraceable(file)) {
            const filePath = join(outputPath, file)
            this.chunksToTrace.add(filePath)
          }
        }
        for (const file of chunk.auxiliaryFiles) {
          if (isTraceable(file)) {
            const filePath = join(outputPath, file)
            this.chunksToTrace.add(filePath)
          }
        }
      }
    }
  }

  private runTrace() {
    process.stdout.write('\n')
    const args = [
      'annotate',
      '--context-directory',
      this.options?.contextDirectory ?? '.',
      '--exact',
    ]
    if (this.options?.log?.detail) {
      args.push('--log-detail')
    }
    if (this.options?.log?.all) {
      args.push('--show-all')
    }
    const logLevel = this.options?.log?.level
    if (logLevel) {
      args.push(`--log-level ${logLevel}`)
    }
    let turboTracingPackagePath = ''
    let turboTracingBinPath = ''
    try {
      turboTracingPackagePath = require.resolve('@vercel/node-module-trace')
    } catch (e) {
      // ignore
    }
    if (turboTracingPackagePath) {
      try {
        turboTracingBinPath = require.resolve(
          `@vercel/node-module-trace-${process.platform}-${process.arch}`,
          {
            paths: [turboTracingPackagePath],
          },
        )
      } catch (e) {
        // ignore
      }
    }
    const pathSep = process.platform === 'win32' ? ';' : ':'
    let paths = `${this.options?.path ?? ''}${pathSep}${process.env.PATH}`
    if (turboTracingBinPath) {
      paths = `${turboTracingBinPath}${pathSep}${paths}`
    }
    spawnSync('node-file-trace', [...args, ...this.chunksToTrace], {
      stdio: 'inherit',
      env: {
        ...process.env,
        PATH: paths,
      },
      cwd: this.options?.cwd ?? process.cwd(),
    })
  }
}
