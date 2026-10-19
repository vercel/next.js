import { createHash, randomUUID } from 'node:crypto'
import Module, { register, isBuiltin, syncBuiltinESMExports } from 'node:module'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { extname, isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { MessageChannel } from 'node:worker_threads'

interface ObservedFile {
  file: string
  sha256?: string
  error?: string
}
interface ImportEdge {
  kind: 'commonjs' | 'module'
  parent: string
  request: string
  target?: string
  error?: string
}
/** Actual loaded module files/import edges; not all effective configuration inputs. */
export interface ConfigurationImportFiles {
  version: 1
  configFile: string | null
  inputs: { file: string; sha256: string }[]
  imports: {
    kind: 'commonjs' | 'module'
    parent: string
    request: string
    target: string
  }[]
}

declare const originalObserverBrand: unique symbol
/** Original installed observer identity; never a module or conversion lease. */
export interface OriginalConfigurationObserver {
  readonly [originalObserverBrand]: true
}
export interface UnqualifiedRecordedConfigurationImports {
  version: 1
  kind: 'unqualified-recorded-configuration-imports'
  graph: ConfigurationImportFiles
}
const originalObserverTokens = new WeakMap<
  object,
  OriginalConfigurationObserver
>()
const originalObservers = new WeakMap<
  OriginalConfigurationObserver,
  {
    check: () => void
    snapshot: (configFile: string | null) => Promise<ConfigurationImportFiles>
  }
>()
const freezeOriginalObserver = Object.freeze
const statFile = lstatSync,
  readBytes = readFileSync,
  canonicalPath = realpathSync,
  newHash = createHash,
  builtin = isBuiltin

let installed: ReturnType<typeof install> | undefined
const retained = new WeakMap<object, Promise<ConfigurationImportFiles>>()

function install() {
  const files = new Map<string, ObservedFile>(),
    edges: ImportEdge[] = []
  let bookkeepingFailed = false
  const resolvedRequests = new Map<string, string>()
  const loads: { request: string; parent?: string; resolved?: string }[] = []
  function remember(file: string, code?: string) {
    try {
      const before = statFile(file, { bigint: true })
      if (!before.isFile() || canonicalPath(file) !== file)
        throw new Error('Next config import is not a canonical regular file.')
      const bytes = readBytes(file),
        after = statFile(file, { bigint: true })
      const sha256 = newHash('sha256').update(bytes).digest('hex')
      if (
        before.dev !== after.dev ||
        before.ino !== after.ino ||
        before.size !== after.size ||
        before.mtimeNs !== after.mtimeNs ||
        before.ctimeNs !== after.ctimeNs ||
        (code !== undefined &&
          newHash('sha256').update(code).digest('hex') !== sha256)
      )
        throw new Error(
          'Next config imported bytes changed or were transformed during loading.'
        )
      const previous = files.get(file)
      files.set(
        file,
        previous && previous.sha256 !== sha256
          ? {
              file,
              error:
                'Next config import was reloaded with different bytes in the retained realm.',
            }
          : { file, sha256 }
      )
      return { before, sha256 }
    } catch (error) {
      files.set(file, {
        file,
        error: error instanceof Error ? error.message : String(error),
      })
      return undefined
    }
  }
  const nodeModule = Module as unknown as {
    _load: Function
    _resolveFilename: Function
    prototype: { _compile: Function }
  }
  const originalResolve = nodeModule._resolveFilename,
    originalLoad = nodeModule._load,
    originalCompile = nodeModule.prototype._compile
  const observedResolve = (nodeModule._resolveFilename = function (
    this: unknown,
    request: string,
    parent?: { filename?: string },
    _isMain?: boolean,
    _options?: unknown
  ) {
    const result = Reflect.apply(originalResolve, this, arguments)
    try {
      if (typeof result === 'string' && isAbsolute(result)) {
        if (parent?.filename) {
          const requested = request.startsWith('.')
            ? resolve(parent.filename, '..', request)
            : isAbsolute(request)
              ? resolve(request)
              : undefined
          edges.push({
            kind: 'commonjs',
            parent: parent.filename,
            request,
            target: result,
            ...(!requested || requested !== result || !extname(requested)
              ? {
                  error:
                    'Next config imports require canonical explicit file requests; package and extensionless resolution are not certified.',
                }
              : {}),
          })
          resolvedRequests.set(
            JSON.stringify([parent.filename, request]),
            result
          )
        }
        const current = loads[loads.length - 1]
        if (
          current &&
          current.request === request &&
          current.parent === parent?.filename
        )
          current.resolved = result
      }
    } catch {
      bookkeepingFailed = true
    }
    return result
  })
  const observedLoad = (nodeModule._load = function (
    this: unknown,
    request: string,
    parent?: { filename?: string },
    _isMain?: boolean
  ) {
    const frame = {
      request,
      parent: parent?.filename,
      resolved: undefined as string | undefined,
    }
    let pushed = false
    try {
      loads.push(frame)
      pushed = true
    } catch {
      bookkeepingFailed = true
    }
    try {
      return Reflect.apply(originalLoad, this, arguments)
    } finally {
      try {
        if (pushed) loads.pop()
        const target =
          frame.resolved ??
          resolvedRequests.get(JSON.stringify([frame.parent, request]))
        if (
          frame.parent &&
          !builtin(request) &&
          (!target || !files.has(target))
        )
          edges.push({
            kind: 'commonjs',
            parent: frame.parent,
            request,
            ...(target ? { target } : {}),
            error:
              'Next config cached import has no retained actual resolution/load certificate.',
          })
      } catch {
        bookkeepingFailed = true
      }
    }
  })
  const observedCompile = (nodeModule.prototype._compile = function (
    this: unknown,
    code: string,
    filename: string,
    _format?: string
  ) {
    try {
      remember(filename, code)
    } catch {
      bookkeepingFailed = true
    }
    return Reflect.apply(originalCompile, this, arguments)
  })
  const json = require.extensions['.json']
  const observedJSON = (require.extensions['.json'] = function (
    this: unknown,
    _mod,
    filename
  ) {
    let observed: ReturnType<typeof remember>
    try {
      observed = remember(filename)
    } catch {
      bookkeepingFailed = true
    }
    try {
      return Reflect.apply(json, this, arguments)
    } finally {
      if (observed)
        try {
          const after = statFile(filename, { bigint: true })
          if (
            observed.before.dev !== after.dev ||
            observed.before.ino !== after.ino ||
            observed.before.size !== after.size ||
            observed.before.mtimeNs !== after.mtimeNs ||
            observed.before.ctimeNs !== after.ctimeNs
          )
            files.set(filename, {
              file: filename,
              error: 'Next config JSON import changed during loading.',
            })
        } catch {
          files.set(filename, {
            file: filename,
            error: 'Next config JSON import disappeared during loading.',
          })
        }
    }
  })
  const { port1, port2 } = new MessageChannel()
  const pending = new Map<
    string,
    (value: { files: ObservedFile[]; edges: ImportEdge[] }) => void
  >()
  port1.on(
    'message',
    (value: { id: string; files: ObservedFile[]; edges: ImportEdge[] }) => {
      pending.get(value.id)?.(value)
      pending.delete(value.id)
      if (!pending.size) port1.unref()
    }
  )
  port1.unref()
  const loader = pathToFileURL(require.resolve('./config-import-loader')).href
  const shim = `import hooks from ${JSON.stringify(loader)};export const initialize=hooks.initialize,resolve=hooks.resolve,load=hooks.load;`
  register(`data:text/javascript,${encodeURIComponent(shim)}`, {
    parentURL: pathToFileURL(__filename).href,
    data: { port: port2 },
    transferList: [port2],
  })
  // This observer must remain the outermost loader when proof is requested.
  // New custom loaders are delegated normally, but revoke this narrow witness.
  const moduleAPI = Module as typeof Module & { registerHooks?: Function }
  const originalRegister = moduleAPI.register,
    originalRegisterHooks = moduleAPI.registerHooks
  let laterLoader = false
  const observedRegister = function (this: unknown, _specifier: string) {
    laterLoader = true
    return Reflect.apply(originalRegister, this, arguments)
  }
  moduleAPI.register = observedRegister as typeof Module.register
  const observedRegisterHooks = originalRegisterHooks
    ? function (this: unknown, _hooks: unknown) {
        laterLoader = true
        return Reflect.apply(originalRegisterHooks, this, arguments)
      }
    : undefined
  if (observedRegisterHooks) moduleAPI.registerHooks = observedRegisterHooks
  syncBuiltinESMExports()
  const assertLive = () => {
    if (
      laterLoader ||
      moduleAPI.register !== observedRegister ||
      moduleAPI.registerHooks !== observedRegisterHooks
    )
      throw new Error(
        'Next config module imports cannot certify loaders registered after observation.'
      )
    if (
      nodeModule._resolveFilename !== observedResolve ||
      nodeModule._load !== observedLoad ||
      nodeModule.prototype._compile !== observedCompile ||
      require.extensions['.json'] !== observedJSON
    )
      throw new Error(
        'Next config module loader hooks changed after observation: ' +
          [
            nodeModule._resolveFilename !== observedResolve
              ? '_resolveFilename'
              : '',
            nodeModule._load !== observedLoad ? '_load' : '',
            nodeModule.prototype._compile !== observedCompile ? '_compile' : '',
            require.extensions['.json'] !== observedJSON ? 'json' : '',
          ]
            .filter(Boolean)
            .join(', ')
      )
    if (bookkeepingFailed)
      throw new Error(
        'Next config import observer could not retain an actual load certificate.'
      )
  }
  const snapshot = async (
    configFile: string | null
  ): Promise<ConfigurationImportFiles> => {
    if (!configFile)
      return { version: 1, configFile: null, inputs: [], imports: [] }
    assertLive()
    if (
      !isAbsolute(configFile) ||
      resolve(configFile) !== configFile ||
      canonicalPath(configFile) !== configFile ||
      !statFile(configFile).isFile()
    )
      throw new Error('Next config selected file is not canonical.')
    const remote = await new Promise<{
      files: ObservedFile[]
      edges: ImportEdge[]
    }>((done) => {
      const id = randomUUID()
      pending.set(id, done)
      port1.ref()
      port1.postMessage(id)
    })
    assertLive()
    const allFiles = new Map(files),
      allEdges = [...edges, ...remote.edges]
    for (const item of remote.files) {
      const previous = allFiles.get(item.file)
      if (previous && previous.sha256 !== item.sha256)
        allFiles.set(item.file, {
          file: item.file,
          error: 'Next config import load certificates disagree.',
        })
      else allFiles.set(item.file, item)
    }
    const visited = new Set<string>(),
      inputs: ConfigurationImportFiles['inputs'] = [],
      imports: ConfigurationImportFiles['imports'] = [],
      queue = [configFile]
    while (queue.length) {
      const file = queue.pop()!
      if (visited.has(file)) continue
      visited.add(file)
      const actual = allFiles.get(file)
      if (!actual?.sha256 || actual.error)
        throw new Error(
          actual?.error ??
            'Next config cached module has no retained actual load certificate.'
        )
      inputs.push({ file, sha256: actual.sha256 })
      for (const edge of allEdges.filter((item) => item.parent === file)) {
        if (edge.error || !edge.target)
          throw new Error(
            edge.error ?? 'Next config import has no file identity.'
          )
        imports.push({
          kind: edge.kind,
          parent: edge.parent,
          request: edge.request,
          target: edge.target,
        })
        queue.push(edge.target)
      }
    }
    inputs.sort((a, b) => a.file.localeCompare(b.file))
    for (const item of inputs) {
      const before = statFile(item.file, { bigint: true })
      if (
        !before.isFile() ||
        canonicalPath(item.file) !== item.file ||
        newHash('sha256').update(readBytes(item.file)).digest('hex') !==
          item.sha256
      )
        throw new Error(
          'Next config import changed after its actual module load.'
        )
      const after = statFile(item.file, { bigint: true })
      if (
        before.dev !== after.dev ||
        before.ino !== after.ino ||
        before.size !== after.size ||
        before.mtimeNs !== after.mtimeNs ||
        before.ctimeNs !== after.ctimeNs
      )
        throw new Error(
          'Next config import changed while certifying its actual module load.'
        )
    }
    assertLive()
    return {
      version: 1,
      configFile,
      inputs,
      imports: [
        ...new Map(
          imports.map((edge) => [JSON.stringify(edge), edge])
        ).values(),
      ].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    }
  }
  const observed = Object.assign(snapshot, { assertLive })
  // Dormant provenance must never change the ordinary observer's availability.
  try {
    const token = {
      __proto__: null,
    } as unknown as OriginalConfigurationObserver
    freezeOriginalObserver(token)
    originalObservers.set(token, { check: assertLive, snapshot })
    originalObserverTokens.set(observed, token)
  } catch {
    // No private token means unavailable provenance; the legacy facade survives.
  }
  return observed
}

/** No installation or retrospective registration is performed by this lookup. */
export function captureOriginalConfigurationObserver():
  | OriginalConfigurationObserver
  | undefined {
  return installed ? originalObserverTokens.get(installed) : undefined
}

/** Use the original closure, independently of the mutable public facade. */
export function assertOriginalConfigurationObserver(
  observer: OriginalConfigurationObserver
): void {
  const original = originalObservers.get(observer)
  if (!original)
    throw new Error('Original Next config observer provenance unavailable.')
  original.check()
}

/** Recorded graph data only: no atomic final cut, module or native authority. */
export async function readUnqualifiedRecordedConfigurationImports(
  observer: OriginalConfigurationObserver,
  configFile: string | null,
  signal: AbortSignal
): Promise<UnqualifiedRecordedConfigurationImports> {
  signal.throwIfAborted()
  const original = originalObservers.get(observer)
  if (!original)
    throw new Error('Original Next config observer provenance unavailable.')
  original.check()
  const graph = await original.snapshot(configFile)
  signal.throwIfAborted()
  original.check()
  return {
    version: 1,
    kind: 'unqualified-recorded-configuration-imports',
    graph,
  }
}

/** Install before the ordinary loader; no extra config evaluation or resolution. */
export function observeConfigurationImports() {
  if (!installed) {
    try {
      installed = install()
    } catch (error) {
      const fail = () => {
        throw new Error('Next config import observer installation failed.', {
          cause: error,
        })
      }
      installed = Object.assign(async () => fail(), { assertLive: fail })
    }
  }
  return installed
}

/** The actual config object is the cache identity, not a reconstructed file list. */
export function retainConfigurationImports(
  config: object,
  configFile: string | null
) {
  let value = retained.get(config)
  if (!value) {
    value = observeConfigurationImports()(configFile)
    retained.set(config, value)
    value.catch(() => {})
  }
  return value
}

/** Refuse late loader changes without altering ordinary configuration loading. */
export function assertConfigurationImportObservation(
  configFile: string | null
) {
  if (configFile) observeConfigurationImports().assertLive()
}
