import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import NodeModule from 'node:module'
import { extname, isAbsolute, join, resolve, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { CompiledTestArtifact, ExecuteTestOptions } from '../contracts'
import type {
  CustomCoverageCompletion,
  CustomCoverageIdentity,
  CustomCoverageRequest,
  RuntimeCoverageModule,
} from './custom-types'

export async function resolveCustomCoverageProvider(
  projectDir: string,
  name: string
): Promise<CustomCoverageIdentity> {
  const consumer = createRequire(join(projectDir, 'package.json'))
  const file = await realpath(consumer.resolve(name))
  if (
    !['.js', '.mjs', '.cjs'].includes(extname(file)) ||
    !(await stat(file)).isFile()
  )
    throw new Error(
      'Custom coverage providers must be real JavaScript modules resolved from the consumer.'
    )
  return {
    file,
    sha256: createHash('sha256')
      .update(await readFile(file))
      .digest('hex'),
  }
}
export async function assertCustomProviderIdentity(
  identity: CustomCoverageIdentity
) {
  if (
    !identity ||
    !isAbsolute(identity.file) ||
    !/^[a-f0-9]{64}$/.test(identity.sha256) ||
    (await realpath(identity.file)) !== identity.file ||
    createHash('sha256')
      .update(await readFile(identity.file))
      .digest('hex') !== identity.sha256
  )
    throw new Error(
      'Custom coverage provider identity changed after initialization.'
    )
}
interface ProviderLoaderHooks {
  deregister(): void
}
interface ProviderLoaderAPI {
  registerHooks?: (hooks: {
    resolve(
      specifier: string,
      context: { parentURL?: string },
      nextResolve: (
        specifier: string,
        context: { parentURL?: string }
      ) => { url: string }
    ): { url: string }
  }) => ProviderLoaderHooks
}
/** Reject helper modules through the actual Node loader, without transforming code. */
function restrictProviderImports(identity: CustomCoverageIdentity) {
  const api = NodeModule as unknown as ProviderLoaderAPI
  if (typeof api.registerHooks !== 'function')
    throw new Error(
      'Custom coverage requires synchronous Node module hooks; this runtime cannot certify provider imports.'
    )
  const entry = pathToFileURL(identity.file).href
  return api.registerHooks({
    resolve(specifier, context, nextResolve) {
      const result = nextResolve(specifier, context)
      if (
        context.parentURL === entry &&
        result.url !== entry &&
        !result.url.startsWith('node:')
      )
        throw new Error(
          'Custom coverage provider helper imports are unqualified; use a single JavaScript provider entry and Node builtins.'
        )
      return result
    },
  })
}
export async function loadCustomCoverageModule(
  identity: CustomCoverageIdentity
) {
  await assertCustomProviderIdentity(identity)
  // This module is loaded only in a fresh provider host or file worker. Keep
  // the provenance gate installed through late tasks until that realm exits.
  restrictProviderImports(identity)
  {
    const imported = await import(pathToFileURL(identity.file).href)
    const module = imported.default
    if (
      !module ||
      typeof module !== 'object' ||
      ['getProvider', 'startCoverage', 'takeCoverage', 'stopCoverage'].some(
        (key) => typeof module[key] !== 'function'
      )
    )
      throw new Error(
        'Custom coverage requires a default provider module with getProvider/startCoverage/takeCoverage/stopCoverage hooks.'
      )
    await assertCustomProviderIdentity(identity)
    return {
      module: module as RuntimeCoverageModule,
    }
  }
}
export function assertCustomCoverageRequest(
  artifact: CompiledTestArtifact,
  options: Pick<
    ExecuteTestOptions,
    | 'customCoverage'
    | 'onCustomCoverage'
    | 'coverage'
    | 'collectOnly'
    | 'entry'
    | 'snapshotUpdateMode'
    | 'updateSnapshots'
  >
) {
  const request = options.customCoverage
  if (!request) {
    if (options.onCustomCoverage)
      throw new Error('Custom coverage callback requires a request.')
    return
  }
  if (
    request.version !== 1 ||
    request.kind !== 'custom' ||
    options.coverage ||
    options.collectOnly ||
    artifact.kind !== 'node' ||
    artifact.profile.environment !== 'node' ||
    artifact.profile.mode !== 'development' ||
    artifact.profile.route !== undefined ||
    artifact.moduleMocking ||
    artifact.moduleCache ||
    artifact.cohort ||
    options.entry.executionEnvironment ||
    options.snapshotUpdateMode === 'all' ||
    (options.updateSnapshots && options.snapshotUpdateMode === undefined) ||
    !isAbsolute(request.coverageFilesDirectory) ||
    !isAbsolute(request.reportsDirectory) ||
    typeof options.onCustomCoverage !== 'function'
  )
    throw new Error(
      'Custom coverage requires an isolated unmocked development Node file and an awaited parent consumer.'
    )
}
export function assertCustomCoverageCompletion(
  value: unknown,
  artifact: CompiledTestArtifact,
  runId: string,
  request: CustomCoverageRequest
): asserts value is CustomCoverageCompletion {
  if (!value || typeof value !== 'object')
    throw new Error('Missing custom coverage completion.')
  const fact = value as CustomCoverageCompletion
  if (
    fact.version !== 1 ||
    fact.kind !== 'custom' ||
    fact.runId !== runId ||
    fact.entryId !== artifact.entryId ||
    fact.revision !== artifact.revision ||
    fact.provider?.file !== request.provider.file ||
    fact.provider?.sha256 !== request.provider.sha256
  )
    throw new Error('Mismatched custom coverage completion identity.')
  if (fact.complete === true) {
    if (!Object.hasOwn(fact, 'payload') || 'error' in fact)
      throw new Error('Invalid custom coverage payload.')
  } else if (fact.complete === false) {
    if (
      !fact.error ||
      typeof fact.error.message !== 'string' ||
      'payload' in fact
    )
      throw new Error('Invalid incomplete custom coverage completion.')
  } else throw new Error('Invalid custom coverage completeness.')
}

/** The actual file worker owns start/take/stop; no compiler/controller owns evaluation. */
export async function startCustomCoverage(request: CustomCoverageRequest) {
  const loaded = await loadCustomCoverageModule(request.provider)
  const module = loaded.module
  let stopped = false
  const dispose = async () => {
    if (stopped) return
    stopped = true
    await module.stopCoverage({ isolate: true })
    await assertCustomProviderIdentity(request.provider)
  }
  try {
    await module.startCoverage({
      isolate: true,
      autoAttachSubprocess: false,
      reportsDirectory: request.reportsDirectory,
    })
    await assertCustomProviderIdentity(request.provider)
    return {
      async take() {
        const payload = await module.takeCoverage({
          coverageFilesDirectory: request.coverageFilesDirectory,
        })
        structuredClone(payload)
        await assertCustomProviderIdentity(request.provider)
        return payload
      },
      dispose,
    }
  } catch (error) {
    try {
      await dispose()
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        'Custom coverage startup and cleanup failed.'
      )
    }
    throw error
  }
}

/** Bind opaque collection to the exact immutable output and original entry. */
export async function captureCustomCoverageClosure(
  artifact: CompiledTestArtifact,
  entry: ExecuteTestOptions['entry']
) {
  if (!artifact.sourceHash || !/^[a-f0-9]{64}$/.test(artifact.sourceHash))
    throw new Error('Custom coverage requires compiler-issued source identity.')
  const source = await realpath(entry.file)
  const sourceDigest = createHash('sha256')
    .update(await readFile(source))
    .digest('hex')
  if (sourceDigest !== artifact.sourceHash)
    throw new Error('Custom coverage source changed after compilation.')
  const root = await realpath(artifact.rootDir)
  const files = new Map<string, string>([[source, sourceDigest]])
  const aliases = new Map<string, string>([
    [entry.file, source],
    [artifact.rootDir, root],
  ])
  for (const name of artifact.files) {
    const original = resolve(artifact.rootDir, name)
    const file = await realpath(original)
    aliases.set(original, file)
    const local = relative(root, file)
    if (
      isAbsolute(name) ||
      !local ||
      local === '..' ||
      local.startsWith(`..${sep}`) ||
      isAbsolute(local) ||
      files.has(file)
    )
      throw new Error(
        'Custom coverage requires unique contained emitted files.'
      )
    files.set(
      file,
      createHash('sha256')
        .update(await readFile(file))
        .digest('hex')
    )
  }
  return async () => {
    for (const [alias, file] of aliases)
      if ((await realpath(alias)) !== file)
        throw new Error(
          'Custom coverage source or emitted path was retargeted during execution.'
        )
    for (const [file, sha256] of files)
      if (
        (await realpath(file)) !== file ||
        createHash('sha256')
          .update(await readFile(file))
          .digest('hex') !== sha256
      )
        throw new Error(
          'Custom coverage source or emitted bytes changed during execution.'
        )
  }
}
