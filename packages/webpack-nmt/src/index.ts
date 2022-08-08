import { spawnSync } from 'child_process'
import { join } from 'path'

import { Compilation, WebpackPluginInstance, Compiler } from 'webpack'

export interface NodeModuleTracePluginOptions {
  cwd?: string
  // relative to cwd
  contextDirectory?: string
  // additional PATH environment variable to use for spawning the `node-file-trace` process
  path?: string
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
    spawnSync(
      'node-file-trace',
      [
        'annotate',
        '--context-directory',
        this.options?.contextDirectory ?? '.',
        '--exact',
        ...this.chunksToTrace,
      ],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          PATH: `${this.options?.path ?? ''}${
            process.platform === 'win32' ? ';' : ':'
          }${process.env.PATH}`,
        },
        cwd: this.options?.cwd ?? process.cwd(),
      },
    )
  }
}
