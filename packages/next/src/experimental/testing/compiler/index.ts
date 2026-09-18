import { createHash, randomUUID } from 'crypto'
import {
  mkdir,
  mkdtemp,
  rename,
  rm,
  lstat,
  readdir,
  readFile,
  writeFile,
} from 'fs/promises'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'path'
import { loadBindings } from '../../../build/swc'
import { createDevTurbopackProject } from '../../../build/swc/dev-project'
import { createProductionProjectOptions } from '../../../build/swc/production-project'
import { generateBuildId } from '../../../build/generate-build-id'
import { generatePreviewKeys } from '../../../build/preview-key-utils'
import { generateEncryptionKeyBase64 } from '../../../server/app-render/encryption-utils-server'
import loadCustomRoutes from '../../../lib/load-custom-routes'
import { setupFsCheck } from '../../../server/lib/router-utils/filesystem'
import { writeDevRequestManifests } from '../../../server/lib/router-utils/write-dev-request-manifests'
import { formatIssue } from '../../../shared/lib/turbopack/utils'
import { loadTestCompilerConfig, validateTestProfile } from './watch-options'
import { buildCoverageMetadata } from '../coverage/artifact'
import type {
  CompiledTestArtifact,
  CompileTestOptions,
  TestEntry,
  TestProfile,
  TestCompilerSessionOptions,
} from '../contracts'

/** Paths returned by native emission must remain inside the published closure. */
function artifactPath(root: string, path: string): string {
  const target = resolve(root, path)
  const rel = relative(root, target)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`Invalid compiled test artifact path: ${path}`)
  }
  return target
}

/**
 * Owns the native graph and immutable artifacts until dispose. Callers must await
 * all execution processes before disposing the compiler session.
 */
export async function createTestCompilerSession(
  projectDir: string,
  profile: TestProfile,
  options: TestCompilerSessionOptions = {}
) {
  const { dir, config } = await loadTestCompilerConfig(projectDir, profile)
  const bindings = await loadBindings(config.experimental.useWasmBinary)
  if (bindings.isWasm) {
    throw new Error('Test compilation requires native Turbopack bindings')
  }
  const distDir = resolve(dir, config.distDir)
  const dev = profile.mode === 'development'
  const buildId = dev
    ? 'development'
    : await generateBuildId(config.generateBuildId, randomUUID)
  const fsChecker = dev
    ? await setupFsCheck({ dir, dev: true, config })
    : {
        rewrites: (await loadCustomRoutes(config)).rewrites,
        previewProps: await generatePreviewKeys({ isBuild: true, distDir }),
      }
  const project = dev
    ? (
        await createDevTurbopackProject({
          projectPath: dir,
          nextConfig: config,
          distDir,
          fsChecker,
          serverFastRefresh: false,
        })
      ).project
    : await bindings.turbo.createProject(
        createProductionProjectOptions({
          dir,
          distDir,
          config,
          buildId,
          encryptionKey: await generateEncryptionKeyBase64({
            isBuild: true,
            distDir,
          }),
          previewProps: fsChecker.previewProps,
          rewrites: fsChecker.rewrites,
          clientRouterFilters: undefined,
        }),
        {
          turbopackMemoryEviction:
            config.experimental.turbopackMemoryEvictionMode,
          dependencyTracking:
            config.experimental.turbopackFileSystemCacheForBuild || false,
          isShortSession: true,
        }
      )
  const directories = new Set<string>()
  let closing = false
  let pending: Promise<unknown> = Promise.resolve()
  let disposal: Promise<void> | undefined
  let compilationShutdown: Promise<void> | undefined

  async function compileEntry(
    entry: TestEntry,
    signal: AbortSignal,
    setupFiles: readonly string[],
    coverage: CompileTestOptions['coverage']
  ) {
    signal.throwIfAborted()
    validateTestProfile(entry.profile)
    if (
      coverage &&
      (coverage.version !== 1 ||
        coverage.kind !== 'node-line' ||
        profile.environment !== 'node' ||
        profile.mode !== 'development')
    ) {
      throw new Error(
        'Coverage supports one-shot development Node test profiles only'
      )
    }
    if (JSON.stringify(entry.profile) !== JSON.stringify(profile)) {
      throw new Error('Test entry profile does not match its compiler session')
    }
    function projectFile(path: string): string {
      const file = relative(dir, path)
      if (
        !isAbsolute(path) ||
        !file ||
        file === '..' ||
        file.startsWith(`..${sep}`) ||
        isAbsolute(file)
      ) {
        throw new Error(
          'Test entry and setup files must be inside the Next.js project'
        )
      }
      return file.split(sep).join('/')
    }
    const file = projectFile(entry.file)
    const setup = setupFiles.map(projectFile)
    const nativeId = createHash('sha256').update(entry.id).digest('hex')
    const endpoint = await project.testEntry({
      id: nativeId,
      file,
      setupFiles: setup,
      environment: profile.environment,
    })
    signal.throwIfAborted()
    await mkdir(dirname(distDir), { recursive: true })
    const revision = randomUUID()
    const allocation = options.allocateArtifact
      ? await options.allocateArtifact(dirname(distDir))
      : {
          stagingDir: await mkdtemp(
            join(dirname(distDir), '.next-test-pending-')
          ),
          rootDir: join(dirname(distDir), `.next-test-${revision}`),
        }
    const { stagingDir: staging, rootDir } = allocation
    for (const [path, prefix] of [
      [staging, '.next-test-pending-'],
      [rootDir, '.next-test-'],
    ]) {
      if (
        !isAbsolute(path) ||
        dirname(path) !== dirname(distDir) ||
        !basename(path).startsWith(prefix) ||
        !/^\.next-test-[a-zA-Z0-9.-]+$/.test(basename(path))
      ) {
        throw new Error(
          'Test artifact allocation must use generated siblings of the configured output'
        )
      }
    }
    if (staging === rootDir)
      throw new Error('Test staging and publication paths must differ')
    if (
      !(await lstat(staging)).isDirectory() ||
      (await readdir(staging)).length !== 0
    ) {
      throw new Error('Test staging allocation must be an empty directory')
    }
    try {
      await lstat(rootDir)
      throw new Error('Test publication allocation must not already exist')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    // A parent allocator retains deletion ownership until its execution leases
    // close, including when this compiler process crashes or disconnects.
    if (!options.allocateArtifact) {
      directories.add(staging)
      directories.add(rootDir)
    }
    try {
      signal.throwIfAborted()
      // Native emission reads one strongly consistent output graph, including
      // client assets and source maps. It never copies mutable build filenames.
      const output = await endpoint.writeToDiskSnapshot(basename(staging))
      signal.throwIfAborted()
      const diagnostics = output.issues
        .filter((issue) =>
          ['bug', 'fatal', 'error', 'warning'].includes(issue.severity)
        )
        .map((issue) => ({
          phase: 'compilation' as const,
          severity:
            issue.severity === 'warning'
              ? ('warning' as const)
              : ('error' as const),
          message: formatIssue(issue),
        }))
      if (
        output.type !== 'nodejs' ||
        diagnostics.some((issue) => issue.severity === 'error')
      ) {
        throw new Error(
          diagnostics.map((issue) => issue.message).join('\n') ||
            'No runnable Node.js test artifact was emitted'
        )
      }
      const manifestPage = `/__next_test__/${nativeId}/page`
      const manifests =
        profile.environment === 'rsc'
          ? {
              ...(await writeDevRequestManifests(
                staging,
                fsChecker.previewProps
              )),
              clientReference: `server/app${manifestPage}_client-reference-manifest.js`,
              serverActions: `server/app${manifestPage}/server-reference-manifest.json`,
            }
          : undefined
      const files = [
        ...new Set([
          ...output.serverPaths.map((item) => item.path),
          ...output.clientPaths,
          ...(manifests ? [manifests.previewProps, manifests.prerender] : []),
        ]),
      ].sort()
      for (const required of [
        output.entryPath,
        ...Object.values(manifests ?? {}),
      ]) {
        if (!files.includes(required))
          throw new Error(`Missing test artifact: ${required}`)
      }
      for (const outputFile of files) {
        if (!(await lstat(artifactPath(staging, outputFile))).isFile()) {
          throw new Error(
            `Test artifacts require regular emitted files; external package links and directory assets are not supported: ${outputFile}`
          )
        }
      }
      const mockMetadataPath = `server/next-test/${nativeId}.metadata.json`
      let moduleMocking: { version: 1 } | undefined
      if (files.includes(mockMetadataPath)) {
        const metadata = JSON.parse(
          await readFile(artifactPath(staging, mockMetadataPath), 'utf8')
        )
        if (
          profile.environment !== 'node' ||
          metadata.moduleMocking?.version !== 1
        ) {
          throw new Error('Invalid compiled module mocking metadata')
        }
        moduleMocking = { version: 1 }
      }
      // As in the dev server output directory, emitted Node chunks are CJS even
      // when the application's package.json declares type: module.
      if (!files.includes('package.json')) {
        await writeFile(join(staging, 'package.json'), '{"type":"commonjs"}')
        files.push('package.json')
        files.sort()
      }
      if (coverage && moduleMocking) {
        throw new Error('Coverage does not support mocked test artifacts')
      }
      const coverageMetadata = coverage
        ? await buildCoverageMetadata({
            rootDir: staging,
            files,
            projectDir: dir,
            sourceRootDir: resolve(
              config.turbopack?.root || config.outputFileTracingRoot || dir
            ),
            entryFile: entry.file,
            setupFiles,
          })
        : undefined
      signal.throwIfAborted()
      await rename(staging, rootDir)
      directories.delete(staging)
      if (!options.allocateArtifact) directories.add(rootDir)
      const common = {
        version: 2 as const,
        ...(coverageMetadata ? { coverage: coverageMetadata } : {}),
        entryId: entry.id,
        setupFiles: [...setupFiles],
        ...(moduleMocking ? { moduleMocking } : {}),
        revision,
        rootDir,
        entryPath: output.entryPath,
        files,
        dependencyEvidence: {
          kind: 'emitted-output' as const,
          complete: false as const,
          serverOutputs: output.serverPaths.map(({ path, contentHash }) => ({
            path,
            contentHash,
          })),
        },
        diagnostics,
      }
      const artifact: CompiledTestArtifact =
        profile.environment === 'rsc'
          ? {
              ...common,
              kind: 'rsc',
              profile: { ...profile, environment: 'rsc' },
              manifestPage,
              manifests: manifests!,
              requestContext: {
                mode: profile.mode,
                buildId,
                deploymentId: config.deploymentId ?? '',
                incrementalCache: {
                  cacheMaxMemorySize: config.cacheMaxMemorySize,
                  allowedRevalidateHeaderKeys:
                    config.experimental.allowedRevalidateHeaderKeys,
                  fetchCacheKeyPrefix: config.experimental.fetchCacheKeyPrefix,
                  isrFlushToDisk: Boolean(config.experimental.isrFlushToDisk),
                  customHandlersConfigured: Boolean(
                    config.cacheHandler ||
                      Object.values(config.cacheHandlers ?? {}).some(Boolean)
                  ),
                },
                renderOpts: {
                  cacheLifeProfiles: config.cacheLife,
                  staticPageGenerationTimeout:
                    config.staticPageGenerationTimeout,
                  cacheComponents: config.cacheComponents ?? false,
                  validationLevel:
                    config.experimental.instantInsights.validationLevel,
                  assetPrefix: config.assetPrefix,
                  experimental: {
                    authInterrupts: !!config.experimental.authInterrupts,
                    useCacheTimeout: config.experimental.useCacheTimeout,
                    durableUseCacheEntries: Boolean(
                      config.experimental.durableUseCacheEntries
                    ),
                  },
                },
              },
            }
          : {
              ...common,
              kind: 'node',
              profile: { ...profile, environment: profile.environment },
              ...(profile.environment === 'browser'
                ? {
                    applicationServer: {
                      mode: profile.mode,
                      distDir,
                      lockDistDir: Boolean(config.experimental.lockDistDir),
                    },
                  }
                : {}),
            }
      return artifact
    } catch (error) {
      if (!options.allocateArtifact) {
        await rm(staging, { recursive: true, force: true })
        directories.delete(staging)
      }
      throw error
    }
  }

  // Release native watches/cache handles before another owner starts the normal
  // application server. Published revisions remain leased until dispose().
  function shutdownCompilation(): Promise<void> {
    closing = true
    return (compilationShutdown ??= (async () => {
      await pending
      await project.shutdown()
    })())
  }

  return {
    compile(
      entry: TestEntry,
      { signal, setupFiles = [], coverage }: CompileTestOptions
    ) {
      if (closing)
        return Promise.reject(new Error('Test compilation has been shut down'))
      const setup = [...setupFiles]
      const result = pending.then(() =>
        compileEntry(entry, signal, setup, coverage)
      )
      pending = result.catch(() => {})
      return result
    },
    shutdownCompilation,
    dispose(): Promise<void> {
      if (!disposal) {
        disposal = (async () => {
          try {
            await shutdownCompilation()
          } finally {
            await Promise.all(
              [...directories].map((path) =>
                rm(path, { recursive: true, force: true })
              )
            )
            directories.clear()
          }
        })()
      }
      return disposal
    },
  }
}
