import {
  createPreparedConfigFinalExit,
  type PreparedConfigFinalExit,
} from './config-final-exit'
import type { WatchTriggerMatch } from './config-watch-triggers'
import type { CompilerAliases } from './compiler/aliases'
import { runTestProcess } from './execution/process'
import { createConfigReporterTransport } from './config-reporter-transport'
import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import globOriginal from 'next/dist/compiled/glob'
import type { TestConfig, TestProjectConfig } from './config'
import { assignBrowserInstanceIds } from './browser-instances'
import { inheritGlobalTestSequence } from './runner/sequence'
import { preflightProjectSnapshotFormat } from './snapshot-format'
import { randomUUID } from 'node:crypto'
import { openCompilerTransformBroker } from './compiler/transform-broker'
import type {
  CompilerTransformInput,
  CompilerTransformResult,
} from './compiler/transform-hooks'
import type { StandardCoverageThresholdUpdate } from './coverage/types'

interface SetupProject {
  name: string
  globalSetup: string[]
  provide: Record<string, unknown>
  inheritedProvide?: Record<string, unknown>
}

interface RemoteError {
  name?: string
  message: string
  stack?: string
  errors?: RemoteError[]
  cause?: RemoteError
}
function remoteError(value: RemoteError): Error {
  const options = value.cause ? { cause: remoteError(value.cause) } : undefined
  const error = value.errors
    ? new AggregateError(value.errors.map(remoteError), value.message, options)
    : new Error(value.message, options)
  error.name = value.name ?? 'Error'
  error.stack = value.stack
  return error
}

/** A configuration realm lives until the owner has finished all test resources. */
export async function openTestConfigModule(
  file: string | undefined,
  projectDir: string,
  signal?: AbortSignal,
  context: 'root' | 'project' = 'root'
) {
  let send!: (message: unknown) => Promise<void>
  let pending:
    | {
        resolve(value: any): void
        reject(error: unknown): void
        timer?: ReturnType<typeof setTimeout>
        watchTriggers?: true
      }
    | undefined
  let preparedFinalExit: PreparedConfigFinalExit | undefined
  let preparingFinalExit: Promise<PreparedConfigFinalExit> | undefined
  let closing = false
  let closed = false
  let transformsRevoked = false
  let terminalError: unknown
  let transformBroker:
    | Awaited<ReturnType<typeof openCompilerTransformBroker>>
    | undefined
  const transformInputs = new Set<string>()
  const transforms = new Map<
    string,
    {
      resolve(value: CompilerTransformResult): void
      reject(error: unknown): void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  function rejectTransforms(error: unknown) {
    for (const transform of transforms.values()) {
      clearTimeout(transform.timer)
      transform.reject(error)
    }
    transforms.clear()
  }
  let requestIdle: Promise<void> = Promise.resolve()
  let watchTriggerQueue: Promise<void> = Promise.resolve()
  let watchTriggersRevoked = false
  let watchTriggerInputsCurrent: boolean | undefined
  let revokeWatchTriggers!: () => void
  const watchTriggersClosed = new Promise<void>((resolve) => {
    revokeWatchTriggers = resolve
  })
  let ownerSignal = signal
  let reporterTransport:
    | ReturnType<typeof createConfigReporterTransport>
    | undefined
  const controller = new AbortController()
  const cancel = () => controller.abort(ownerSignal?.reason)
  if (ownerSignal?.aborted) cancel()
  else ownerSignal?.addEventListener('abort', cancel, { once: true })
  const request = (
    message: object,
    timeoutMs = 120000,
    final = false
  ): Promise<any> => {
    if (pending || (closing && !final) || closed)
      return Promise.reject(
        terminalError ?? new Error('Test configuration session is unavailable.')
      )
    const result = new Promise<any>((resolve, reject) => {
      pending = {
        resolve,
        reject,
        ...('type' in message && message.type === 'watch-triggers'
          ? { watchTriggers: true as const }
          : {}),
        timer: setTimeout(
          () =>
            controller.abort(
              new Error('Test configuration request timed out.')
            ),
          timeoutMs
        ),
      }
      send(message).catch((error) => {
        clearTimeout(pending?.timer)
        pending = undefined
        reject(error)
        controller.abort(error)
      })
    })
    // Evaluator requests wait for the actual ordinary request to settle. The
    // original caller retains its result/rejection and existing busy behavior.
    requestIdle = result.then(
      () => {},
      () => {}
    )
    return result
  }
  // The initial response arrives asynchronously, after onReady has installed send.
  const loaded = new Promise<unknown>((resolve, reject) => {
    pending = { resolve, reject }
  })
  const exit = runTestProcess(require.resolve('./config-worker'), {
    cwd: projectDir,
    env: process.env,
    input: {
      file,
      persistent: true,
      ...(context === 'project' ? { projectConfig: true } : {}),
    },
    signal: controller.signal,
    shutdownGraceMs: 10000,
    onReady(value) {
      send = value
    },
    onMessage(message: any) {
      if (reporterTransport?.onMessage(message)) return
      if (message?.type === 'compiler-transform-result') {
        const response = transforms.get(message.id)
        if (!response) {
          if (closing || transformsRevoked || controller.signal.aborted) return
          throw new Error('Unexpected compiler transform response.')
        }
        transforms.delete(message.id)
        clearTimeout(response.timer)
        if (message.error) response.reject(remoteError(message.error))
        else {
          for (const dependency of message.value.dependencies)
            transformInputs.add(dependency)
          response.resolve(message.value)
        }
        return
      }
      if (!pending) {
        if (message?.type === 'test-config-failed') {
          terminalError ??= remoteError(message.error)
          controller.abort(terminalError)
          return
        }
        throw new Error('Unexpected test configuration response.')
      }
      const response = pending
      if (response.watchTriggers)
        watchTriggerInputsCurrent =
          watchTriggerInputsCurrent === false
            ? false
            : message.watchTriggerInputsCurrent === true
      clearTimeout(response.timer)
      pending = undefined
      if (message?.type === 'test-config-failed') {
        response.reject(remoteError(message.error))
      } else if (
        message?.type === 'test-config-loaded' ||
        message?.type === 'test-config-result'
      ) {
        response.resolve(
          message.type === 'test-config-loaded'
            ? {
                value: message.value,
                compilerTransforms: message.compilerTransforms,
                compilerAliases: message.compilerAliases,
                coverageThresholdFormatter: message.coverageThresholdFormatter,
                watchTriggers: message.watchTriggers,
              }
            : message.value
        )
      } else {
        response.reject(new Error('Invalid test configuration response.'))
        throw new Error('Invalid test configuration response.')
      }
    },
    onOutput(stream, chunk) {
      if (reporterTransport?.onOutput(stream, chunk)) return
      ;(stream === 'stdout' ? process.stdout : process.stderr).write(chunk)
    },
  }).then(
    (result) => {
      closed = true
      void transformBroker?.dispose().catch(() => {})
      rejectTransforms(new Error('Configuration transform owner exited.'))
      if (
        !preparedFinalExit &&
        !(result.reason === 'cancelled' && ownerSignal?.aborted) &&
        (result.reason !== 'exit' || result.code !== 0 || !closing)
      )
        terminalError ??= new Error(
          `Test configuration session ended unexpectedly (${result.reason}).`
        )
      clearTimeout(pending?.timer)
      pending?.reject(
        terminalError ??
          (ownerSignal?.aborted
            ? ownerSignal.reason
            : new Error('Test configuration closed.'))
      )
      pending = undefined
      return result
    },
    (error) => {
      terminalError = error
      closed = true
      void transformBroker?.dispose().catch(() => {})
      rejectTransforms(error)
      clearTimeout(pending?.timer)
      pending?.reject(error)
      pending = undefined
    }
  )
  const reporterSession = createConfigReporterTransport({
    send: (message) => send(message),
    exit,
    available: () =>
      context === 'root' && !closing && !closed && !controller.signal.aborted,
    abort: (error) => controller.abort(error),
  })
  reporterTransport = reporterSession
  let inputsClosed: Promise<void> | undefined
  let inputsFailed = false
  let inputFailure: unknown
  let disposingModule: Promise<void> | undefined
  function closeInputs() {
    return (inputsClosed ??= (async () => {
      if (reporterSession.active && !controller.signal.aborted)
        controller.abort(
          new Error('Configuration disposed before its reporters closed.')
        )
      watchTriggersRevoked = true
      revokeWatchTriggers()
      transformsRevoked = true
      try {
        await transformBroker?.dispose()
      } catch (error) {
        inputsFailed = true
        inputFailure = error
        terminalError ??= error
      }
      rejectTransforms(new Error('Configuration transform owner closed.'))
      if (ownerSignal?.aborted && !closed) {
        closing = true
        controller.abort(ownerSignal.reason)
      }
      await watchTriggerQueue
    })())
  }
  function prepareFinalExit(
    beforeClose?: () => Promise<void>,
    options: { initialClose?: true } = {}
  ) {
    if (preparingFinalExit) return preparingFinalExit
    if (disposingModule) {
      return disposingModule.then(() => {
        throw new Error('Test configuration disposal has already started.')
      })
    }
    return (preparingFinalExit ??= (async () => {
      try {
        if (context !== 'root' || reporterSession.active)
          throw new Error(
            'Final exit requires a closed root reporter sub-session.'
          )
        let initialCloseFailure: { error: unknown } | undefined
        try {
          await beforeClose?.()
        } catch (error) {
          if (!options.initialClose) throw error
          initialCloseFailure = { error }
        }
        await closeInputs()
        if (controller.signal.aborted) throw controller.signal.reason
        if (inputsFailed) throw inputFailure
        if (terminalError) throw terminalError
        const receipt = await request({ type: 'prepare-final-exit' }, 10000)
        if (
          initialCloseFailure &&
          receipt?.initialCloseSyncFailed !== true &&
          receipt?.initialCloseAsyncFailed !== true
        )
          throw initialCloseFailure.error
        closing = true
        preparedFinalExit = createPreparedConfigFinalExit({
          exitCode: receipt?.exitCode,
          // A later direct reporter throw wins over an earlier global teardown
          // error, just as the reference's aborted direct callback map does.
          ...(initialCloseFailure && receipt?.initialCloseSyncFailed !== true
            ? { initialCloseFailure }
            : {}),
          request: (message) => request(message, 10000, true),
          exit: exit.then((result) => {
            ownerSignal?.removeEventListener('abort', cancel)
            if (!result) throw terminalError
            return result
          }),
          isClosed: () => closed,
          abort: (reason) => controller.abort(reason),
        })
        return preparedFinalExit
      } catch (error) {
        closing = true
        controller.abort(error)
        try {
          await exit
        } catch {
        } finally {
          ownerSignal?.removeEventListener('abort', cancel)
        }
        throw error
      }
    })())
  }
  function dispose() {
    if (disposingModule) return disposingModule
    let resolve!: () => void
    let reject!: (error: unknown) => void
    // Register the first owner before entering disposal, while retaining the
    // existing synchronous revocation of watch and transform inputs.
    disposingModule = new Promise<void>((fulfilled, rejected) => {
      resolve = fulfilled
      reject = rejected
    })
    void disposeModule().then(resolve, reject)
    return disposingModule
  }
  async function disposeModule() {
    if (preparingFinalExit) {
      const prepared = await preparingFinalExit
      if (prepared.initialCloseFailure) throw prepared.initialCloseFailure.error
      return
    }
    await closeInputs()
    if (preparedFinalExit) return
    if (!closing && !closed) {
      try {
        await request({ type: 'shutdown' }, 10000)
      } catch (error) {
        if (!ownerSignal?.aborted || error !== ownerSignal.reason)
          terminalError ??= error
        controller.abort(error)
      } finally {
        closing = true
      }
    }
    await exit
    ownerSignal?.removeEventListener('abort', cancel)
    if (terminalError) throw terminalError
  }
  const deadline = setTimeout(
    () =>
      controller.abort(new Error('Test configuration evaluation timed out.')),
    120000
  )
  try {
    const result = (await loaded) as {
      value: unknown
      compilerAliases?: CompilerAliases
      coverageThresholdFormatter?: true
      watchTriggers?: { inputs: string[] }
      compilerTransforms?: {
        realm: string
        names: string[]
        dependencies: string[]
      }
    }
    if (result.compilerTransforms) {
      const realm = result.compilerTransforms.realm
      for (const dependency of result.compilerTransforms.dependencies)
        transformInputs.add(dependency)
      transformBroker = await openCompilerTransformBroker(
        realm,
        (input: CompilerTransformInput) => {
          if (
            closing ||
            closed ||
            transformsRevoked ||
            controller.signal.aborted
          )
            return Promise.reject(
              new Error('Configuration transform owner is closed.')
            )
          return new Promise<CompilerTransformResult>((resolve, reject) => {
            const id = randomUUID()
            const timer = setTimeout(() => {
              const error = new Error('Configuration transform timed out.')
              transforms.delete(id)
              reject(error)
              controller.abort(error)
            }, 30000)
            transforms.set(id, { resolve, reject, timer })
            send({ type: 'compiler-transform', id, realm, input }).catch(
              (error) => {
                clearTimeout(timer)
                transforms.delete(id)
                reject(error)
                controller.abort(error)
              }
            )
          })
        },
        {
          signal: controller.signal,
          configFile: file,
          configDependencies: [...transformInputs],
          onCancelled: () =>
            controller.abort(
              new Error(
                'Compiler transform consumer closed during its request.'
              )
            ),
        }
      )
    }
    clearTimeout(deadline)
    return {
      value: result.value,
      physicalExit: exit,
      reporterTransport: reporterSession.run,
      prepareFinalExit,
      seedExitCode: (snapshot: { value?: number | string }) =>
        request({ type: 'seed-exit-code', snapshot }),
      hasWatchTriggers: result.watchTriggers !== undefined,
      get watchTriggerInputsCurrent() {
        return watchTriggerInputsCurrent === true
      },
      get watchTriggerInputs() {
        return [...(result.watchTriggers?.inputs ?? [])]
      },
      evaluateWatchTriggers(
        files: readonly string[],
        observationSignal?: AbortSignal
      ): Promise<WatchTriggerMatch[]> {
        const inputs = [...files]
        const operation = watchTriggerQueue.then(async () => {
          let onAbort: (() => void) | undefined
          const aborted = observationSignal
            ? new Promise<void>((resolve) => {
                onAbort = resolve
                observationSignal.addEventListener('abort', onAbort, {
                  once: true,
                })
              })
            : undefined
          try {
            while (
              pending &&
              !watchTriggersRevoked &&
              !observationSignal?.aborted &&
              !closing &&
              !closed &&
              !controller.signal.aborted
            )
              await Promise.race([
                requestIdle,
                watchTriggersClosed,
                ...(aborted ? [aborted] : []),
              ])
            observationSignal?.throwIfAborted()
            if (
              !result.watchTriggers ||
              watchTriggersRevoked ||
              closing ||
              closed ||
              controller.signal.aborted
            )
              throw (
                terminalError ??
                controller.signal.reason ??
                new Error('Watch trigger configuration owner is closed.')
              )
            const matches = (await request({
              type: 'watch-triggers',
              files: inputs,
            })) as WatchTriggerMatch[]
            if (
              !Array.isArray(matches) ||
              matches.length !== inputs.length ||
              matches.some(
                (match, index) =>
                  !match ||
                  match.source !== inputs[index] ||
                  typeof match.matched !== 'boolean' ||
                  (match.matched &&
                    (!Array.isArray(match.tests) ||
                      match.tests.some(
                        (testFile) =>
                          typeof testFile !== 'string' ||
                          !path.isAbsolute(testFile)
                      )))
              )
            )
              throw new Error('Invalid watch trigger configuration response.')
            observationSignal?.throwIfAborted()
            return matches
          } finally {
            if (onAbort)
              observationSignal!.removeEventListener('abort', onAbort)
          }
        })
        watchTriggerQueue = operation.then(
          () => {},
          () => {}
        )
        return operation
      },
      compilerAliases: result.compilerAliases,
      compilerTransform: transformBroker?.descriptor,
      compilerTransformNames: result.compilerTransforms?.names ?? [],
      ...(result.coverageThresholdFormatter
        ? {
            /** Existing request name; the result is the exact already-written source. */
            prepareCoverageThresholdUpdate(
              updates: readonly StandardCoverageThresholdUpdate[]
            ): Promise<string | undefined> {
              return request({ type: 'coverage-threshold-prepare', updates })
            },
            formatCoverageThresholdUpdates(
              updates: readonly StandardCoverageThresholdUpdate[]
            ): Promise<StandardCoverageThresholdUpdate[]> {
              return request({ type: 'coverage-threshold-format', updates })
            },
          }
        : {}),
      assertReadyForCoverage() {
        if (terminalError) throw terminalError
        controller.signal.throwIfAborted()
        if (closing || closed || transformsRevoked)
          throw new Error(
            'Test configuration session is unavailable for coverage.'
          )
        if (transforms.size)
          throw new Error(
            'Compiler transform requests remain active before coverage.'
          )
      },
      get compilerTransformInputs() {
        return [...transformInputs]
      },
      retainForWatch(lifetime: AbortSignal) {
        if (closing || closed || controller.signal.aborted)
          throw new Error(
            'The retained test configuration realm is unavailable; restart test watch.'
          )
        ownerSignal?.removeEventListener('abort', cancel)
        ownerSignal = lifetime
        if (ownerSignal.aborted) cancel()
        else ownerSignal.addEventListener('abort', cancel, { once: true })
      },
      retainCompilerTransformsForWatch(lifetime: AbortSignal) {
        if (!transformBroker || closing || closed || controller.signal.aborted)
          throw new Error(
            'The retained compiler configuration realm is unavailable; restart test watch.'
          )
        ownerSignal?.removeEventListener('abort', cancel)
        ownerSignal = lifetime
        if (ownerSignal.aborted) cancel()
        else ownerSignal.addEventListener('abort', cancel, { once: true })
      },
      async setup(projects: SetupProject[]) {
        return request({ type: 'setup', projects }) as Promise<
          Record<string, Record<string, unknown>>
        >
      },
      async setupRoot(project: SetupProject) {
        const contexts = await request({
          type: 'setup-root',
          projects: [project],
        })
        return contexts[project.name] as Record<string, unknown>
      },
      async teardown() {
        await request({ type: 'teardown' }, 10000)
      },
      dispose,
    }
  } catch (error) {
    clearTimeout(deadline)
    await transformBroker?.dispose()
    controller.abort(error)
    await exit
    ownerSignal?.removeEventListener('abort', cancel)
    throw error
  }
}

type ConfigRealm = Awaited<ReturnType<typeof openTestConfigModule>>
const projectConfigPattern = /^vite(?:st)?(?:\.[\w-]+)?\.config\./
const glob = promisify(globOriginal)

/** Resolve paths without evaluating arbitrary files matched by a projects glob. */
export async function resolveTestProjectConfigs(
  definitions: unknown[],
  projectDir: string,
  signal?: AbortSignal
) {
  const files: string[] = []
  const patterns: string[] = []
  const ignored = ['**/node_modules/**', '**/*.timestamp-*', '**/.DS_Store']
  async function add(file: string, globbed = false) {
    signal?.throwIfAborted()
    const info = await stat(file)
    if (info.isDirectory()) {
      const names = new Set(await readdir(file))
      const configs = ['vitest.config', 'vite.config'].flatMap((prefix) =>
        ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs'].map(
          (ext) => prefix + ext
        )
      )
      const selected = configs.find((name) => names.has(name))
      if (!selected) {
        throw new Error(
          `Test project directory ${file} has no executable Vitest configuration. Directory-only projects need a Next compiler root and remain unsupported.`
        )
      }
      file = path.join(file, selected)
    } else if (!info.isFile()) {
      throw new TypeError(`Unexpected test project file type: ${file}`)
    }
    if (!projectConfigPattern.test(path.basename(file))) {
      throw new Error(
        `${globbed ? 'The projects glob matched' : 'Projects definition references'} ${path.relative(projectDir, file)}, which is not a Vitest/Vite project configuration. Use vitest.config.*, vite.config.*, or (vitest|vite).*.config.*.`
      )
    }
    files.push(await realpath(file))
  }
  for (const definition of definitions) {
    signal?.throwIfAborted()
    if (typeof definition !== 'string') continue
    const pattern = definition.replace('<rootDir>', projectDir)
    if (pattern.startsWith('!')) {
      ignored.push(pattern.slice(1))
    } else if (globOriginal.hasMagic(pattern)) {
      patterns.push(pattern)
    } else {
      const file = path.resolve(projectDir, pattern)
      try {
        await add(file)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(
            `Projects definition references a non-existing file or directory: ${file}`
          )
        }
        throw error
      }
    }
  }
  for (const pattern of patterns) {
    signal?.throwIfAborted()
    const matches = await glob(pattern, {
      cwd: projectDir,
      absolute: true,
      dot: true,
      nodir: false,
      ignore: ignored,
    })
    for (const file of matches.sort()) await add(file, true)
  }
  return [...new Set(files)]
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * File projects own separate configuration realms and test settings. The
 * compiler still belongs to the invoking Next application, so a differing
 * project root must remain an explicit compiler-mapping diagnostic.
 */
export async function openTestProjectModules(
  value: unknown,
  projectDir: string,
  normalize: (value: unknown) => TestConfig,
  signal?: AbortSignal
) {
  if (
    !record(value) ||
    !record(value.test) ||
    !Array.isArray(value.test.projects) ||
    !value.test.projects.some((project) => typeof project === 'string')
  ) {
    return undefined
  }
  const test = value.test
  const definitions = test.projects as unknown[]
  const { projects: _projects, globalSetup, ...defaults } = test
  const validated = normalize({ ...value, test: { ...test, projects: [{}] } })
  const compilerRoot = await realpath(projectDir)
  const realms: ConfigRealm[] = []
  const owners = new Map<string, ConfigRealm>()
  const projectRealms = new Map<TestProjectConfig, ConfigRealm>()
  const configs: TestProjectConfig[] = []
  let disposing: Promise<void> | undefined
  function dispose() {
    return (disposing ??= (async () => {
      const failures: unknown[] = []
      for (const realm of [...realms].reverse()) {
        try {
          await realm.dispose()
        } catch (error) {
          failures.push(error)
        }
      }
      if (failures.length) {
        throw new AggregateError(
          failures,
          'Test project configuration cleanup failed.'
        )
      }
    })())
  }
  try {
    // Keep object-form behavior for existing inline projects. File projects do
    // not inherit these defaults; only the root's provided context is shared.
    for (const [index, definition] of definitions.entries()) {
      if (typeof definition === 'string') continue
      const inlineProjects = normalize({
        ...value,
        test: { ...defaults, projects: [definition] },
      }).projects
      for (const inline of inlineProjects) {
        if (
          !inline.browserInstance &&
          record(definition) &&
          !(record(definition.test) ? definition.test.name : definition.name)
        ) {
          inline.profile.id = `project-${index}`
        }
        configs.push(inline)
      }
    }
    const files = await resolveTestProjectConfigs(
      definitions,
      compilerRoot,
      signal
    )
    for (const file of files) {
      signal?.throwIfAborted()
      const realm = await openTestConfigModule(
        file,
        projectDir,
        signal,
        'project'
      )
      realms.push(realm)
      const child = realm.value
      if (!record(child) || !record(child.test)) {
        // Preserve the existing compiler-option/configuration diagnostics.
        normalize(child)
        throw new Error(
          `Project configuration ${file} must export a test configuration.`
        )
      }
      const { root, ...compilerOptions } = child
      const { root: testRoot, snapshotFormat, ...settings } = child.test
      const configuredRoot = testRoot ?? root
      if (configuredRoot !== undefined && typeof configuredRoot !== 'string') {
        throw new TypeError(
          `Project configuration ${file} root must be a string.`
        )
      }
      const childRoot = await realpath(
        path.resolve(
          path.dirname(file),
          (configuredRoot as string | undefined) ?? '.'
        )
      )
      if (childRoot !== compilerRoot) {
        throw new Error(
          `Project configuration ${file} resolves root ${childRoot}, but Next application compilation is owned by ${compilerRoot}. Set root to the shared Next application root; independent compiler roots remain unsupported.`
        )
      }
      if (Array.isArray(settings.projects)) {
        throw new Error(
          `Nested project container ${file} requires a Next compiler/configuration ownership mapping and remains unsupported.`
        )
      }
      let name = settings.name
      if (name === undefined) {
        try {
          name = JSON.parse(
            await readFile(
              path.join(path.dirname(file), 'package.json'),
              'utf8'
            )
          ).name
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
        if (typeof name !== 'string' || !name)
          name = path.basename(path.dirname(file))
      }
      preflightProjectSnapshotFormat(snapshotFormat)
      const config = normalize({
        ...compilerOptions,
        test: { ...settings, name },
      })
      if (config.inspect !== undefined)
        throw new Error(
          `Project configuration ${file} cannot select inspection yet; configure inspect on the root test configuration.`
        )
      if (config.fileParallelism !== undefined)
        throw new Error(
          `Project configuration ${file} cannot select fileParallelism yet; configure it on the root test configuration.`
        )
      for (const project of config.projects) {
        project.sequence = inheritGlobalTestSequence(
          project.sequence,
          validated.projects[0].sequence
        )
        if (realm.compilerAliases)
          project.compilerAliases = realm.compilerAliases
        configs.push(project)
        projectRealms.set(project, realm)
      }
    }
    assignBrowserInstanceIds(configs)
    for (const [project, realm] of projectRealms)
      owners.set(project.profile.id, realm)
    if (!configs.length)
      throw new Error('No test projects matched the project definitions.')
    function compilerInputsForProjects(projects: readonly TestProjectConfig[]) {
      const selected = new Set(
        projects.flatMap((project) => {
          const realm = owners.get(project.profile.id)
          return realm ? [realm] : []
        })
      )
      return [
        ...new Set(
          [...selected].flatMap((realm) => [
            ...realm.compilerTransformInputs,
            ...(realm.compilerAliases?.inputs ?? []),
          ])
        ),
      ]
    }
    return {
      config: { ...validated, projects: configs },
      compilerInputsForProjects,
      /** Compiler dependencies of all configured external project owners. */
      get compilerInputs() {
        return compilerInputsForProjects(configs)
      },
      /** Exact project configuration sources, not their transitive imports. */
      get watchInputs() {
        return [
          ...new Set([
            ...files,
            ...realms.flatMap((realm) => [
              ...realm.compilerTransformInputs,
              ...(realm.compilerAliases?.inputs ?? []),
            ]),
          ]),
        ]
      },
      rootProject: {
        name: typeof test.name === 'string' ? test.name : '',
        globalSetup: validated.projects[0].globalSetup ?? [],
        provide: validated.projects[0].provide ?? {},
      },
      owns: (project: TestProjectConfig) => owners.has(project.profile.id),
      compilerTransform: (project: TestProjectConfig) =>
        owners.get(project.profile.id)?.compilerTransform,
      compilerTransformNames: realms.flatMap(
        (realm) => realm.compilerTransformNames
      ),
      async setup(projects: SetupProject[]) {
        const contexts: Record<string, Record<string, unknown>> = Object.create(
          null
        )
        for (const realm of realms) {
          const selected = projects.filter(
            (project) => owners.get(project.name) === realm
          )
          if (selected.length)
            Object.assign(contexts, await realm.setup(selected))
        }
        return contexts
      },
      assertReadyForCoverage() {
        if (disposing)
          throw new Error(
            'Test project configuration is closing before coverage.'
          )
        for (const realm of realms) realm.assertReadyForCoverage()
      },
      async teardown() {
        const failures: unknown[] = []
        for (const realm of [...realms].reverse()) {
          try {
            await realm.teardown()
          } catch (error) {
            failures.push(error)
          }
        }
        if (failures.length) {
          throw new AggregateError(
            failures,
            'Test project global teardown failed.'
          )
        }
      },
      dispose,
    }
  } catch (error) {
    try {
      await dispose()
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Test project configuration and cleanup failed.'
      )
    }
    throw error
  }
}

/** Read-only callers evaluate fresh modules and immediately reclaim the realm. */
export async function evaluateTestConfig(
  file: string,
  projectDir: string
): Promise<unknown> {
  const session = await openTestConfigModule(file, projectDir)
  try {
    return session.value
  } finally {
    await session.dispose()
  }
}
