import type { AttemptContext, SuiteHookContext } from '../runner/lifecycle'
import { continueNative } from './native-continuation'
import { isExactNativePromise } from './engine-brand-contract'

type Owner =
  | { kind: 'attempt'; context: AttemptContext }
  | { kind: 'hook'; context: SuiteHookContext }
  | {
      kind: 'collection' | 'file-fixtures' | 'worker-fixtures'
      context: { id: string; name: string }
    }
type Scope = Owner & {
  closed: boolean
  ancestors: readonly Scope[]
  declarations?: ReadonlyMap<symbol, unknown>
  onLateFailure(error: Error): void
  onUnhandledFailure?: (reason: unknown) => void
}
let active: Scope | undefined
let fileOwner: Scope | undefined
let assertionFileOpen = false

/** Assertion storage follows the Browser file; execution scopes still close. */
export function beginAssertionFile(): () => void {
  if (!fileOwner || assertionFileOpen)
    throw new Error('Browser assertion file is not available.')
  assertionFileOpen = true
  return () => {
    assertionFileOpen = false
  }
}

export function getFileAssertionOrigin(): { id: string } | undefined {
  assertBrowserApiScope('assertion')
  return active?.context
}
const owners = new Map<string, Scope>()

function runInScope<T>(scope: Scope | undefined, callback: () => T): T {
  const previous = active
  active = scope
  try {
    return callback()
  } finally {
    active = previous
  }
}
/** Experimental compiler-carried creator cells. They retain the original scope,
 * including a closed tombstone, and carry no native Promise job authority. */
const creatorScopes = new WeakMap<object, Scope | undefined>()
const freezeCreator = Object.freeze
const creatorNoop = () => {}
export function captureCreatorScope(): object {
  const cell = { __proto__: null }
  freezeCreator(cell)
  creatorScopes.set(
    cell,
    active?.kind === 'attempt' || active?.kind === 'hook' ? active : undefined
  )
  return cell
}
export function enterCreatorScope(cell: object): () => void {
  if (!creatorScopes.has(cell))
    throw new Error('Invalid Browser Mode creator cell.')
  const scope = creatorScopes.get(cell)
  // Module/collection-created callables grant nothing and change no frame.
  if (!scope) return creatorNoop
  const previous = active
  active = scope
  let left = false
  return () => {
    if (left) throw new Error('Browser Mode creator frame was already left.')
    left = true
    active = previous
  }
}

function bind<T extends Function>(callback: T, scope = active): T {
  return function (this: unknown, ...args: unknown[]) {
    return runInScope(scope, () => Reflect.apply(callback, this, args))
  } as unknown as T
}

/** Native compilation lowers all async bodies and module wrappers to generators.
 * Explicit continuations preserve closed collection/attempt identities
 * independently of whichever test is running when they resume. Only the exact
 * compiler-owned native continuation bridge retains native await.
 */
export const NativePromise = Promise
export const nativePromiseResolve = Promise.resolve.bind(Promise)
export const nativePromiseThen = Promise.prototype.then
const nativeThen = nativePromiseThen
const settled = nativePromiseResolve()
type AwaitedValue = { value: unknown }

// Native Promise resolution invokes a thenable in an engine job. That job must
// receive the same origin as the source await, including for its getter, its
// callable body and recursive resolution. The box prevents a fulfilled value
// from being assimilated for a second time by our transport Promise.
function adoptInScope(
  scope: Scope | undefined,
  input: unknown
): Promise<AwaitedValue> {
  return new NativePromise((resolve, reject) => {
    const fulfill = (value: unknown) => {
      const box = Object.create(null) as AwaitedValue
      box.value = value
      resolve(box)
    }
    const adopt = (value: unknown): void =>
      runInScope(scope, () => {
        try {
          if (
            value === null ||
            (typeof value !== 'object' && typeof value !== 'function')
          ) {
            fulfill(value)
            return
          }
          const then = Reflect.get(value, 'then')
          if (typeof then !== 'function') {
            fulfill(value)
            return
          }
          Reflect.apply(nativeThen, settled, [
            () =>
              runInScope(scope, () => {
                let called = false
                try {
                  Reflect.apply(then, value, [
                    (next: unknown) => {
                      if (called) return
                      called = true
                      adopt(next)
                    },
                    (error: unknown) => {
                      if (called) return
                      called = true
                      reject(error)
                    },
                  ])
                } catch (error) {
                  if (!called) reject(error)
                }
              }),
          ])
        } catch (error) {
          reject(error)
        }
      })
    adopt(input)
  })
}
// eslint-disable-next-line no-extend-native -- Test continuations retain their explicit browser scope across native Promise reactions.
Object.defineProperty(Promise.prototype, 'then', {
  configurable: true,
  writable: true,
  value: function (
    this: Promise<unknown>,
    fulfilled?: Function,
    rejected?: Function
  ) {
    return Reflect.apply(nativeThen, this, [
      typeof fulfilled === 'function' ? bind(fulfilled) : fulfilled,
      typeof rejected === 'function' ? bind(rejected) : rejected,
    ])
  },
})
for (const name of [
  'setTimeout',
  'setInterval',
  'queueMicrotask',
  'requestAnimationFrame',
  'requestIdleCallback',
] as const) {
  const original = Reflect.get(globalThis, name)
  if (typeof original !== 'function') continue
  Reflect.set(
    globalThis,
    name,
    function (callback: unknown, ...args: unknown[]) {
      if (typeof callback !== 'function')
        throw new TypeError('Browser Mode task callbacks must be functions.')
      return Reflect.apply(original, globalThis, [bind(callback), ...args])
    }
  )
}

// MessageChannel is used by React's scheduler. Its registration happens while
// collecting modules, whereas the originating work is chosen when posting.
const nativeEventAdd = EventTarget.prototype.addEventListener
const channelLinks = new WeakMap<MessagePort, MessagePort>()
const closedPorts = new WeakSet<MessagePort>()
const messageScopes = new WeakMap<MessagePort, { scope: Scope | undefined }[]>()
const eventScopes = new WeakMap<Event, { scope: Scope | undefined }>()

function invalidatePort(port: MessagePort) {
  const peer = channelLinks.get(port)
  channelLinks.delete(port)
  messageScopes.delete(port)
  if (peer) {
    channelLinks.delete(peer)
    messageScopes.delete(peer)
  }
}

// Observe the transfer sequence as Web IDL actually consumes it. Reading a
// caller's options or iterable twice would change getter and iterator behavior.
function trackTransferOptions(
  options: unknown,
  transferred: Set<MessagePort>
): unknown {
  if (
    options === null ||
    (typeof options !== 'object' && typeof options !== 'function')
  )
    return options
  return new Proxy(Object.create(null), {
    get(_target, key) {
      const member = Reflect.get(options, key, options)
      if (key === 'transfer') return trackTransferOptions(member, transferred)
      if (key !== Symbol.iterator || typeof member !== 'function') return member
      return function (...iteratorArgs: unknown[]) {
        const iterator = Reflect.apply(member, options, iteratorArgs)
        if (
          iterator === null ||
          (typeof iterator !== 'object' && typeof iterator !== 'function')
        )
          return iterator
        const next = Reflect.get(iterator, 'next')
        return {
          next(...args: unknown[]) {
            const item = Reflect.apply(next, iterator, args)
            if (
              item === null ||
              (typeof item !== 'object' && typeof item !== 'function')
            )
              return item
            if (Reflect.get(item, 'done')) return { done: true }
            const value = Reflect.get(item, 'value')
            if (channelLinks.has(value)) transferred.add(value)
            return { done: false, value }
          },
          get return() {
            const close = Reflect.get(iterator, 'return')
            return typeof close === 'function'
              ? (...args: unknown[]) => Reflect.apply(close, iterator, args)
              : close
          },
        }
      }
    },
  })
}

function callWithTransfers(
  method: Function,
  receiver: unknown,
  args: unknown[],
  index: number
) {
  const transferred = new Set<MessagePort>()
  if (args.length > index)
    args[index] = trackTransferOptions(args[index], transferred)
  const result = Reflect.apply(method, receiver, args)
  for (const port of transferred) invalidatePort(port)
  return result
}

if (typeof MessageChannel !== 'undefined') {
  const NativeChannel = MessageChannel
  globalThis.MessageChannel = class extends NativeChannel {
    constructor() {
      super()
      channelLinks.set(this.port1, this.port2)
      channelLinks.set(this.port2, this.port1)
      for (const port of [this.port1, this.port2])
        for (const type of ['message', 'messageerror'])
          Reflect.apply(nativeEventAdd, port, [
            type,
            (event: MessageEvent) => {
              if (!event.isTrusted) return
              const captured = messageScopes.get(port)?.shift()
              if (captured) eventScopes.set(event, captured)
            },
          ])
    }
  }
  const postMessage = MessagePort.prototype.postMessage
  MessagePort.prototype.postMessage = function (
    this: MessagePort,
    ...args: unknown[]
  ) {
    const origin = active
    const result = callWithTransfers(postMessage, this, args, 1)
    const target = channelLinks.get(this)
    if (target && !closedPorts.has(this) && !closedPorts.has(target)) {
      let queue = messageScopes.get(target)
      if (!queue) messageScopes.set(target, (queue = []))
      queue.push({ scope: origin })
    }
    return result
  }
  const close = MessagePort.prototype.close
  MessagePort.prototype.close = function () {
    const result = Reflect.apply(close, this, [])
    closedPorts.add(this)
    messageScopes.delete(this)
    return result
  }
  if (typeof structuredClone === 'function') {
    const clone = structuredClone
    globalThis.structuredClone = function (...args) {
      return callWithTransfers(clone, this, args, 1)
    }
  }
  for (const target of [
    typeof Window === 'undefined' ? undefined : Window.prototype,
    typeof Worker === 'undefined' ? undefined : Worker.prototype,
    typeof ServiceWorker === 'undefined' ? undefined : ServiceWorker.prototype,
  ]) {
    if (!target) continue
    const post = target.postMessage
    if (typeof post !== 'function') continue
    target.postMessage = function (...args: unknown[]) {
      // Window supports legacy (message, targetOrigin, transfer) and options.
      const index =
        typeof Window !== 'undefined' &&
        target === Window.prototype &&
        args.length > 2
          ? 2
          : 1
      return callWithTransfers(post, this, args, index)
    }
  }
}
function eventScope(event: Event, fallback: Scope | undefined) {
  if (
    !['message', 'messageerror'].includes(event.type) ||
    !(event.currentTarget instanceof MessagePort)
  )
    return fallback
  // Synthetic events inherit their actual synchronous caller, never a queued message.
  if (!event.isTrusted) return active
  // Detached/transferred/external ports have no certified local sender relation.
  if (!channelLinks.has(event.currentTarget)) return undefined
  return eventScopes.get(event)?.scope
}
if (typeof EventTarget !== 'undefined') {
  const add = EventTarget.prototype.addEventListener
  const remove = EventTarget.prototype.removeEventListener
  const listeners = new WeakMap<
    EventTarget,
    Map<EventListenerOrEventListenerObject, Map<string, EventListener>>
  >()
  const registrationKey = (type: string, capture: boolean) =>
    `${type}/${capture}`
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    // Web IDL treats a null or undefined receiver as the Window global.
    const receiver = this ?? globalThis
    type = `${type}`
    if (!listener)
      return Reflect.apply(add, receiver, [type, listener, options])
    if (typeof listener !== 'object' && typeof listener !== 'function')
      return Reflect.apply(add, receiver, [type, listener, options])
    const settings =
      typeof options === 'object' && options
        ? {
            capture: !!options.capture,
            once: !!options.once,
            passive: options.passive,
            signal: options.signal,
          }
        : {
            capture: !!options,
            once: false,
            passive: undefined,
            signal: undefined,
          }
    let target = listeners.get(receiver)
    if (!target) listeners.set(receiver, (target = new Map()))
    let registrations = target.get(listener)
    if (!registrations) target.set(listener, (registrations = new Map()))
    const key = registrationKey(type, settings.capture)
    let wrapped = registrations.get(key)
    const created = !wrapped
    const forget = () => {
      if (registrations!.get(key) !== wrapped) return
      registrations!.delete(key)
      if (!registrations!.size && target!.get(listener) === registrations)
        target!.delete(listener)
    }
    if (!wrapped) {
      const origin = active
      wrapped = function (this: EventTarget, event) {
        if (settings.once) forget()
        return runInScope(eventScope(event, origin), () =>
          typeof listener === 'function'
            ? Reflect.apply(listener, this, [event])
            : listener.handleEvent(event)
        )
      }
    }
    const result = Reflect.apply(add, receiver, [type, wrapped, settings])
    // The DOM ignores duplicate and already-aborted registrations. Neither may
    // replace or delete the original listener's owner, and invalid options may
    // never leave a wrapper behind after native add throws.
    if (created && !settings.signal?.aborted) {
      registrations.set(key, wrapped)
      if (settings.signal)
        Reflect.apply(nativeEventAdd, settings.signal, [
          'abort',
          forget,
          { once: true },
        ])
    }
    return result
  }
  EventTarget.prototype.removeEventListener = function (
    type,
    listener,
    options
  ) {
    const receiver = this ?? globalThis
    type = `${type}`
    const capture =
      typeof options === 'object' && options ? !!options.capture : !!options
    const registrations = listener && listeners.get(receiver)?.get(listener)
    const key = registrationKey(type, capture)
    const wrapped = registrations?.get(key)
    registrations?.delete(key)
    if (listener && !registrations?.size)
      listeners.get(receiver)?.delete(listener)
    return Reflect.apply(remove, receiver, [type, wrapped ?? listener, capture])
  }
}
if (typeof MessagePort !== 'undefined') {
  const descriptor = Object.getOwnPropertyDescriptor(
    MessagePort.prototype,
    'onmessage'
  )
  const assigned = new WeakMap<MessagePort, Function>()
  if (descriptor?.set)
    Object.defineProperty(MessagePort.prototype, 'onmessage', {
      ...descriptor,
      get() {
        return assigned.get(this) ?? descriptor.get?.call(this)
      },
      set(listener: ((event: MessageEvent) => unknown) | null) {
        const origin = active
        const wrapped =
          typeof listener === 'function'
            ? function (this: unknown, event: MessageEvent) {
                return runInScope(eventScope(event, origin), () =>
                  listener.call(this, event)
                )
              }
            : listener
        descriptor.set!.call(this, wrapped)
        if (typeof listener === 'function') assigned.set(this, listener)
        else assigned.delete(this)
      },
    })
}

function closed(scope: Scope): never {
  const error = new Error(
    `Late Browser Mode API access from closed ${scope.kind} scope "${scope.context.name}" (${scope.context.id}).`
  )
  scope.onLateFailure(error)
  throw error
}
function current() {
  if (active?.closed) closed(active)
  return active
}
export function createAsyncScope(
  owner: Owner,
  onLateFailure: (error: Error) => void,
  onUnhandledFailure?: (reason: unknown) => void
) {
  const parent = active
  const scope: Scope = {
    ...owner,
    closed: false,
    ancestors: parent ? [parent, ...parent.ancestors] : [],
    onLateFailure,
    onUnhandledFailure: onUnhandledFailure ?? parent?.onUnhandledFailure,
  }
  owners.set(owner.context.id, scope)
  if (owner.kind === 'collection') {
    if (fileOwner)
      throw new Error('Browser Mode cannot reuse a page for another file.')
    fileOwner = scope
  }
  return {
    run<T>(callback: () => T): T {
      return runInScope(scope, callback)
    },
    close() {
      scope.closed = true
    },
  }
}
export function invokeClientAttempt<T>(
  owner: AttemptContext,
  callback: () => T
): T {
  const scope = owners.get(owner.id)
  if (!scope || scope.closed || current() !== scope)
    throw new Error('Invalid Browser Mode attempt ownership.')
  return callback()
}
export function assertBrowserApiScope(
  kind: 'declaration' | 'assertion' | 'utility'
) {
  const scope = kind === 'assertion' && assertionFileOpen ? active : current()
  if (scope && ['attempt', 'collection', 'hook'].includes(scope.kind)) {
    if (kind === 'declaration' && scope.kind !== 'collection')
      throw new Error(
        'Browser Mode declarations require the active collection owner.'
      )
    return
  }
  const error = new Error(
    'Browser Mode API access requires its originating file, hook or test scope.'
  )
  fileOwner?.onLateFailure(error)
  throw error
}
/** Lexical suite values follow the same explicit collection continuations. */
export function createDeclarationStorage<T>() {
  const key = Symbol('browser suite declaration')
  return {
    getStore(): T | undefined {
      return current()?.declarations?.get(key) as T | undefined
    },
    run<R>(value: T, callback: () => R): R {
      assertBrowserApiScope('declaration')
      const owner = active!
      // This is a lexical view of the existing owner, not a new lifetime. Its
      // inherited closed flag changes when the original collection closes.
      const view = Object.create(owner) as Scope
      const declarations = new Map(owner.declarations)
      declarations.set(key, value)
      Object.defineProperty(view, 'declarations', { value: declarations })
      return runInScope(view, callback)
    },
  }
}

export function assertScopeActive() {
  current()
}
export function getOriginatingAttempt() {
  const scope = current()
  return scope?.kind === 'attempt' ? scope.context : undefined
}
export function getOriginatingHook() {
  const scope = current()
  return scope?.kind === 'hook' ? scope.context : undefined
}
export function getOriginatingCollection() {
  const scope = current()
  return scope?.kind === 'collection' ? scope.context : undefined
}
export function getOriginatingScopeAncestors(): readonly string[] {
  return current()?.ancestors.map((scope) => scope.context.id) ?? []
}
export function getOriginatingUnhandledFailureSink() {
  return active?.onUnhandledFailure
}
export function assertInternalAttemptOwner(id: string): void {
  const scope = owners.get(id)
  if (!scope || scope.closed || !['attempt', 'hook'].includes(scope.kind))
    throw new Error('Browser Mode internal assertion owner is not live.')
}
export function captureAsyncScope() {
  const scope = active
  current()
  return {
    run<T>(callback: () => T): T {
      return runInScope(scope, () => {
        current()
        return callback()
      })
    },
  }
}

/** Internal continuation propagation installs its original closed token too.
 * Harmless background completion may settle; only actual late API use fails. */
export function captureContinuationScope() {
  const scope = active
  return {
    run<T>(callback: () => T): T {
      return runInScope(scope, callback)
    },
    resume(
      awaited: unknown,
      fulfilled: (value: unknown) => void,
      rejected: (error: unknown) => void
    ): void {
      const origin = this
      runInScope(scope, () => {
        let native: boolean
        try {
          native = isExactNativePromise(awaited)
        } catch (error) {
          rejected(error)
          return
        }
        if (native) {
          void continueNative(awaited, origin, fulfilled, rejected)
          return
        }
        Reflect.apply(nativeThen, adoptInScope(scope, awaited), [
          ({ value }: AwaitedValue) => origin.run(() => fulfilled(value)),
          (error: unknown) => origin.run(() => rejected(error)),
        ])
      })
    },
  }
}

// Generator module factories receive this generic continuation binder explicitly.
Object.defineProperty(globalThis, Symbol.for('turbopack.asyncContinuation'), {
  configurable: false,
  writable: false,
  value() {
    const scope = captureContinuationScope()
    return Object.assign(<T>(callback: () => T): T => scope.run(callback), {
      resume: scope.resume.bind(scope),
    })
  },
})
