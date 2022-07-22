import { spawn } from 'child_process'
import { join } from 'path'

import { Compilation, WebpackPluginInstance, Compiler } from 'webpack'

export interface NodeModuleTracePluginOptions {
  cwd?: string
  // additional PATH environment variable to use for spawning the `node-file-trace` process
  path?: string
}

export class NodeModuleTracePlugin implements WebpackPluginInstance {
  static PluginName = 'NodeModuleTracePlugin'

  constructor(private readonly options?: NodeModuleTracePluginOptions) {}

  apply(compiler: Compiler) {
    compiler.hooks.compilation.tap(
      NodeModuleTracePlugin.PluginName,
      (compilation) => {
        compilation.hooks.processAssets.tapPromise(
          {
            name: NodeModuleTracePlugin.PluginName,
            stage: Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE,
          },
          () => this.createTraceAssets(compilation),
        )
      },
    )
  }

  private createTraceAssets(compilation: Compilation) {
    const outputPath = compilation.outputOptions.path!
    const entryFilesMap = new Map<any, Set<string>>()
    const chunksToTrace = new Set<string>()
    const isTraceable = (file: string) => !file.endsWith('.wasm')

    for (const entrypoint of compilation.entrypoints.values()) {
      const entryFiles = new Set<string>()

      for (const chunk of entrypoint
        .getEntrypointChunk()
        .getAllReferencedChunks()) {
        for (const file of chunk.files) {
          if (isTraceable(file)) {
            const filePath = join(outputPath, file)
            chunksToTrace.add(filePath)
            entryFiles.add(filePath)
          }
        }
        for (const file of chunk.auxiliaryFiles) {
          if (isTraceable(file)) {
            const filePath = join(outputPath, file)
            chunksToTrace.add(filePath)
            entryFiles.add(filePath)
          }
        }
      }
      entryFilesMap.set(entrypoint, entryFiles)
    }
    return this.runTrace(chunksToTrace)
  }

  private runTrace(files: Set<string>) {
    const child = spawn('node-file-trace', ['annotate', '--exact', ...files], {
      stdio: 'inherit',
      env: {
        ...process.env,
        PATH: `${this.options?.path ?? ''}${
          process.platform === 'win32' ? ';' : ':'
        }${process.env.PATH}`,
      },
      cwd: this.options?.cwd ?? process.cwd(),
    })
    return new Promise<void>((resolve, reject) => {
      child.once('close', (code) => {
        if (!code) {
          resolve()
        } else {
          reject(new Error(`node-file-trace exited with code ${code}`))
        }
      })
      child.once('error', reject)
      child.once('exit', (code) => {
        if (!code) {
          resolve()
        } else {
          reject(new Error(`node-file-trace exited with code ${code}`))
        }
      })
    })
  }
}
