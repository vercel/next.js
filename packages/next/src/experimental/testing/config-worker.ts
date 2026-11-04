import {
  finishCustomReporterProcess,
  type CustomReporterFinalExit,
} from './reporting/custom-reporter-exit'
import { createCustomReporterRuntime } from './reporting/custom-reporter-runtime'
import {
  retainWatchTriggers,
  evaluateWatchTriggers,
  type RetainedWatchTriggers,
} from './config-watch-triggers'
import { prepareCompilerAliases } from './compiler/aliases'
import { prepareProjectFakeTimers } from './config-fake-timers'
import { MessageChannel } from 'node:worker_threads'
import { randomUUID } from 'node:crypto'
import { validateTestConfigCompilerOptions } from './config'
import {
  retainCompilerTransforms,
  runCompilerTransforms,
  type RetainedCompilerTransforms,
} from './compiler/transform-hooks'
import Module, { register } from 'node:module'
import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  retainCoverageThresholdFormatter,
  formatCoverageThresholdUpdates,
} from './coverage/threshold-format'
import { serializeDiagnostic } from './reporting/diagnostics'
import { publishCoverageThresholdUpdate } from './coverage/threshold-update'

async function send(message: object) {
  return new Promise<void>((resolve, reject) =>
    process.send!(message, (error: Error | null) =>
      error ? reject(error) : resolve()
    )
  )
}
let queue = Promise.resolve()
const teardowns: (() => unknown)[] = []
let setupStarted = false
let rootSetupStarted = false
let compilerTransforms: RetainedCompilerTransforms | undefined
let compilerDependencies = async (): Promise<string[]> => []
let coverageThresholdFormatter: ReturnType<
  typeof retainCoverageThresholdFormatter
>['formatter']
let configurationFile: string | undefined
let watchTriggers: RetainedWatchTriggers | undefined
let issuedWatchTriggerInputs: Set<string> | undefined
async function shutdown() {
  const errors: unknown[] = []
  for (const teardown of teardowns.splice(0).reverse()) {
    try {
      await teardown()
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length)
    throw new AggregateError(errors, 'Global setup teardown failed.')
}
let reporterRuntime: ReturnType<typeof createCustomReporterRuntime> | undefined
let finalExitPrepared = false
let finalExitStarted = false
function abandonPreparedFinalExit() {
  process.exit(1)
}
let reporterFinalExit: CustomReporterFinalExit | undefined
let initialCloseFailure: 'sync' | 'async' | undefined
let reporterId: string | undefined
let reporterUsed = false
let reporterRootShutdown: Promise<void> | undefined
let rootTeardownFailure: { error: unknown } | undefined
function shutdownReporterRoot() {
  return (reporterRootShutdown ??= shutdown())
}
function receiveReporter(message: any) {
  const id = message.reporterId
  if (
    typeof id !== 'string' ||
    !message.message ||
    typeof message.message !== 'object'
  )
    throw new Error('Invalid configuration reporter request.')
  if (!reporterRuntime) {
    if (reporterUsed || message.message.type !== 'run')
      throw new Error('Configuration reporter sub-session is unavailable.')
    reporterUsed = true
    reporterId = id
    let closePromise: Promise<void> | undefined
    const runtime = createCustomReporterRuntime({
      send: (value) =>
        send({
          type: 'config-reporter-message',
          reporterId: id,
          message: value,
        }),
      closeTransport(code) {
        const closeFailure = runtime.initialCloseFailure()
        if (code === 0 || closeFailure) {
          reporterFinalExit = runtime.finalExit()
          initialCloseFailure =
            closeFailure === 'sync'
              ? 'sync'
              : rootTeardownFailure
                ? 'async'
                : closeFailure
          // Root teardown is an already-settled close Promise. Process its
          // failure after real reporter callbacks, unless direct sync close
          // invocation transferred ownership to the force-exit path.
          if (rootTeardownFailure && closeFailure !== 'sync')
            process.exitCode = 1
        }
        return (closePromise ??= (async () => {
          try {
            await send({
              type: 'config-reporter-closed',
              reporterId: id,
              code,
              ...(closeFailure === 'sync'
                ? { initialCloseSyncFailed: true }
                : {}),
              ...(closeFailure === 'async'
                ? { initialCloseAsyncFailed: true }
                : {}),
            })
          } finally {
            process.removeListener('unhandledRejection', unhandled)
            process.removeListener('disconnect', disconnected)
            reporterRuntime = undefined
          }
        })())
      },
    })
    const unhandled = (error: unknown) => runtime.unhandledRejection(error)
    const disconnected = () => {
      void shutdownReporterRoot()
        .then(
          () => runtime.disconnect(),
          () => runtime.disconnect()
        )
        .finally(() => process.exit(1))
    }
    reporterRuntime = runtime
    process.on('unhandledRejection', unhandled)
    process.once('disconnect', disconnected)
  }
  if (id !== reporterId)
    throw new Error('Configuration reporter sub-session does not match.')
  reporterRuntime.receive(message.message)
}
function receiveConfiguration(message: any) {
  if (finalExitStarted) return
  if (
    finalExitPrepared &&
    !['finalize-process-exit', 'cancel', 'prepare-final-exit'].includes(
      message?.type
    )
  ) {
    void send({
      type: 'test-config-failed',
      error: serializeDiagnostic(
        new Error('Test configuration is prepared for final exit.'),
        { phase: 'configuration' }
      ),
    })
    return
  }
  if (message?.type === 'config-reporter-message') {
    try {
      // Reporter fast lanes enter synchronously. Resolver messages on this
      // same IPC channel therefore follow the actual collected callback entry.
      receiveReporter(message)
    } catch (error) {
      void send({
        type: 'config-reporter-message',
        reporterId: message.reporterId,
        message: {
          type: 'custom-reporter-failed',
          error: serializeDiagnostic(error, { phase: 'reporter' }),
        },
      })
    }
    return
  }
  queue = queue.then(() => handle(message))
}
process.on('message', receiveConfiguration)
async function handle(message: any) {
  if (finalExitStarted) return
  if (
    finalExitPrepared &&
    !['finalize-process-exit', 'cancel', 'prepare-final-exit'].includes(
      message?.type
    )
  ) {
    void send({
      type: 'test-config-failed',
      error: serializeDiagnostic(
        new Error('Test configuration is prepared for final exit.'),
        { phase: 'configuration' }
      ),
    })
    return
  }
  if (message?.type === 'teardown' && reporterRuntime) {
    try {
      await shutdownReporterRoot()
      await send({ type: 'test-config-result' })
    } catch (error) {
      // This exact cached close Promise settled before the same reporter's
      // callbacks. Keep its raw error separate and defer final code selection.
      if (reporterRuntime.finalExit()) rootTeardownFailure ??= { error }
      await send({
        type: 'test-config-failed',
        ...(rootTeardownFailure
          ? { reporterClosePending: true, initialRootTeardownFailed: true }
          : {}),
        error: serializeDiagnostic(error, { phase: 'configuration' }),
      })
    }
    return
  }
  if (message?.type === 'watch-triggers') {
    try {
      if (!watchTriggers)
        throw new Error(
          'No watch trigger definitions belong to this configuration.'
        )
      if (
        !Array.isArray(message.files) ||
        message.files.some(
          (file: unknown) => typeof file !== 'string' || !path.isAbsolute(file)
        )
      )
        throw new TypeError('Invalid watch trigger source paths.')
      const value = evaluateWatchTriggers(
        watchTriggers,
        process.cwd(),
        message.files
      )
      const currentInputs = new Set([
        ...(configurationFile ? [configurationFile] : []),
        ...(await compilerDependencies()),
      ])
      const watchTriggerInputsCurrent =
        issuedWatchTriggerInputs !== undefined &&
        currentInputs.size === issuedWatchTriggerInputs.size &&
        [...currentInputs].every((file) => issuedWatchTriggerInputs!.has(file))
      await send({
        type: 'test-config-result',
        value,
        watchTriggerInputsCurrent,
      })
    } catch (error) {
      await send({
        type: 'test-config-failed',
        error: serializeDiagnostic(error, { phase: 'configuration' }),
      })
    }
    return
  }

  if (message?.type === 'coverage-threshold-prepare') {
    try {
      if (!coverageThresholdFormatter)
        throw new Error(
          'No coverage threshold formatter belongs to this configuration.'
        )
      const value = await publishCoverageThresholdUpdate({
        configFile: configurationFile,
        updates: message.updates,
        formatter: coverageThresholdFormatter,
      })
      await send({ type: 'test-config-result', value })
    } catch (error) {
      const value = error instanceof Error ? error : new Error(String(error))
      await send({
        type: 'test-config-failed',
        error: serializeDiagnostic(value, { phase: 'configuration' }),
      })
    }
    return
  }
  if (message?.type === 'coverage-threshold-format') {
    try {
      const value = formatCoverageThresholdUpdates(
        coverageThresholdFormatter,
        message.updates
      )
      await send({ type: 'test-config-result', value })
    } catch (error) {
      const value = error instanceof Error ? error : new Error(String(error))
      await send({
        type: 'test-config-failed',
        error: serializeDiagnostic(value, { phase: 'configuration' }),
      })
    }
    return
  }
  if (message?.type === 'compiler-transform') {
    try {
      if (
        !compilerTransforms ||
        message.realm !== compilerTransforms.realm ||
        typeof message.id !== 'string'
      )
        throw new Error('Invalid configuration transform owner.')
      const value = await runCompilerTransforms(
        compilerTransforms,
        message.input
      )
      value.dependencies = [
        ...new Set([...value.dependencies, ...(await compilerDependencies())]),
      ]
      await send({ type: 'compiler-transform-result', id: message.id, value })
    } catch (error) {
      const value = error instanceof Error ? error : new Error(String(error))
      await send({
        type: 'compiler-transform-result',
        id: message.id,
        error: serializeDiagnostic(value, { phase: 'compilation' }),
      })
    }
    return
  }
  try {
    if (message?.type === 'teardown') {
      await shutdown()
      await send({ type: 'test-config-result' })
      return
    }
    if (message?.type === 'seed-exit-code') {
      process.exitCode = message.snapshot.value
      await send({ type: 'test-config-result' })
      return
    }
    if (message?.type === 'prepare-final-exit') {
      if (!reporterFinalExit || reporterRuntime)
        throw new Error(
          'Reporter final exit requires a completed reporter close.'
        )
      if (!finalExitPrepared) {
        try {
          await shutdownReporterRoot()
        } catch (error) {
          if (
            !rootTeardownFailure ||
            !Object.is(rootTeardownFailure.error, error)
          )
            throw error
        }
        finalExitPrepared = true
        process.once('disconnect', abandonPreparedFinalExit)
      }
      await send({
        type: 'test-config-result',
        value: {
          exitCode: process.exitCode,
          ...(initialCloseFailure === 'sync'
            ? { initialCloseSyncFailed: true }
            : {}),
          ...(initialCloseFailure === 'async'
            ? { initialCloseAsyncFailed: true }
            : {}),
        },
      })
      return
    }
    if (message?.type === 'finalize-process-exit') {
      if (!finalExitPrepared || !reporterFinalExit)
        throw new Error('Test configuration final exit was not prepared.')
      if (message.exitCode !== undefined) process.exitCode = message.exitCode
      await send({ type: 'test-config-result' })
      finalExitStarted = true
      process.removeListener('disconnect', abandonPreparedFinalExit)
      process.removeListener('message', receiveConfiguration)
      if (initialCloseFailure === 'sync') {
        process.exitCode ??= 1
        process.exit()
      }
      finishCustomReporterProcess(reporterFinalExit)
      return
    }
    if (message?.type === 'shutdown' || message?.type === 'cancel') {
      const runtime = reporterRuntime
      try {
        if (runtime) await shutdownReporterRoot()
        else await shutdown()
      } finally {
        await runtime?.disconnect()
      }
      if (message.type === 'shutdown')
        await send({ type: 'test-config-result' })
      if (message.type === 'shutdown' && reporterFinalExit) {
        finalExitStarted = true
        process.removeListener('message', receiveConfiguration)
        if (initialCloseFailure === 'sync') {
          process.exitCode ??= 1
          process.exit()
        }
        finishCustomReporterProcess(reporterFinalExit)
      } else {
        process.exit(message.type === 'cancel' ? 1 : 0)
      }
      return
    }
    if (message?.type === 'setup' || message?.type === 'setup-root') {
      if (message.type === 'setup-root') {
        if (rootSetupStarted)
          throw new Error('Root global setup has already run.')
        rootSetupStarted = true
      } else {
        if (setupStarted) throw new Error('Global setup has already run.')
        setupStarted = true
      }
      const contexts = Object.create(null)
      for (const project of message.projects) {
        const context: Record<string, unknown> = { ...project.provide }
        const provide = (key: string, value: unknown) => {
          if (typeof key !== 'string')
            throw new TypeError('Provided context keys must be strings.')
          try {
            structuredClone(value)
          } catch {
            throw new TypeError(
              `Provided context value for ${key} must be serializable.`
            )
          }
          Object.defineProperty(context, key, {
            value,
            enumerable: true,
            configurable: true,
            writable: true,
          })
        }
        const host = {
          name: project.name,
          config: project,
          provide,
          getProvidedContext: () => ({
            ...project.inheritedProvide,
            ...context,
          }),
        }
        for (const filename of project.globalSetup) {
          const imported = await import(
            pathToFileURL(path.resolve(filename)).href
          )
          const module =
            imported.default && typeof imported.default === 'object'
              ? imported.default
              : imported
          for (const name of ['default', 'setup', 'teardown']) {
            if (
              module[name] !== undefined &&
              typeof module[name] !== 'function'
            )
              throw new TypeError(
                `Global setup ${name} export must be a function.`
              )
          }
          if (module.default) {
            const cleanup = await module.default(host)
            if (cleanup !== undefined && typeof cleanup !== 'function')
              throw new TypeError(
                'Global setup default must return a function or undefined.'
              )
            if (cleanup) teardowns.push(cleanup)
          } else {
            if (!module.setup && !module.teardown)
              throw new Error(
                'Global setup must export default, setup, or teardown.'
              )
            await module.setup?.(host)
            if (module.teardown) teardowns.push(module.teardown)
          }
        }
        contexts[project.name] = context
      }
      await send({ type: 'test-config-result', value: contexts })
      return
    }
    if (message?.type !== 'run')
      throw new Error('Invalid configuration request.')
    const { file, persistent, projectConfig } = message.input
    configurationFile = file
    // These hooks exist only in the owned configuration realm.
    // Node's async ESM hooks do not intercept ordinary CommonJS require calls.
    const nodeModule = Module as unknown as {
      _resolveFilename: (...args: any[]) => string
    }
    const originalResolve = nodeModule._resolveFilename
    const localDependencies = new Set<string>(file ? [realpathSync(file)] : [])
    const ownedConfigFiles = new Set(localDependencies)
    nodeModule._resolveFilename = function (
      specifier: string,
      ...args: unknown[]
    ) {
      if (specifier === 'vitest/config' || specifier === 'vite')
        return require.resolve('./config-api')
      if (
        specifier === 'vitest' ||
        specifier.startsWith('vitest/') ||
        specifier.startsWith('vite/')
      )
        throw new Error(
          `Test configuration cannot load the ${specifier} runner/controller. Use the inert vitest/config adapter.`
        )
      const resolved = originalResolve.call(this, specifier, ...args)
      const parent = args[0] as { filename?: string } | undefined
      if (
        parent?.filename &&
        ownedConfigFiles.has(parent.filename) &&
        path.isAbsolute(resolved)
      ) {
        localDependencies.add(resolved)
        ownedConfigFiles.add(resolved)
      }
      return resolved
    }
    const swc = require('../../build/swc') as typeof import('../../build/swc')
    await swc.loadBindings()
    for (const extension of [
      '.ts',
      '.cts',
      '.mts',
      '.cjs',
      '.mjs',
      '.tsx',
      '.jsx',
    ]) {
      require.extensions[extension] = (mod: any, filename: string) => {
        const source = readFileSync(filename, 'utf8')
        const syntax = /\.(?:[cm]?ts|tsx)$/.test(filename)
          ? 'typescript'
          : 'ecmascript'
        const result = swc.transformSync(source, {
          filename,
          sourceMaps: 'inline',
          jsc: {
            target: 'es2022',
            parser: {
              syntax,
              tsx: filename.endsWith('.tsx'),
              jsx: filename.endsWith('.jsx'),
            },
          },
          module: { type: 'commonjs', ignoreDynamic: true },
        })
        mod._compile(result.code, filename)
      }
    }
    const loader = pathToFileURL(require.resolve('./config-loader')).href
    const shim = `import hooks from ${JSON.stringify(loader)};export const initialize=hooks.initialize,resolve=hooks.resolve,load=hooks.load;`
    const { port1, port2 } = new MessageChannel()
    const snapshots = new Map<string, (files: string[]) => void>()
    port1.on('message', (snapshot: { id: string; files: string[] }) => {
      snapshots.get(snapshot.id)?.(snapshot.files)
      snapshots.delete(snapshot.id)
    })
    port1.unref()
    compilerDependencies = async () => {
      const files = await new Promise<string[]>((resolve) => {
        const id = randomUUID()
        snapshots.set(id, resolve)
        port1.postMessage(id)
      })
      return [...new Set([...localDependencies, ...files])]
    }
    register(
      `data:text/javascript,${encodeURIComponent(shim)}`,
      pathToFileURL(__filename).href,
      {
        parentURL: pathToFileURL(__filename).href,
        data: {
          entry: file,
          apiPath: require.resolve('./config-api'),
          dependencyPort: port2,
        },
        transferList: [port2],
      }
    )
    const imported = file
      ? await import(pathToFileURL(file).href)
      : { default: {} }
    const exported = imported.default ?? imported
    const value = await (typeof exported === 'function'
      ? exported({
          command: 'serve',
          mode: 'test',
          isSsrBuild: false,
          isPreview: false,
        })
      : exported)
    const prepared = retainCompilerTransforms(value)
    const coverage = retainCoverageThresholdFormatter(
      prepared.value,
      projectConfig === true
    )
    coverageThresholdFormatter = coverage.formatter
    const mapped = prepareCompilerAliases(coverage.value)
    const triggers = retainWatchTriggers(mapped.value, projectConfig === true)
    watchTriggers = triggers.retained
    validateTestConfigCompilerOptions(
      triggers.value,
      projectConfig === true ? { projectConfig: true } : undefined
    )
    compilerTransforms = prepared.retained
    issuedWatchTriggerInputs = watchTriggers
      ? new Set([...(file ? [file] : []), ...(await compilerDependencies())])
      : undefined
    const loadedConfiguration = {
      type: 'test-config-loaded',
      value: triggers.value,
      ...(watchTriggers
        ? {
            watchTriggers: {
              inputs: [...issuedWatchTriggerInputs!],
            },
          }
        : {}),
      ...(coverageThresholdFormatter
        ? { coverageThresholdFormatter: true }
        : {}),
      ...(mapped.aliases
        ? {
            compilerAliases: {
              ...mapped.aliases,
              inputs: await compilerDependencies(),
            },
          }
        : {}),
      ...(compilerTransforms
        ? {
            compilerTransforms: {
              realm: compilerTransforms.realm,
              names: compilerTransforms.hooks.map((plugin) => plugin.name),
              dependencies: await compilerDependencies(),
            },
          }
        : {}),
    }
    loadedConfiguration.value = prepareProjectFakeTimers(
      loadedConfiguration.value,
      projectConfig === true
    )
    await send(loadedConfiguration)
    if (!persistent) process.exit(0)
  } catch (error) {
    if (
      (message?.type === 'setup' || message?.type === 'setup-root') &&
      reporterRuntime?.finalExit()
    ) {
      // The real setup request has failed, but this same root reporter still
      // owns its ordinary close. Leave teardown/close to that existing owner.
      process.exitCode = 1
      await send({
        type: 'test-config-failed',
        reporterClosePending: true,
        error: serializeDiagnostic(error, { phase: 'configuration' }),
      })
      return
    }
    let value = error instanceof Error ? error : new Error(String(error))
    try {
      await shutdown()
    } catch (cleanupError) {
      value = new AggregateError(
        [value, cleanupError],
        `${value.message}; global setup teardown failed.`
      )
    }
    await send({
      type: 'test-config-failed',
      error: serializeDiagnostic(value, {
        phase:
          message?.type === 'shutdown' || message?.type === 'teardown'
            ? 'cleanup'
            : 'configuration',
      }),
    }).catch(() => {})
    process.exit(1)
  }
}
