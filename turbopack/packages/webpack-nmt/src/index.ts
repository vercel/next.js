import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { WebpackPluginInstance, Compiler } from 'webpack'
import { Compilation } from 'webpack'

export interface NodeModuleTracePluginOptions {
  cwd?: string
  // relative to cwd
  contextDirectory?: string
  // additional PATH environment variable to use for spawning the `node-file-trace` process
  path?: string
  // control the maximum number of files that are passed to the `node-file-trace` command
  // default is 128
  maxFiles?: number
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
          () => {
            this.createTraceAssets(compilation)
          }
        )
      }
    )
    compiler.hooks.afterEmit.tapPromise(NodeModuleTracePlugin.PluginName, () =>
      this.runTrace()
    )
  }

  private createTraceAssets(compilation: Compilation) {
    const outputPath = compilation.outputOptions.path!

    const isTraceable = (file: string) =>
      !file.endsWith('.wasm') && !file.endsWith('.map')

    for (const entrypoint of compilation.entrypoints.values()) {
      const file = entrypoint.getFiles().pop()
      if (file && isTraceable(file)) {
        this.chunksToTrace.add(join(outputPath, file))
      }
    }
  }

  private async runTrace() {
    process.stdout.write('\n')
    const cwd = this.options?.cwd ?? process.cwd()
    const args = [
      'annotate',
      '--context-directory',
      // `npm_config_local_prefix` set by `npm` to the root of the project, include workspaces
      // `PROJECT_CWD` set by `yarn` to the root of the project, include workspaces
      this.options?.contextDirectory ??
        process.env.npm_config_local_prefix ??
        process.env.PROJECT_CWD ??
        cwd,
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
      args.push(`--log-level`)
      args.push(logLevel)
    }
    let turboTracingPackagePath = ''
    let turboTracingBinPath = ''
    try {
      turboTracingPackagePath = require.resolve(
        '@vercel/experimental-nft/package.json'
      )
    } catch (e) {
      console.warn(
        `Could not resolve the @vercel/experimental-nft directory, turbo tracing may fail.`
      )
    }
    if (turboTracingPackagePath) {
      try {
        const turboTracingBinPackageJsonPath = require.resolve(
          `@vercel/experimental-nft-${process.platform}-${process.arch}/package.json`,
          {
            paths: [join(turboTracingPackagePath, '..')],
          }
        )
        turboTracingBinPath = join(turboTracingBinPackageJsonPath, '..')
      } catch (e) {
        console.warn(
          `Could not resolve the @vercel/experimental-nft-${process.platform}-${process.arch} directory, turbo tracing may fail.`
        )
      }
    }
    const pathSep = process.platform === 'win32' ? ';' : ':'
    let paths = `${this.options?.path ?? ''}${pathSep}${process.env.PATH}`
    if (turboTracingBinPath) {
      paths = `${turboTracingBinPath}${pathSep}${paths}`
    }
    const maxFiles = this.options?.maxFiles ?? 128
    let chunks = [...this.chunksToTrace]
    let restChunks = chunks.length > maxFiles ? chunks.splice(maxFiles) : []
    while (chunks.length) {
      await traceChunks(args, paths, chunks, cwd)
      chunks = restChunks
      if (restChunks.length) {
        restChunks = chunks.length > maxFiles ? chunks.splice(maxFiles) : []
      }
    }
  }
}

function traceChunks(
  args: Array<string>,
  paths: string,
  chunks: Array<string>,
  cwd?: string
) {
  const turboTracingProcess = spawn('node-file-trace', [...args, ...chunks], {
    stdio: 'pipe',
    env: {
      ...process.env,
      PATH: paths,
      RUST_BACKTRACE: '1',
    },
    cwd,
  })
  return new Promise<void>((resolve, reject) => {
    turboTracingProcess.on('error', (err) => {
      console.error(err)
    })
    turboTracingProcess.stdout.on('data', (chunk: string | Uint8Array) => {
      process.stdout.write(chunk)
    })
    turboTracingProcess.stderr.on('data', (chunk: string | Uint8Array) => {
      process.stderr.write(chunk)
    })
    turboTracingProcess.once('exit', (code) => {
      if (!code) {
        resolve()
      } else {
        reject(code)
      }
    })
  })
}
