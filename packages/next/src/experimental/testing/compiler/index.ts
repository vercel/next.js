import {
  readTestingDefaultConfiguration,
  assertTestingDefaultConfigurationEnvironment,
} from '../../../server/config-testing-policy'
import { withCompilerAliases } from './aliases'
import { materializeExternalLayout } from './external-layout'
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
import { formatIssue } from '../../../shared/lib/turbopack/utils'
import { loadTestCompilerConfig, validateTestProfile } from './watch-options'
import { withCompilerTransforms } from './transform-config'
import { assertTransformSource } from './transform-hooks'
import { usesInSourceTestMarker } from '../in-source'
import { readSourceDependencyAsset } from '../incremental/source-selection'
import type {
  CompiledTestArtifact,
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
  const configuredTestingDefaultConfiguration =
    readTestingDefaultConfiguration(options)
  const configuredCompilerEnvKeys = options.compilerEnvKeys
  if (
    configuredCompilerEnvKeys !== undefined &&
    (configuredCompilerEnvKeys !== true ||
      !['development', 'production'].includes(profile.mode))
  )
    throw new Error(
      'Compiler env key capture requires an ordinary Node profile and explicit true.'
    )
  if (
    configuredCompilerEnvKeys &&
    configuredTestingDefaultConfiguration !== undefined
  )
    throw new Error(
      'Compiler env key capture requires the ordinary Next project producer.'
    )
  const configuredCompilerAliases = options.compilerAliases
  const configuredCompilerTransforms = options.compilerTransforms
  const configuredArtifactAllocator = options.allocateArtifact
  if (
    configuredTestingDefaultConfiguration !== undefined &&
    (configuredCompilerAliases !== undefined ||
      configuredCompilerTransforms !== undefined)
  ) {
    throw new Error(
      'ERR_NEXT_TEST_DEFAULT_CONFIGURATION: compiler aliases and transforms are unavailable'
    )
  }
  profile = { ...profile }
  const loaded =
    configuredTestingDefaultConfiguration === undefined
      ? await loadTestCompilerConfig(projectDir, profile)
      : await loadTestCompilerConfig(
          projectDir,
          profile,
          configuredTestingDefaultConfiguration
        )
  const { dir } = loaded
  // Assertion and inline-snapshot locations need maps in the isolated test
  // artifact even when the application's production build omits them.
  const testConfig = loaded.config
  const configured = withCompilerTransforms(
    withCompilerAliases(testConfig, dir, profile, configuredCompilerAliases),
    dir,
    profile,
    configuredCompilerTransforms
  )
  const config = configured
  if (configuredTestingDefaultConfiguration !== undefined) {
    assertTestingDefaultConfigurationEnvironment(
      configuredTestingDefaultConfiguration
    )
  }
  const bindings =
    configuredTestingDefaultConfiguration === undefined
      ? await loadBindings(config.experimental.useWasmBinary)
      : await loadBindings(
          config.experimental.useWasmBinary,
          configuredTestingDefaultConfiguration
        )
  if (bindings.isWasm) {
    throw new Error('Test compilation requires native Turbopack bindings')
  }
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
      let nodejsDefineEnvKeys: readonly string[] | undefined
      let nativeProjectPaths:
        | Readonly<{
            rootPath: string
            projectPath: string
          }>
        | undefined
      const project = dev
        ? await (async () => {
            const result = await createDevTurbopackProject({
              projectPath: dir,
              nextConfig: config,
              distDir,
              fsChecker,
              serverFastRefresh: false,
              ...(configuredCompilerEnvKeys
                ? { captureNodejsDefineEnvKeys: true as const }
                : {}),
            })
            nativeProjectPaths = result.nativeProjectPaths
            if (configuredCompilerEnvKeys) {
              if (
                !Array.isArray(result.nodejsDefineEnvKeys) ||
                result.nodejsDefineEnvKeys.some(
                  (name) => typeof name !== 'string'
                )
              ) {
                const error = new Error(
                  'The actual Next project did not provide its Node define-env key map.'
                )
                try {
                  await result.project.shutdown()
                } catch (cleanup) {
                  throw new AggregateError([error, cleanup], error.message)
                }
                throw error
              }
              nodejsDefineEnvKeys = result.nodejsDefineEnvKeys
            }
            return result.project
          })()
        : await (async () => {
            const encryptionKey = await generateEncryptionKeyBase64({
              isBuild: true,
              distDir,
            })
            const projectOptions = createProductionProjectOptions({
              dir,
              distDir,
              config,
              buildId,
              encryptionKey,
              previewProps: fsChecker.previewProps,
              rewrites: fsChecker.rewrites,
              clientRouterFilters: undefined,
              // Test bodies observe function names and native error text.
              noMangling: true,
              ...(configuredTestingDefaultConfiguration === undefined
                ? {}
                : {
                    testingDefaultConfiguration:
                      configuredTestingDefaultConfiguration,
                  }),
            })
            if (configuredCompilerEnvKeys)
              nodejsDefineEnvKeys = Object.freeze(
                projectOptions.defineEnv.nodejs.map(({ name }) => name)
              )
            nativeProjectPaths = Object.freeze({
              rootPath: projectOptions.rootPath,
              projectPath: projectOptions.projectPath,
            })
            return bindings.turbo
              .createProject(projectOptions, {
                turbopackMemoryEviction:
                  config.experimental.turbopackMemoryEvictionMode,
                dependencyTracking:
                  config.experimental.turbopackFileSystemCacheForBuild || false,
                gc: config.experimental.turbopackGcOptions,
                isShortSession: true,
              })
              .then((result) => {
                for (const issue of result.issues) printNonFatalIssue(issue)
                return result.value
              })
          })()
      return {
        buildId,
        fsChecker,
        project,
        nativeProjectPaths,
        nodejsDefineEnvKeys,
      }
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
    cohortEntries?: readonly TestEntry[],
    dependencyPlan = false
  ) {
    signal.throwIfAborted()
    if (
      configuredCompilerTransforms &&
      (entry.inSource ||
        setupFiles.length ||
        snapshotSerializers.length ||
        cohortEntries)
    )
      throw new Error(
        'Transform-only compiler plugins cannot yet combine with compiler helpers, setup files, serializers, coverage or shared cohorts.'
      )
    if (dependencyPlan && cohortEntries)
      throw new Error(
        'Dependency planning currently requires isolated Node entries'
      )
    validateTestProfile(entry.profile)
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
        profile.mode !== 'development' ||
        setupFiles.length ||
        snapshotSerializers.length ||
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
    const file = projectFile(entry.file)
    const source = await readFile(entry.file)
    if (configuredCompilerTransforms)
      assertTransformSource(source.toString('utf8'), entry.file)
    const sourceHash = createHash('sha256').update(source).digest('hex')
    const usesInSource =
      entry.inSource ||
      usesInSourceTestMarker(source.toString('utf8'), entry.file)
    if (
      (entry.inSource && entry.inSourceHash !== sourceHash) ||
      (usesInSource && entry.executionEnvironment)
    ) {
      throw new Error(
        'In-source test discovery does not match the selected Node source bytes'
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
      runtimeEnv: dev,
      ...(configuredCompilerAliases
        ? {
            aliasFinds: configuredCompilerAliases.entries.map(
              (mapping) => mapping.find
            ),
          }
        : {}),
      environment: 'node',
    })
    signal.throwIfAborted()
    await mkdir(dirname(distDir), { recursive: true })
    const revision = randomUUID()
    const allocation = configuredArtifactAllocator
      ? await Reflect.apply(configuredArtifactAllocator, options, [
          dirname(distDir),
        ])
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
    if (!configuredArtifactAllocator) {
      directories.add(staging)
      directories.add(rootDir)
    }
    let published = false
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
      const files = [
        ...new Set([
          ...output.serverPaths.map((item) => item.path),
          ...output.clientPaths,
        ]),
      ].sort()
      for (const required of [output.entryPath]) {
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
      if (usesInSource) {
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
      // As in the dev server output directory, emitted Node chunks are CJS even
      // when the application's package.json declares type: module.
      if (!files.includes('package.json')) {
        await writeFile(join(staging, 'package.json'), '{"type":"commonjs"}')
        files.push('package.json')
        files.sort()
      }
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
      await rename(staging, rootDir)
      published = true
      directories.delete(staging)
      if (!configuredArtifactAllocator) directories.add(rootDir)
      await materializeExternalLayout(rootDir, files, nativeId)
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
        entryId: entry.id,
        setupFiles: [...setupFiles],
        snapshotSerializers: [...snapshotSerializers],
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
      const artifact: CompiledTestArtifact = {
        ...common,
        kind: 'node',
        ...(configuredCompilerEnvKeys && !dependencyPlan && !cohortInputs
          ? {
              compilerEnvKeys: {
                version: 1 as const,
                names: compilation.nodejsDefineEnvKeys!,
              },
            }
          : {}),
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
        profile: { ...profile, environment: 'node' },
      }
      signal.throwIfAborted()
      return artifact
    } catch (error) {
      if (!configuredArtifactAllocator) {
        await rm(staging, { recursive: true, force: true })
        directories.delete(staging)
        if (published) {
          await rm(rootDir, { recursive: true, force: true })
          directories.delete(rootDir)
        }
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
