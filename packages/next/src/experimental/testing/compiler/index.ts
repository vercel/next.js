import { readNativeMockCoverageSources } from '../coverage/mock-sources'
import { readClientDescriptor, hashClientOutputs } from './client'
import { createHash, randomUUID } from 'crypto'
import {
  mkdir,
  mkdtemp,
  rename,
  rm,
  lstat,
  readdir,
  readFile,
  realpath,
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
import { printNonFatalIssue } from '../../../server/dev/turbopack-utils'
import { loadBindings } from '../../../build/swc'
import { Lockfile } from '../../../build/lockfile'
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
import { validateCompiledTestRoute } from '../rsc/route'
import { usesInSourceTestMarker } from '../in-source'
import { readSourceDependencyAsset } from '../incremental/source-selection'
import type {
  CompiledTestArtifact,
  CompiledTestRoute,
  CompiledTestCohort,
  CompiledNodeTestArtifact,
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
  if (
    profile.route !== undefined &&
    (config.cacheComponents || config.output === 'export')
  )
    throw new Error(
      'Route-aware RSC tests currently require dynamic Node rendering without Cache Components or output export'
    )
  const distDir = resolve(dir, config.distDir)
  const dev = profile.mode === 'development'
  // Use the same output lock as normal Next servers/builds, including during
  // config-derived manifest generation. Never allow a second compiler owner.
  if (!config.experimental.lockDistDir) {
    throw new Error('Next test compilation requires experimental.lockDistDir.')
  }
  await mkdir(distDir, { recursive: true })
  const acquiredLock = Lockfile.tryAcquire(join(distDir, 'lock'))
  if (!acquiredLock)
    throw new Error(
      'Next test output is already owned by another compiler or application server.'
    )
  const outputLock = acquiredLock
  const compilation = await (async () => {
    try {
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
        : await bindings.turbo
            .createProject(
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
                gc: config.experimental.turbopackGcOptions,
                isShortSession: true,
              }
            )
            .then((result) => {
              for (const issue of result.issues) printNonFatalIssue(issue)
              return result.value
            })
      return { buildId, fsChecker, project }
    } catch (error) {
      await outputLock.unlock()
      throw error
    }
  })()
  const directories = new Set<string>()
  let closing = false
  let pending: Promise<unknown> = Promise.resolve()
  let disposal: Promise<void> | undefined
  let compilationShutdown: Promise<void> | undefined

  async function compileEntry(
    entry: TestEntry,
    signal: AbortSignal,
    setupFiles: readonly string[],
    setupFilesSequence: 'list' | 'parallel',
    snapshotSerializers: readonly string[],
    coverage: CompileTestOptions['coverage'],
    cohortEntries?: readonly TestEntry[],
    dependencyPlan = false
  ) {
    signal.throwIfAborted()
    if (
      dependencyPlan &&
      (profile.environment !== 'node' ||
        profile.mode !== 'development' ||
        cohortEntries)
    )
      throw new Error(
        'Dependency planning currently requires isolated development Node entries'
      )
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
    const inputs = cohortEntries ?? [entry]
    if (cohortEntries) {
      if (
        !inputs.length ||
        profile.environment !== 'node' ||
        profile.mode !== 'development' ||
        setupFiles.length ||
        snapshotSerializers.length ||
        coverage ||
        new Set(inputs.map((input) => input.id)).size !== inputs.length ||
        new Set(inputs.map((input) => input.file)).size !== inputs.length ||
        inputs.some(
          (input) =>
            input.typecheck ||
            input.inSource ||
            input.executionEnvironment ||
            JSON.stringify(input.profile) !== JSON.stringify(profile)
        )
      ) {
        throw new Error(
          'Shared test cohorts require unique development Node runtime entries without setup, serializers or coverage'
        )
      }
    }
    const cohortInputs = cohortEntries
      ? await Promise.all(
          inputs.map(async (input) => {
            const source = await readFile(input.file)
            if (usesInSourceTestMarker(source.toString('utf8'), input.file)) {
              throw new Error(
                'Shared test cohorts do not yet support import.meta.vitest'
              )
            }
            return {
              entryId: input.id,
              file: projectFile(input.file),
              sourceHash: createHash('sha256').update(source).digest('hex'),
            }
          })
        )
      : undefined
    if (profile.browserClient && (config.basePath || config.assetPrefix))
      throw new Error(
        'Client Browser Mode currently requires the default asset prefix and base path.'
      )
    if (
      profile.browserClient &&
      (setupFiles.length ||
        snapshotSerializers.length ||
        coverage ||
        cohortEntries ||
        entry.executionEnvironment ||
        entry.inSource ||
        entry.typecheck)
    )
      throw new Error(
        'Client Browser Mode currently requires one isolated runtime file without setup, serializers, coverage or custom realms.'
      )
    const file = projectFile(entry.file)
    const source = await readFile(entry.file)
    const sourceHash = createHash('sha256').update(source).digest('hex')
    const usesInSource =
      entry.inSource ||
      usesInSourceTestMarker(source.toString('utf8'), entry.file)
    if (
      (entry.inSource && entry.inSourceHash !== sourceHash) ||
      (usesInSource &&
        (profile.environment !== 'node' || entry.executionEnvironment))
    ) {
      throw new Error(
        'In-source test discovery does not match the selected Node source bytes'
      )
    }
    const clientSource = profile.browserClient
      ? await realpath(entry.file)
      : undefined
    if (clientSource) {
      const root = await realpath(dir),
        clientRelativePath = relative(root, clientSource)
      if (
        !clientRelativePath ||
        clientRelativePath === '..' ||
        clientRelativePath.startsWith(`..${sep}`) ||
        isAbsolute(clientRelativePath)
      )
        throw new Error(
          'Browser Mode selected source escaped its project root.'
        )
    }
    const setup = setupFiles.map(projectFile)
    const nativeId = createHash('sha256')
      .update(
        cohortInputs
          ? JSON.stringify(
              cohortInputs.map(({ entryId, file: sourceFile }) => ({
                entryId,
                file: sourceFile,
              }))
            )
          : entry.id
      )
      .digest('hex')
    const endpoint = await compilation.project.testEntry({
      id: nativeId,
      file,
      ...(cohortInputs
        ? { cohortFiles: cohortInputs.map((input) => input.file) }
        : {}),
      setupFiles: setup,
      setupFilesSequence,
      snapshotSerializers,
      inSource: usesInSource,
      dependencyPlan,
      runtimeEnv: profile.environment === 'node' && dev,
      ...(profile.browserClient ? { browserClient: true } : {}),
      environment: profile.environment,
      ...(profile.route !== undefined ? { route: profile.route } : {}),
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
      const outputResult = await endpoint.writeToDiskSnapshot(basename(staging))
      const output = outputResult.value
      signal.throwIfAborted()
      const diagnostics = outputResult.issues
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
                compilation.fsChecker.previewProps
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
      if (usesInSource || profile.browserClient) {
        const sourceMetadataPath = `server/next-test/${nativeId}.source.json`
        if (!files.includes(sourceMetadataPath)) {
          throw new Error('Missing native in-source test source identity')
        }
        const metadata = JSON.parse(
          await readFile(artifactPath(staging, sourceMetadataPath), 'utf8')
        )
        if (metadata.version !== 1 || metadata.sha256 !== sourceHash) {
          throw new Error(
            'Native in-source test bytes do not match marker discovery'
          )
        }
      }
      const clientDescriptor = profile.browserClient
        ? await readClientDescriptor(staging, output.entryPath, files, nativeId)
        : undefined
      let route: (CompiledTestRoute & { metadataPath: string }) | undefined
      if (profile.route !== undefined) {
        const metadataPath = `server/next-test/${nativeId}.route.json`
        if (!files.includes(metadataPath))
          throw new Error('Missing native AppProject test route metadata')
        const metadata: unknown = JSON.parse(
          await readFile(artifactPath(staging, metadataPath), 'utf8')
        )
        validateCompiledTestRoute(metadata, profile)
        if (
          metadata.entry.file !== file ||
          metadata.entry.sha256 !== sourceHash
        )
          throw new Error(
            'Native RSC route entry source identity does not match compilation'
          )
        route = { ...metadata, metadataPath }
      }
      async function validateRouteSources() {
        for (const routeSource of route?.sources ?? []) {
          const path = artifactPath(dir, routeSource.file)
          const canonicalRoot = await realpath(dir)
          const canonicalSource = await realpath(path)
          const sourceRelative = relative(canonicalRoot, canonicalSource)
          if (
            sourceRelative === '..' ||
            sourceRelative.startsWith(`..${sep}`) ||
            isAbsolute(sourceRelative) ||
            createHash('sha256')
              .update(await readFile(path))
              .digest('hex') !== routeSource.sha256
          )
            throw new Error(
              'AppProject route source changed or escaped the project during compilation'
            )
        }
      }
      await validateRouteSources()
      const cohortMetadataPath = `server/next-test/${nativeId}.cohort.json`
      if (cohortInputs) {
        if (!files.includes(cohortMetadataPath)) {
          throw new Error('Missing native shared test cohort metadata')
        }
        const metadata = JSON.parse(
          await readFile(artifactPath(staging, cohortMetadataPath), 'utf8')
        )
        if (
          metadata.cohort?.version !== 1 ||
          JSON.stringify(metadata.cohort.files) !==
            JSON.stringify(cohortInputs.map((input) => input.file))
        ) {
          throw new Error(
            'Compiled shared test cohort order does not match its inputs'
          )
        }
      }
      const mockMetadataPath = `server/next-test/${nativeId}.metadata.json`
      let moduleMocking: CompiledTestArtifact['moduleMocking']
      let moduleCache: { version: 1 } | undefined
      let dynamicModuleMocking: { version: 1 } | undefined
      if (files.includes(mockMetadataPath)) {
        const nativeMockBytes = await readFile(
          artifactPath(staging, mockMetadataPath)
        )
        const metadata = JSON.parse(nativeMockBytes.toString('utf8'))
        if (metadata.dynamicModuleMocking !== undefined) {
          if (
            metadata.dynamicModuleMocking?.version !== 1 ||
            metadata.moduleCache?.version !== 1 ||
            metadata.moduleMocking ||
            profile.environment !== 'node'
          )
            throw new Error(
              'Invalid native runtime module mock ownership metadata'
            )
          dynamicModuleMocking = { version: 1 }
        }
        if (metadata.moduleCache !== undefined) {
          if (
            metadata.moduleCache?.version !== 1 ||
            profile.environment !== 'node' ||
            profile.mode !== 'development' ||
            cohortInputs ||
            metadata.moduleMocking ||
            setupFiles.length ||
            snapshotSerializers.length ||
            coverage ||
            usesInSource ||
            entry.executionEnvironment
          )
            throw new Error(
              'Module cache resets require isolated development Node without setup, serializers, coverage or custom realms'
            )
          moduleCache = { version: 1 }
        } else {
          if (
            !['node', 'rsc'].includes(profile.environment) ||
            profile.mode !== 'development' ||
            (profile.environment === 'rsc' &&
              (profile.route !== undefined ||
                setupFiles.length ||
                snapshotSerializers.length ||
                entry.executionEnvironment ||
                usesInSource ||
                coverage)) ||
            metadata.moduleMocking?.version !== 1
          )
            throw new Error('Invalid compiled module mocking metadata')
          moduleMocking = {
            version: 1,
            ...(coverage
              ? {
                  coverage: {
                    ...readNativeMockCoverageSources(
                      metadata.moduleMocking.coverage
                    ),
                    nativeMetadata: {
                      path: mockMetadataPath,
                      sha256: createHash('sha256')
                        .update(nativeMockBytes)
                        .digest('hex'),
                    },
                  },
                }
              : {}),
          }
        }
      }
      // As in the dev server output directory, emitted Node chunks are CJS even
      // when the application's package.json declares type: module.
      if (!files.includes('package.json')) {
        await writeFile(join(staging, 'package.json'), '{"type":"commonjs"}')
        files.push('package.json')
        files.sort()
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
            syntheticSources: moduleMocking?.coverage,
          })
        : undefined
      signal.throwIfAborted()
      const publishedSourceHash = createHash('sha256')
        .update(await readFile(entry.file))
        .digest('hex')
      if (publishedSourceHash !== sourceHash) {
        throw new Error('Test source changed while its artifact was compiled')
      }
      if (cohortInputs) {
        for (let index = 0; index < inputs.length; index++) {
          const publishedHash = createHash('sha256')
            .update(await readFile(inputs[index].file))
            .digest('hex')
          if (publishedHash !== cohortInputs[index].sourceHash) {
            throw new Error(
              'Shared test cohort source changed while its artifact was compiled'
            )
          }
        }
      }
      const cohortOutputs = cohortInputs
        ? await Promise.all(
            files.map(async (outputFile) => ({
              path: outputFile,
              sha256: createHash('sha256')
                .update(await readFile(artifactPath(staging, outputFile)))
                .digest('hex'),
            }))
          )
        : undefined
      await validateRouteSources()
      const client = clientDescriptor
        ? {
            ...clientDescriptor,
            sourceFile: clientSource!,
            outputs: await hashClientOutputs(staging, files),
          }
        : undefined
      await rename(staging, rootDir)
      directories.delete(staging)
      if (!options.allocateArtifact) directories.add(rootDir)
      const sourceDependencies = dependencyPlan
        ? await readSourceDependencyAsset(
            rootDir,
            output.entryPath,
            dir,
            entry,
            sourceHash
          )
        : undefined
      if (
        sourceDependencies &&
        (Object.keys(config.turbopack.rules ?? {}).length ||
          config.experimental.swcPlugins?.length)
      )
        sourceDependencies.complete = false
      const common = {
        ...(sourceDependencies ? { sourceDependencies } : {}),
        version: 2 as const,
        ...(coverageMetadata ? { coverage: coverageMetadata } : {}),
        entryId: entry.id,
        setupFiles: [...setupFiles],
        snapshotSerializers: [...snapshotSerializers],
        ...(moduleMocking ? { moduleMocking } : {}),
        ...(moduleCache ? { moduleCache } : {}),
        ...(dynamicModuleMocking ? { dynamicModuleMocking } : {}),
        revision,
        sourceHash,
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
      const artifact: CompiledTestArtifact = client
        ? {
            ...common,
            kind: 'browser',
            profile: { ...profile, environment: 'browser' },
            client,
          }
        : profile.environment === 'rsc'
          ? {
              ...common,
              kind: 'rsc',
              profile: { ...profile, environment: 'rsc' },
              manifestPage,
              ...(route ? { route } : {}),
              manifests: manifests!,
              requestContext: {
                mode: profile.mode,
                buildId: compilation.buildId,
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
              ...(cohortInputs
                ? {
                    cohort: {
                      version: 1 as const,
                      index: 0,
                      metadataPath: cohortMetadataPath,
                      outputs: cohortOutputs!,
                      entries: cohortInputs,
                    },
                  }
                : {}),
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
      await compilation.project.shutdown()
      // Failed native shutdown retains the lock until process exit.
      await outputLock.unlock()
    })())
  }

  return {
    /** Actual source selected by the ordinary Next configuration loader. */
    ...(config.configFile ? { configurationFile: config.configFile } : {}),
    compile(
      entry: TestEntry,
      {
        signal,
        setupFiles = [],
        setupFilesSequence = 'list',
        snapshotSerializers = [],
        coverage,
        dependencyPlan,
      }: CompileTestOptions
    ) {
      if (closing)
        return Promise.reject(new Error('Test compilation has been shut down'))
      const setup = [...setupFiles]
      const result = pending.then(() =>
        compileEntry(
          entry,
          signal,
          setup,
          setupFilesSequence,
          [...snapshotSerializers],
          coverage,
          undefined,
          dependencyPlan
        )
      )
      pending = result.catch(() => {})
      return result
    },
    compileCohort(
      entries: readonly TestEntry[],
      {
        signal,
        setupFiles = [],
        setupFilesSequence = 'list',
        snapshotSerializers = [],
        coverage,
      }: CompileTestOptions
    ): Promise<CompiledTestCohort> {
      if (closing)
        return Promise.reject(new Error('Test compilation has been shut down'))
      const inputs = entries.map((entry) => ({
        ...entry,
        profile: { ...entry.profile },
      }))
      const setup = [...setupFiles]
      const serializers = [...snapshotSerializers]
      const result = pending.then(async () => {
        if (!inputs.length)
          throw new Error('A shared test cohort requires at least one entry')
        const artifact = await compileEntry(
          inputs[0],
          signal,
          setup,
          setupFilesSequence,
          serializers,
          coverage,
          inputs
        )
        if (artifact.kind !== 'node' || !artifact.cohort) {
          throw new Error(
            'Shared test cohort compilation did not produce Node cohort identity'
          )
        }
        const cohort = artifact.cohort
        return {
          version: 1 as const,
          artifacts: cohort.entries.map(
            (input, index): CompiledNodeTestArtifact => ({
              ...artifact,
              entryId: input.entryId,
              sourceHash: input.sourceHash,
              cohort: { ...cohort, index },
            })
          ),
        }
      })
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
