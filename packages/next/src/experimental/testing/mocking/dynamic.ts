import { assertScopeActive, captureAsyncScope } from '../runner/async-context'
import type { ModuleCacheContext } from './module-cache'

type ModuleId = string | number
type Namespace = Record<string, unknown>
type Factory = (
  importOriginal: () => Promise<Namespace>
) => Namespace | Promise<Namespace>
interface Manifest {
  version: 1
  owners: readonly ModuleId[]
  targets: readonly {
    id: ModuleId
    aliases?: readonly ModuleId[]
    requests: readonly string[]
  }[]
}
interface Registration {
  factory: Factory
  result?: Promise<Namespace>
}
interface Target {
  id: ModuleId
  registration?: Registration
}
interface State {
  requests: Map<string, Target>
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
  for (const target of manifest.targets) {
    if (
      !target ||
      !validId(target.id) ||
      entryIds.has(target.id) ||
      !Array.isArray(target.requests) ||
      !target.requests.length
    )
      throw new Error('Invalid runtime mock target identity.')
    const state: Target = { id: target.id }
    const aliases = target.aliases ?? []
    if (
      !Array.isArray(aliases) ||
      aliases.some((id) => !validId(id) || entryIds.has(id))
    )
      throw new Error('Invalid runtime mock part ownership.')
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
  const state: State = {
    requests,
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
  const method = function (
    this: { m: { id: ModuleId }; r(id: ModuleId): unknown },
    loaderId: ModuleId
  ) {
    if (!entryIds.has(this.m.id))
      return Reflect.apply(originalLoader, this, [loaderId])
    const origin = captureAsyncScope()
    return origin.run(() => {
      assertOwner()
      const importer = this
      // This is the real compiler-emitted asynchronous loader. Its callback
      // receives the actual target ID after loading the real immutable chunks.
      const loader = importer.r(loaderId)
      if (typeof loader !== 'function')
        throw new Error('Compiled dynamic import is missing its native loader.')
      const value = Reflect.apply(loader, undefined, [
        (id: ModuleId) =>
          origin.run(() => {
            assertOwner()
            const target = targets.get(id)
            const registration = target?.registration
            if (!registration)
              return Reflect.apply(originalImport, importer, [id])
            if (typeof context.M.get(id) !== 'function')
              throw new Error(
                'Runtime mock target has no retained native factory.'
              )
            if (!registration.result) {
              const result = RealPromise.resolve()
                .then(() =>
                  origin.run(() => {
                    assertOwner()
                    return registration.factory(async () =>
                      origin.run(() => {
                        assertOwner()
                        return Reflect.apply(originalImport, importer, [id])
                      })
                    )
                  })
                )
                .then((exports) =>
                  origin.run(() => {
                    assertOwner()
                    if (
                      !exports ||
                      typeof exports !== 'object' ||
                      Array.isArray(exports)
                    )
                      throw new TypeError(
                        'Runtime module mock factory must return an exports object.'
                      )
                    return exports
                  })
                )
              registration.result = own(result)
            }
            return registration.result
          }),
      ])
      return own(RealPromise.resolve(value))
    })
  }
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
}
