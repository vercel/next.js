import { Session } from 'inspector'
import { realpath } from 'fs/promises'
import { isAbsolute, resolve } from 'path'
import { fileURLToPath } from 'url'
import type { CompiledTestArtifact } from '../contracts'
import type { CoverageArtifactMetadata, CoverageCapture } from './types'
import { coverageHash, readArtifactFile, within } from './artifact'

type CoverageArtifact = CompiledTestArtifact & {
  coverage?: CoverageArtifactMetadata
}

/** Start before requiring even the emitted entry bootstrap, in the owned worker. */
export async function startCoverage(artifact: CoverageArtifact): Promise<{
  stop(): Promise<CoverageCapture>
  dispose(): Promise<void>
}> {
  if (
    artifact.profile.environment !== 'node' ||
    artifact.profile.mode !== 'development' ||
    artifact.profile.route ||
    artifact.moduleMocking ||
    artifact.coverage?.version !== 1
  ) {
    throw new Error(
      'Line coverage requires an unmocked development Node coverage artifact'
    )
  }
  const root = await realpath(artifact.rootDir)
  const declared = new Map(
    artifact.coverage.scripts.map((script) => [
      resolve(root, script.path),
      script,
    ])
  )
  for (const script of artifact.coverage.scripts) {
    if (
      !artifact.files.includes(script.path) ||
      coverageHash(await readArtifactFile(root, script.path)) !== script.sha256
    ) {
      throw new Error(`Coverage emitted source mismatch: ${script.path}`)
    }
  }
  const parsedScripts = new Set<string>()
  const session = new Session()
  session.on('Debugger.scriptParsed', ({ params }) => {
    let filename = params.url
    if (filename.startsWith('file://')) filename = fileURLToPath(filename)
    if (isAbsolute(filename) && declared.has(resolve(filename))) {
      parsedScripts.add(declared.get(resolve(filename))!.path)
    }
  })
  session.connect()
  const post = (method: string, params: object = {}): Promise<any> =>
    new Promise((fulfill, reject) => {
      session.post(method as any, params, (error, result) =>
        error ? reject(error) : fulfill(result)
      )
    })
  let disposed = false
  let stopped = false
  async function dispose() {
    if (disposed) return
    disposed = true
    try {
      await post('Profiler.stopPreciseCoverage')
    } finally {
      session.disconnect()
    }
  }
  try {
    await post('Debugger.enable')
    await post('Profiler.enable')
    await post('Profiler.startPreciseCoverage', {
      callCount: true,
      detailed: true,
    })
  } catch (error) {
    session.disconnect()
    throw error
  }
  return {
    dispose,
    async stop() {
      if (stopped || disposed)
        throw new Error('Coverage capture has already stopped')
      stopped = true
      try {
        const { result } = await post('Profiler.takePreciseCoverage')
        const scripts: CoverageCapture['scripts'] = []
        const seen = new Set<string>()
        for (const script of result) {
          let path = script.url
          if (path.startsWith('file://')) path = fileURLToPath(path)
          if (!isAbsolute(path)) continue
          path = resolve(path)
          const metadata = declared.get(path)
          if (!metadata) {
            if (within(root, path) && /\.(?:c|m)?js$/.test(path)) {
              throw new Error(`Undeclared loaded coverage script: ${path}`)
            }
            continue
          }
          if (seen.has(metadata.path))
            throw new Error(
              `Duplicate loaded coverage script: ${metadata.path}`
            )
          seen.add(metadata.path)
          const { scriptSource } = await post('Debugger.getScriptSource', {
            scriptId: script.scriptId,
          })
          if (coverageHash(scriptSource) !== metadata.sha256) {
            throw new Error(
              `Loaded coverage source differs from emitted bytes: ${metadata.path}`
            )
          }
          scripts.push({
            path: metadata.path,
            sha256: metadata.sha256,
            functions: script.functions,
          })
        }
        for (const path of parsedScripts) {
          if (!seen.has(path))
            throw new Error(`Coverage capture omitted a loaded script: ${path}`)
        }
        if (!seen.has(artifact.entryPath))
          throw new Error('Coverage capture did not observe the emitted entry')
        return { version: 1, scripts }
      } finally {
        await dispose()
      }
    },
  }
}
