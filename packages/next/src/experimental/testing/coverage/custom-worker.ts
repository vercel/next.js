import { resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { coverageConfigDefaults } from '../config-api'
import { serializeDiagnostic } from '../reporting/diagnostics'
import {
  loadCustomCoverageModule,
  assertCustomProviderIdentity,
} from './custom-runtime'
import type {
  CustomCoverageConfig,
  CustomCoverageIdentity,
  CustomCoverageProvider,
  CustomCoverageFact,
} from './custom-types'

interface Input {
  projectDir: string
  config: CustomCoverageConfig
  provider: CustomCoverageIdentity
}
let input: Input | undefined
let provider: CustomCoverageProvider | undefined
let started = false
let finished = false
let failed = false
let queue = Promise.resolve()
const suites = new Map<string, CustomCoverageFact>()
function send(message: unknown) {
  return new Promise<void>((resolveSend, reject) => {
    if (!process.send)
      return reject(new Error('Custom coverage host requires IPC.'))
    process.send(message, (error: Error | null) =>
      error ? reject(error) : resolveSend()
    )
  })
}
async function fail(error: unknown) {
  if (failed) return
  failed = true
  process.exitCode = 1
  await send({
    type: 'custom-coverage-failed',
    error: serializeDiagnostic(error, { phase: 'runtime' }),
  }).catch(() => {})
  process.disconnect?.()
  process.exit(1)
}
function unavailable(target: object) {
  return new Proxy(target, {
    get(value, key, receiver) {
      if (!Reflect.has(value, key))
        throw new Error(
          `Custom coverage provider requires unavailable controller service: ${String(key)}`
        )
      return Reflect.get(value, key, receiver)
    },
  })
}
async function initialize(value: Input) {
  if (started) throw new Error('Custom coverage host already initialized.')
  started = true
  input = value
  const { module } = await loadCustomCoverageModule(value.provider)
  const instance = await module.getProvider()
  if (!instance || typeof instance !== 'object')
    throw new Error('Custom coverage getProvider must return a real provider.')
  provider = instance as CustomCoverageProvider
  for (const key of [
    'initialize',
    'resolveOptions',
    'clean',
    'onAfterSuiteRun',
    'generateCoverage',
    'reportCoverage',
  ] as const)
    if (typeof provider[key] !== 'function')
      throw new Error(`Custom coverage provider requires ${key}.`)
  if ('onFileTransform' in provider || 'requiresTransform' in provider)
    throw new Error(
      'Custom coverage transforms require an unqualified compiler integration.'
    )
  const coverage = {
    ...coverageConfigDefaults,
    ...value.config,
    reportsDirectory: resolve(value.projectDir, value.config.reportsDirectory),
  }
  // This boundary exposes actual supported configuration. Access to compiler,
  // Vite or Vitest controller services fails before any test is evaluated.
  await provider.initialize(
    unavailable({ config: unavailable({ root: value.projectDir, coverage }) })
  )
  const options = provider.resolveOptions() as
    | Record<string, unknown>
    | undefined
  if (
    !options ||
    options.provider !== 'custom' ||
    options.enabled !== true ||
    options.reportsDirectory !== coverage.reportsDirectory
  )
    throw new Error(
      'Custom coverage provider must preserve enabled/custom and resolved reportsDirectory options.'
    )
  await provider.clean(value.config.clean)
  await provider.onTestRunStart?.()
  await assertCustomProviderIdentity(value.provider)
  await send({
    type: 'custom-coverage-ready',
    reportsDirectory: coverage.reportsDirectory,
  })
}
async function afterSuite(fact: CustomCoverageFact) {
  if (!input || !provider || finished || failed)
    throw new Error('Custom coverage host cannot receive a suite.')
  if (
    !fact?.completion?.complete ||
    suites.has(fact.completion.entryId) ||
    fact.completion.provider.file !== input.provider.file ||
    fact.completion.provider.sha256 !== input.provider.sha256
  )
    throw new Error('Invalid or duplicate custom coverage suite.')
  await assertCustomProviderIdentity(input.provider)
  // Preserve the original handoff for final closure validation even if the
  // provider mutates its own payload or testFiles during this hook.
  suites.set(fact.completion.entryId, structuredClone(fact))
  await provider.onAfterSuiteRun({
    coverage: fact.completion.payload,
    testFiles: fact.testFiles,
    environment: fact.environment,
    ...(fact.projectName === undefined
      ? {}
      : { projectName: fact.projectName }),
  })
  await assertCustomProviderIdentity(input.provider)
}
async function finish(
  facts: CustomCoverageFact[],
  status: 'passed' | 'failed',
  allTestsRun: boolean
) {
  if (!input || !provider || finished || failed)
    throw new Error('Custom coverage host cannot finish.')
  if (suites.size) {
    if (
      facts.length !== suites.size ||
      new Set(facts.map((fact) => fact.completion.entryId)).size !==
        facts.length ||
      facts.some(
        (fact) => !isDeepStrictEqual(suites.get(fact.completion.entryId), fact)
      )
    )
      throw new Error(
        'Custom coverage suite lacks matching closed-worker facts.'
      )
  } else {
    for (const fact of facts) await afterSuite(fact)
  }
  finished = true
  await assertCustomProviderIdentity(input.provider)
  if (status === 'failed') await provider.onTestFailure?.()
  const coverage = await provider.generateCoverage({ allTestsRun })
  await assertCustomProviderIdentity(input.provider)
  if (status === 'passed' || input.config.reportOnFailure)
    await provider.reportCoverage(coverage, { allTestsRun })
  await assertCustomProviderIdentity(input.provider)
  await new Promise<void>((resolveTurn) => setImmediate(resolveTurn))
  if (failed) throw new Error('Custom coverage host reported a late failure.')
  await send({ type: 'custom-coverage-finished' })
}
process.on('message', (message: any) => {
  if (message?.type === 'cancel') {
    // The owner reclaims the process group; cancellation never generates reports.
    process.exitCode = 1
    process.disconnect?.()
    process.exit(1)
  }
  queue = queue
    .then(async () => {
      if (failed) return
      if (message?.type === 'run') await initialize(message.input)
      else if (message?.type === 'custom-coverage-suite') {
        await afterSuite(message.fact)
        await send({ type: 'custom-coverage-suite-received' })
      } else if (message?.type === 'custom-coverage-finish')
        await finish(message.facts, message.status, message.allTestsRun)
      else if (message?.type === 'shutdown') {
        await assertCustomProviderIdentity(input!.provider)
        await send({ type: 'custom-coverage-closed' })
        process.disconnect?.()
        process.exit(0)
      } else throw new Error('Unexpected custom coverage command.')
    })
    .catch(fail)
})
process.on('unhandledRejection', fail)
process.on('uncaughtException', fail)
