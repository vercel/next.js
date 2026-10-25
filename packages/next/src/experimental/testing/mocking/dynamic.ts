import { createDeclarationStorage } from '../runner/collector-platform'
import { assertScopeActive, captureAsyncScope } from '../runner/async-context'
import {
  assertNativeModuleOwnership,
  assertRuntimeModuleOwnership,
  type ModuleCacheContext,
} from './module-cache'

type ModuleId = string | number
type Namespace = Record<string, unknown>
type Factory = (
  importOriginal: () => Promise<Namespace>
) => Namespace | Promise<Namespace>
interface Manifest {
  version: 1
  owners: readonly ModuleId[]
  staticImports?: readonly { owner: ModuleId; target: ModuleId }[]
  staticDemands?: readonly { owner: ModuleId; target: ModuleId; site: number }[]
  targets: readonly {
    id: ModuleId
    aliases?: readonly ModuleId[]
    requests: readonly string[]
    nativeOriginal?: 'commonjs' | 'esm'
    staticMock?: { initial: ModuleId; provider: ModuleId }
  }[]
}
interface Registration {
  factory: Factory
  result?: Promise<Namespace>
  pending?: boolean
  value?: Namespace
  dependency?: boolean
}
interface Importer {
  m: { id: ModuleId; exports: unknown; namespaceObject?: unknown }
  r(id: ModuleId): unknown
}
interface DemandActivation {
  registrations: Set<Registration>
  originals: Set<unknown>
}
interface Target {
  id: ModuleId
  registration?: Registration
  // Registration changes do not cancel actual in-flight factory attempts.
  pending?: Set<Registration>
  // Mock exports outlive the original modules reset by the compiler cache.
  cached?: Namespace
  nativeOriginal?: 'commonjs' | 'esm'
  initial?: ModuleId
  initialActive?: boolean
  original?: { id: ModuleId; module: unknown; value: Promise<Namespace> }
}
interface State {
  requests: Map<string, Target>
  invalidations: Set<Target>
  closed: boolean
  onLateFailure(error: Error): void
}
const RealPromise = Promise
const owners = new WeakSet<object>()
let active: State | undefined

function validId(id: unknown): id is ModuleId {
  return typeof id === 'string'
    ? id.length > 0
    : typeof id === 'number' && Number.isSafeInteger(id) && id >= 0
}

function current(): State {
  assertScopeActive()
  if (!active || active.closed)
    throw new Error(
      'Runtime module mocks require an active compiler-owned file.'
    )
  return active
}

function factoryFailure(cause: unknown): Error {
  const error = new Error(
    '[vitest] There was an error when mocking a module. If you are using "vi.mock" factory, make sure there are no top level variables inside, since this call is hoisted to top of the file. Read more: https://vitest.dev/api/vi.html#vi-mock'
  )
  error.cause = cause
  return error
}

/** Install only from the emitted native entry and its non-evaluating ID manifest. */
export function initializeDynamicModuleMocking(
  context: ModuleCacheContext,
  manifest: Manifest,
  options: {
    trackImport(value: Promise<unknown>): void
    onLateFailure(error: Error): void
  }
) {
  const prototype = Object.getPrototypeOf(context)
  const originalImport = Reflect.get(prototype, 'i')
  const originalLoader = Reflect.get(prototype, 'A')
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'A')
  const importDescriptor = Object.getOwnPropertyDescriptor(prototype, 'i')
  const demandDescriptor = Object.getOwnPropertyDescriptor(prototype, 'D')
  const pendingNamespace = Reflect.get(prototype, 'E')
  if (
    active ||
    owners.has(prototype) ||
    !(context.c instanceof Map) ||
    !(context.M instanceof Map) ||
    typeof originalImport !== 'function' ||
    typeof originalLoader !== 'function' ||
    manifest.version !== 1 ||
    !Array.isArray(manifest.owners) ||
    !manifest.owners.length ||
    !Array.isArray(manifest.targets) ||
    !manifest.targets.length ||
    typeof options.trackImport !== 'function' ||
    typeof options.onLateFailure !== 'function'
  )
    throw new Error('Invalid compiler-owned runtime mock context or manifest.')
  const entryIds = new Set(manifest.owners)
  if (
    entryIds.size !== manifest.owners.length ||
    manifest.owners.some((id) => !validId(id))
  )
    throw new Error('Invalid runtime mock entry owners.')
  const targets = new Map<ModuleId, Target>()
  const requests = new Map<string, Target>()
  const initialIds = new Set<ModuleId>()
  for (const target of manifest.targets) {
    if (
      !target ||
      !validId(target.id) ||
      entryIds.has(target.id) ||
      !Array.isArray(target.requests) ||
      !target.requests.length ||
      (target.nativeOriginal !== undefined &&
        target.nativeOriginal !== 'commonjs' &&
        target.nativeOriginal !== 'esm')
    )
      throw new Error('Invalid runtime mock target identity.')
    const state: Target = {
      id: target.id,
      nativeOriginal: target.nativeOriginal,
    }
    const aliases = target.aliases ?? []
    if (
      !Array.isArray(aliases) ||
      aliases.some((id) => !validId(id) || entryIds.has(id))
    )
      throw new Error('Invalid runtime mock part ownership.')
    const staticMock = target.staticMock
    if (staticMock !== undefined) {
      if (
        !staticMock ||
        typeof staticMock !== 'object' ||
        Array.isArray(staticMock) ||
        target.nativeOriginal === undefined ||
        !validId(staticMock.initial) ||
        !validId(staticMock.provider) ||
        staticMock.provider !== target.id ||
        staticMock.initial === target.id ||
        entryIds.has(staticMock.initial) ||
        aliases.includes(staticMock.initial) ||
        initialIds.has(staticMock.initial)
      )
        throw new Error('Invalid runtime static mock pair identity.')
      state.initial = staticMock.initial
      state.initialActive = true
      initialIds.add(staticMock.initial)
    }
    if (target.nativeOriginal !== undefined) {
      assertNativeModuleOwnership(
        context,
        [...new Set([target.id, ...aliases])],
        staticMock?.initial
      )
    }
    for (const id of new Set([target.id, ...aliases])) {
      if (targets.has(id))
        throw new Error('Runtime mock target groups overlap.')
      targets.set(id, state)
    }
    for (const request of target.requests) {
      if (typeof request !== 'string' || !request || requests.has(request))
        throw new Error('Invalid runtime mock request ownership.')
      requests.set(request, state)
    }
  }
  if ([...initialIds].some((id) => targets.has(id)))
    throw new Error('Runtime static namespaces overlap target groups.')
  const staticImports = new Map<ModuleId, Set<ModuleId>>()
  if (manifest.staticImports !== undefined) {
    if (
      !Array.isArray(manifest.staticImports) ||
      !manifest.staticImports.length
    )
      throw new Error('Invalid runtime static import edges.')
    for (const edge of manifest.staticImports) {
      const target = edge && targets.get(edge.target)
      if (
        !edge ||
        typeof edge !== 'object' ||
        Array.isArray(edge) ||
        !validId(edge.owner) ||
        !validId(edge.target) ||
        edge.owner === edge.target ||
        entryIds.has(edge.owner) ||
        !target ||
        target.nativeOriginal !== undefined ||
        target.initial !== undefined ||
        initialIds.has(edge.owner) ||
        staticImports.get(edge.owner)?.has(edge.target)
      )
        throw new Error('Invalid runtime static import edge identity.')
      assertRuntimeModuleOwnership(context, [edge.owner, edge.target])
      const imports = staticImports.get(edge.owner) ?? new Set<ModuleId>()
      imports.add(edge.target)
      staticImports.set(edge.owner, imports)
    }
  }
  const staticDemands = new Map<ModuleId, Map<number, Set<ModuleId>>>()
  if (manifest.staticDemands !== undefined) {
    if (
      !Array.isArray(manifest.staticDemands) ||
      !manifest.staticDemands.length ||
      typeof pendingNamespace !== 'function'
    )
      throw new Error('Invalid runtime static demand graph.')
    for (const edge of manifest.staticDemands) {
      const target = edge && targets.get(edge.target)
      if (
        !edge ||
        typeof edge !== 'object' ||
        Array.isArray(edge) ||
        !validId(edge.owner) ||
        !validId(edge.target) ||
        edge.owner === edge.target ||
        !Number.isSafeInteger(edge.site) ||
        edge.site < 0 ||
        entryIds.has(edge.owner) ||
        entryIds.has(edge.target) ||
        initialIds.has(edge.owner) ||
        initialIds.has(edge.target) ||
        target?.nativeOriginal !== undefined ||
        target?.initial !== undefined ||
        staticDemands.get(edge.owner)?.get(edge.site)?.has(edge.target)
      )
        throw new Error('Invalid runtime static demand edge identity.')
      assertRuntimeModuleOwnership(context, [edge.owner, edge.target])
      const sites =
        staticDemands.get(edge.owner) ?? new Map<number, Set<ModuleId>>()
      const siteTargets = sites.get(edge.site) ?? new Set<ModuleId>()
      siteTargets.add(edge.target)
      sites.set(edge.site, siteTargets)
      staticDemands.set(edge.owner, sites)
    }
  }
  const activation = staticDemands.size
    ? createDeclarationStorage<DemandActivation>()
    : undefined
  const demandActivations = new Set<DemandActivation>()
  function createActivation(
    previous = activation?.getStore()
  ): DemandActivation {
    const scope = {
      registrations: new Set(previous?.registrations),
      originals: new Set(previous?.originals),
    }
    demandActivations.add(scope)
    return scope
  }
  const state: State = {
    requests,
    invalidations: new Set(),
    closed: false,
    onLateFailure: options.onLateFailure,
  }
  const pending = new Set<(error: Error) => void>()
  function assertOwner() {
    assertScopeActive()
    if (state.closed || active !== state) {
      const error = new Error(
        'The originating runtime module mock file has been disposed.'
      )
      state.onLateFailure(error)
      throw error
    }
  }
  function flushMockInvalidations() {
    for (const target of state.invalidations) target.cached = undefined
    state.invalidations.clear()
  }
  function own<T>(value: Promise<T>): Promise<T> {
    let cancel!: (error: Error) => void
    const cancellation = new RealPromise<never>((_, reject) => {
      cancel = reject
      pending.add(reject)
    })
    const result = RealPromise.race([value, cancellation]).finally(() =>
      pending.delete(cancel)
    )
    options.trackImport(result)
    // Observe settling internally without marking the caller's import handled.
    // An ignored rejected import must retain Node's originating rejection path.
    return result.then((exports) => exports)
  }
  function loadOriginal(
    importer: object,
    id: ModuleId,
    target: Target
  ): Promise<Namespace> {
    flushMockInvalidations()
    if (!target.nativeOriginal) {
      const scope = activation?.getStore()
      const before = scope
        ? new Map(
            [...staticDemands.keys()].map((owner) => [
              owner,
              context.c.get(owner),
            ])
          )
        : undefined
      // Only the real loader invocation can create these records. Capture them
      // synchronously, before any native await can outlive a module-cache reset.
      const value = Reflect.apply(originalImport, importer, [
        id,
      ]) as Promise<Namespace>
      if (scope && before)
        for (const [owner, previous] of before) {
          const createdRecord = context.c.get(owner)
          if (createdRecord && createdRecord !== previous)
            scope.originals.add(createdRecord)
        }
      return value
    }
    if (typeof context.M.get(id) !== 'function')
      throw new Error('Native runtime target has no retained compiler factory.')
    const cached = target.original
    if (cached && context.c.get(cached.id) === cached.module)
      return cached.value
    const value = Reflect.apply(originalImport, importer, [id])
    const module = context.c.get(id)
    if (!module)
      throw new Error(
        'Native runtime target has no actual module cache record.'
      )
    const loaded = RealPromise.resolve(value).then((namespace) => {
      assertOwner()
      if (
        !namespace ||
        (typeof namespace !== 'object' && typeof namespace !== 'function')
      )
        throw new Error(
          'Native runtime target did not return its actual namespace.'
        )
      return namespace as Namespace
    })
    target.original = { id, module, value: loaded }
    return loaded
  }
  async function original(
    importer: object,
    id: ModuleId,
    target: Target,
    origin?: ReturnType<typeof captureAsyncScope>
  ): Promise<Namespace> {
    if (origin)
      return origin.run(() => {
        assertOwner()
        return loadOriginal(importer, id, target)
      })
    return loadOriginal(importer, id, target)
  }
  function resolveRegistration(
    importer: Importer,
    id: ModuleId,
    target: Target,
    registration: Registration,
    origin: ReturnType<typeof captureAsyncScope>,
    dependency: boolean
  ): Promise<Namespace> {
    if (!registration.result) {
      registration.pending = true
      target.pending ??= new Set()
      target.pending.add(registration)
      if (activation) registration.dependency = dependency
      let tracked!: Promise<Namespace>
      const rejected = (error: unknown): never => {
        if (!state.closed && active === state) {
          registration.pending = false
          if (target.pending?.delete(registration) && !target.pending.size)
            target.pending = undefined
          if (registration.result === tracked) registration.result = undefined
        }
        throw error
      }
      const dispatch = RealPromise.resolve()
      tracked = (async () => {
        await dispatch
        let factoryExports: ReturnType<Factory>
        try {
          factoryExports = origin.run(() => {
            assertOwner()
            try {
              const invoke = () =>
                registration.factory(() =>
                  original(importer, id, target, origin)
                )
              if (activation) {
                const scope = createActivation()
                scope.registrations.add(registration)
                if (
                  staticDemands.has(importer.m.id) &&
                  context.c.get(importer.m.id) === importer.m
                )
                  scope.originals.add(importer.m)
                return activation.run(scope, invoke)
              }
              return invoke()
            } catch (cause) {
              throw factoryFailure(cause)
            }
          })
        } catch (error) {
          return rejected(error)
        }
        let exports: Namespace
        try {
          exports = await factoryExports
        } catch (cause) {
          try {
            // A closed origin owns its raw failure before factory wrapping.
            origin.run(assertOwner)
          } catch (error) {
            return rejected(error)
          }
          return rejected(factoryFailure(cause))
        }
        try {
          return origin.run(() => {
            assertOwner()
            if (
              !exports ||
              typeof exports !== 'object' ||
              Array.isArray(exports)
            )
              throw factoryFailure(
                new TypeError(
                  'Runtime module mock factory must return an exports object.'
                )
              )
            registration.pending = false
            registration.value = exports
            if (target.pending?.delete(registration)) {
              if (!target.pending.size) target.pending = undefined
              target.cached = exports
            }
            return exports
          })
        } catch (error) {
          return rejected(error)
        }
      })()
      registration.result = tracked
    }
    return registration.result
  }
  const method = function (this: Importer, loaderId: ModuleId) {
    if (!entryIds.has(this.m.id))
      return Reflect.apply(originalLoader, this, [loaderId])
    const origin = captureAsyncScope()
    const invoke = () =>
      origin.run(() => {
        assertOwner()
        const importer = this
        // This is the real compiler-emitted asynchronous loader. Its callback
        // receives the actual target ID after loading the real immutable chunks.
        const loader = importer.r(loaderId)
        if (typeof loader !== 'function')
          throw new Error(
            'Compiled dynamic import is missing its native loader.'
          )
        const value = Reflect.apply(loader, undefined, [
          (id: ModuleId) =>
            origin.run(() => {
              assertOwner()
              flushMockInvalidations()
              const target = targets.get(id)
              const registration = target?.registration
              if (!target || !registration)
                return target
                  ? target.initialActive
                    ? Reflect.apply(originalImport, importer, [target.initial!])
                    : original(importer, id, target)
                  : Reflect.apply(originalImport, importer, [id])
              if (target.cached) return target.cached
              const pendingRegistration = registration.pending
                ? registration
                : [...(target.pending ?? [])].find(
                    (candidate) => !candidate.dependency
                  )
              if (
                pendingRegistration &&
                activation &&
                pendingRegistration.dependency &&
                !activation.getStore()?.registrations.has(pendingRegistration)
              )
                return pendingRegistration.result!
              if (pendingRegistration)
                return RealPromise.resolve().then(() =>
                  origin.run(() => {
                    assertOwner()
                    const originalValue = original(importer, id, target)
                    if (target.nativeOriginal) return originalValue
                    return RealPromise.resolve(originalValue).then(
                      (namespace) =>
                        origin.run(() => {
                          assertOwner()
                          return namespace
                        })
                    )
                  })
                )
              if (typeof context.M.get(id) !== 'function')
                throw new Error(
                  'Runtime mock target has no retained native factory.'
                )
              return resolveRegistration(
                importer,
                id,
                target,
                registration,
                origin,
                false
              )
            }),
        ])
        return own(RealPromise.resolve(value))
      })
    return activation && !activation.getStore()
      ? activation.run(createActivation(), invoke)
      : invoke()
  }
  const demandMethod = function (this: Importer, site: number, id: ModuleId) {
    const origin = captureAsyncScope()
    return origin.run(() => {
      assertOwner()
      if (!activation || !staticDemands.get(this.m.id)?.get(site)?.has(id))
        throw new Error(
          'Runtime static demand did not match its compiler readsite.'
        )
      assertRuntimeModuleOwnership(context, [this.m.id, id])
      const previous = activation.getStore()
      const currentRecord = context.c.get(this.m.id) === this.m
      if (
        (!currentRecord && !previous?.originals.has(this.m)) ||
        typeof context.M.get(this.m.id) !== 'function' ||
        typeof context.M.get(id) !== 'function'
      )
        throw new Error(
          'Runtime static demand has no actual owner and retained factories.'
        )
      flushMockInvalidations()
      // Capture only while current, in the activation of this actual caller.
      // Its source continuation may finish after a cache reset removed the record.
      if (currentRecord) previous?.originals.add(this.m)
      const scope = createActivation(previous)
      scope.originals.add(this.m)
      return activation.run(scope, () => {
        const target = targets.get(id)
        const registration = target?.registration
        if (!target || !registration)
          return RealPromise.resolve(Reflect.apply(originalImport, this, [id]))
        if (target.cached) return own(RealPromise.resolve(target.cached))
        const pendingRegistration = registration.pending
          ? registration
          : undefined
        if (pendingRegistration) {
          const currentActivation = activation.getStore()
          if (!currentActivation?.registrations.has(pendingRegistration))
            return own(pendingRegistration.result!)
          const retained = context.c.get(id)
          if (
            retained !== undefined &&
            currentActivation.originals.has(retained)
          ) {
            const namespace = Reflect.apply(pendingNamespace, this, [
              id,
              retained,
            ])
            if (namespace !== undefined)
              return RealPromise.resolve(namespace as Namespace)
          }
          return RealPromise.resolve(loadOriginal(this, id, target))
        }
        return own(
          resolveRegistration(this, id, target, registration, origin, true)
        )
      })
    })
  }
  if (staticDemands.size)
    Object.defineProperty(prototype, 'D', {
      configurable: true,
      writable: true,
      value: demandMethod,
    })
  const importMethod = function (this: { m: { id: ModuleId } }, id: ModuleId) {
    if (staticImports.get(this.m.id)?.has(id)) {
      assertOwner()
      assertRuntimeModuleOwnership(context, [this.m.id, id])
      if (
        typeof context.M.get(this.m.id) !== 'function' ||
        typeof context.M.get(id) !== 'function'
      )
        throw new Error(
          'Runtime static import edge has no retained compiler factories.'
        )
      flushMockInvalidations()
      const target = targets.get(id)!
      if (target.registration && target.cached) return target.cached
    }
    return Reflect.apply(originalImport, this, [id])
  }
  if (staticImports.size)
    Object.defineProperty(prototype, 'i', {
      configurable: true,
      writable: true,
      value: importMethod,
    })
  Object.defineProperty(prototype, 'A', {
    configurable: true,
    writable: true,
    value: method,
  })
  owners.add(prototype)
  active = state
  return {
    dispose() {
      if (state.closed) return
      const unfinished = pending.size
      state.closed = true
      state.invalidations.clear()
      if (active === state) active = undefined
      const error = new Error(
        'Runtime module mock work was cancelled during file cleanup.'
      )
      for (const reject of pending) reject(error)
      pending.clear()
      owners.delete(prototype)
      if (Reflect.get(prototype, 'A') !== method)
        throw new Error(
          'Runtime mock loader ownership changed before disposal.'
        )
      if (staticImports.size) {
        if (Reflect.get(prototype, 'i') !== importMethod)
          throw new Error(
            'Runtime static import ownership changed before disposal.'
          )
        if (importDescriptor)
          Object.defineProperty(prototype, 'i', importDescriptor)
        else Reflect.deleteProperty(prototype, 'i')
      }
      if (staticDemands.size) {
        if (Reflect.get(prototype, 'D') !== demandMethod)
          throw new Error(
            'Runtime static demand ownership changed before disposal.'
          )
        if (demandDescriptor)
          Object.defineProperty(prototype, 'D', demandDescriptor)
        else Reflect.deleteProperty(prototype, 'D')
        activation!.disable()
        for (const scope of demandActivations) {
          scope.originals.clear()
          scope.registrations.clear()
        }
        demandActivations.clear()
      }
      if (descriptor) Object.defineProperty(prototype, 'A', descriptor)
      else Reflect.deleteProperty(prototype, 'A')
      if (unfinished) throw error
    },
  }
}

/** Calls stay in their original source location with their original closure. */
export function doMock(
  request: string,
  factory: Factory
): { [Symbol.dispose]?: () => void } {
  const state = current()
  const target = state.requests.get(request)
  if (!target)
    throw new Error(
      'Runtime module mock request was not authorized by the native compiler.'
    )
  if (typeof factory !== 'function')
    throw new TypeError('Runtime module mocks require an explicit factory.')
  target.registration = { factory }
  state.invalidations.add(target)
  return Symbol.dispose
    ? {
        [Symbol.dispose]() {
          assertScopeActive()
          if (active !== state || state.closed) {
            const error = new Error(
              'Runtime module mock disposer belongs to a closed file.'
            )
            state.onLateFailure(error)
            throw error
          }
          doUnmock(request)
        },
      }
    : {}
}

export function doUnmock(request: string): void {
  const state = current()
  const target = state.requests.get(request)
  if (!target)
    throw new Error(
      'Runtime module unmock request was not authorized by the native compiler.'
    )
  target.registration = undefined
  state.invalidations.add(target)
  target.initialActive = false
}
