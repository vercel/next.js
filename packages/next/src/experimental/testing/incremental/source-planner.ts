import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import { beginConfigProvenance } from './config-provenance'
import type { SourceSelectionPlan } from './source-selection'
import type { DiscoveredTestProject } from '../discovery'
import type { TestCompilerSessionOptions } from '../contracts'

/** Runs only in the supervised compile-only child. No executor is imported. */
export async function planSourceSelection(
  projectDir: string,
  projects: DiscoveredTestProject[],
  certifiedTestConfig: boolean,
  signal: AbortSignal,
  allocateArtifact: NonNullable<TestCompilerSessionOptions['allocateArtifact']>
): Promise<SourceSelectionPlan> {
  const provenance = await beginConfigProvenance(async (source, file) => {
    const swc =
      require('../../../build/swc') as typeof import('../../../build/swc')
    return await swc.parse(source, {
      filename: file,
      jsc: { parser: { syntax: 'ecmascript' } },
    })
  })
  const entries: SourceSelectionPlan['entries'] = []
  const roots = new Set<string>()
  try {
    for (const project of projects) {
      signal.throwIfAborted()
      const supported =
        project.profile.environment === 'node' &&
        project.profile.mode === 'development' &&
        project.isolate !== false &&
        !project.globalSetup?.length &&
        !project.executionEnvironment &&
        !project.entries.some(
          (entry) => entry.typecheck || entry.executionEnvironment
        )
      let session:
        | Awaited<
            ReturnType<typeof import('../compiler').createTestCompilerSession>
          >
        | undefined
      if (supported && project.entries.length) {
        ;(process.env as any).NODE_ENV = 'development'
        const { createTestCompilerSession } = await import(
          '../compiler/index.js'
        )
        // Configuration initialization errors are real failures, never widened.
        session = await createTestCompilerSession(projectDir, project.profile, {
          ...(project.compilerAliases
            ? { compilerAliases: project.compilerAliases }
            : {}),
          allocateArtifact,
        })
        if (session.configurationFile) roots.add(session.configurationFile)
      }
      try {
        for (const entry of project.entries) {
          signal.throwIfAborted()
          const sha256 = createHash('sha256')
            .update(await readFile(entry.file))
            .digest('hex')
          if (!session) {
            entries.push({ id: entry.id, file: entry.file, sha256 })
            continue
          }
          let artifact
          try {
            artifact = await session.compile(entry, {
              signal,
              dependencyPlan: true,
              setupFiles: project.setupFiles,
              setupFilesSequence: project.sequence?.setupFiles ?? 'list',
              snapshotSerializers: project.snapshotSerializers,
            })
          } catch {
            signal.throwIfAborted()
            // A failed transform is affected in the pinned resolver. Running this
            // entry through the ordinary path retains its real diagnostics.
            entries.push({
              id: entry.id,
              file: entry.file,
              sha256,
              compilationFailed: true,
            })
            continue
          }
          entries.push({
            id: entry.id,
            file: entry.file,
            sha256,
            ...(!artifact.moduleMocking &&
            !(artifact.kind === 'node' && artifact.moduleCache) &&
            artifact.sourceDependencies
              ? { dependencies: artifact.sourceDependencies }
              : {}),
          })
        }
      } finally {
        // A failed disposal vetoes the whole plan, even when evidence was broad.
        await session?.dispose()
      }
    }
    signal.throwIfAborted()
    return {
      version: 1,
      entries,
      configuration: await provenance.finish([...roots], certifiedTestConfig),
    }
  } catch (error) {
    provenance.abandon()
    throw error
  }
}
