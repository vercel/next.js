import {
  AsyncLocalStorage,
  AsyncResource,
  createHook,
  executionAsyncId,
  triggerAsyncId,
} from 'node:async_hooks'
import * as util from 'node:util'
import * as fs from 'node:fs'
import {
  type WorkUnitStore,
  workUnitAsyncStorage,
} from '../app-render/work-unit-async-storage.external'
import {
  workAsyncStorage,
  type WorkStore,
} from '../app-render/work-async-storage.external'

let globalTracker: WorkUnitTracker | null = null

export function startWorkUnitPromiseTracking() {
  if (!globalTracker) {
    globalTracker = createWorkUnitTracker((expectedId, actualId) => {
      // This runs in the scope where the promise is awaited/then'd.
      // We should have userspace frames above us in the callstack that will
      // point to the location.
      console.warn(
        new Error(
          `A promise from one prerender was used in another prerender. (expected store ID: ${expectedId}, actual store ID: ${actualId})`
        )
      )
    }, getGlobalStoreId)
    globalTracker.hook.enable()
  }
}

let nextStoreId = 0
const storeIdByStore = new WeakMap<WorkUnitStore, StoreId>()
const workStoreByWorkUnitStore = new WeakMap<WorkUnitStore, WorkStore>()

export const frameworkInternalAsyncStorage = new AsyncLocalStorage<boolean>()

export function disableWorkUnitTracking<T>(cb: () => T): T {
  return frameworkInternalAsyncStorage.run(true, cb)
}

export function reenableWorkUnitTracking<T>(cb: () => T): T {
  return frameworkInternalAsyncStorage.exit(cb)
}

export function exposedToUserspace<TFn extends (...args: any[]) => any>(
  func: TFn
): TFn {
  return function (this: any) {
    const self = this
    // return func.apply(
    //   self,
    //   // @ts-expect-error
    //   arguments
    // )
    return frameworkInternalAsyncStorage.run(true, () =>
      func.apply(
        self,
        // @ts-expect-error
        arguments
      )
    )
  } as TFn
}

function getGlobalStoreId(store: WorkUnitStore) {
  const workStore = workAsyncStorage.getStore()
  if (workStore) {
    workStoreByWorkUnitStore.set(store, workStore)
  }
  let id = storeIdByStore.get(store)
  if (id === undefined) {
    id = `${workStore ? workStore.page + '@' : ''}${store.type}:${nextStoreId++}`
    storeIdByStore.set(store, id)
  }
  return id
}

//=====================================

type StoreId = string

const INFO_MISSING_TYPE = 'MISSING_INIT'
const INFO_PROMISE_TYPE = 'PROMISE'

type AsyncResourceNode = {
  type: string
  status: 'pending' | 'executing' | 'finished'
  // isStoreTransition: boolean
  originStore: WorkUnitStore | null
}

function createMissingNode(): AsyncResourceNode {
  return {
    type: INFO_MISSING_TYPE,
    status: 'pending',
    originStore: null,
  }
}

export function createWorkUnitTracker(
  onStoreMismatch: (expected: StoreId, actual: StoreId) => void,
  getStoreId: (store: WorkUnitStore) => StoreId
) {
  const nodesById = new Map<number, AsyncResourceNode>()

  const getInfo = (id: number) => {
    if (id === 0) return 'main'
    const node = nodesById.get(id)
    if (!node) return '<missing>'
    return `${node.type}@${node.status}, ${node.originStore ? getStoreId(node.originStore) : '<no store>'}`
  }

  const hook = createHook({
    // called when the async resource is created
    init(id, type, triggerId, _resource) {
      // for now, we're not worrying about leaking non-promises
      if (type !== INFO_PROMISE_TYPE) {
        return
      }

      {
        debug?.('---------')
        const debugStore = workUnitAsyncStorage.getStore()
        debug?.(
          `# init ${id} (${type}), trigger: ${triggerId} (${getInfo(triggerId)}), eid: ${executionAsyncId()}, tid: ${triggerAsyncId()} store: ${debugStore ? getStoreId(debugStore) : '<no store>'}`
        )
      }

      const isTrackingDisabled =
        frameworkInternalAsyncStorage.getStore() ?? false

      const triggerStore: WorkUnitStore | null =
        nodesById.get(triggerId)?.originStore ?? null

      const currentStore = isTrackingDisabled
        ? null
        : (workUnitAsyncStorage.getStore() ?? null)
      // Note: we don't always get one promise that acts like a root for the store transition,
      // there can be multiple
      const node: AsyncResourceNode = {
        type,
        status: 'pending',
        originStore: currentStore,
      }
      nodesById.set(id, node)

      if (
        currentStore &&
        triggerStore &&
        getStoreId(currentStore) !== getStoreId(triggerStore) &&
        !isTrackingDisabled
      ) {
        debug?.(
          '#'.repeat(40) +
            '\n' +
            `store mismatch for ${id}, ${getStoreId(currentStore)} != ${getStoreId(triggerStore)}`,
          '\n' + '#'.repeat(40)
        )
        debug?.(new Error().stack)
        onStoreMismatch(getStoreId(triggerStore), getStoreId(currentStore))
      }
    },

    // before() is called after init(), just before the resource's callback is called. It can be
    // called 0-N times for handles (such as TCPWrap), and will be called exactly 1
    // time for requests (such as FSReqCallback).
    before(id) {
      debug?.(`before ${id} (${getInfo(id)})`)
      logIndent += 1
      let info = nodesById.get(id)
      if (!info) {
        nodesById.set(id, (info = createMissingNode()))
      }
      info.status = 'executing'
    },

    // We don't get before/after for a Promise.resolve call,
    // we need to catch those here.
    // It also gets called for promise resolutions in general, so we handle those here
    promiseResolve(id) {
      debug?.(`promiseResolve ${id} (${getInfo(id)}), tid: ${triggerAsyncId()}`)
      let info = nodesById.get(id)
      if (!info) {
        nodesById.set(id, (info = createMissingNode()))
      }
      if (info.status !== 'finished') {
        info.status = 'finished'
        // if we're backfilling a node that didn't init, update the type --
        // we know it's a promise.
        if (info.type === INFO_MISSING_TYPE) {
          info.type = INFO_PROMISE_TYPE
        }
      }
    },

    after(id) {
      if (logIndent > 0) {
        // TODO: this shouldn't be possible
        logIndent -= 1
      }
      debug?.(`after ${id} (${getInfo(id)})`)
      let info = nodesById.get(id)
      if (!info) {
        nodesById.set(id, (info = createMissingNode()))
      }
      if (info.status !== 'finished') {
        info.status = 'finished'
      }
      // TODO: does this need to be a stack or something?
      // currentId = 0;
    },

    destroy(id) {
      debug?.(`destroy ${id} (${getInfo(id)})`)
    },
  })

  return {
    hook,
    nodesById,
  }
}

export type WorkUnitTracker = ReturnType<typeof createWorkUnitTracker>

export function getOriginWorkUnit(
  tracker: WorkUnitTracker,
  resource: object
): WorkUnitStore | null {
  const id = AsyncResource$asyncId.call(resource)
  return tracker.nodesById.get(id)?.originStore ?? null
}

export const rootTask = <T>(cb: () => Promise<T>) => {
  debug?.('rootTask')
  logIndent += 1
  const rootPromise = Promise.resolve()
  const taskPromise = rootPromise.then(cb)
  logIndent -= 1
  debug?.(
    'created root task promise',
    getPromiseAsyncId(rootPromise),
    '->',
    getPromiseAsyncId(taskPromise)
  )
  return taskPromise
}

// behavior of awaiting an already resolved promise (after its initial then() was called) -
// does not get the promise as a trigger it gets the outer scope instead
// (the one where .then() was called)
// actually maybe this isn't tue?

//======================

let logIndent = 0

function formatLog(args: any[]): string {
  const msg = args
    .map((arg) => (typeof arg === 'string' ? arg : `${util.inspect(arg)}`))
    .join(' ')
  const indentStr = ' '.repeat(logIndent * 2)
  if (msg.includes('\n')) {
    return msg
      .split('\n')
      .map((line) => indentStr + line)
      .join('\n')
  } else {
    return indentStr + msg
  }
}

export function log(...args: any[]) {
  logImpl(formatLog(args))
}

const debug = process.env.NEXT_DEBUG_PROMISE_TRACKING
  ? (...args: any[]) => {
      logImpl(dim(formatLog(args)))
    }
  : undefined

function logImpl(msg: string) {
  fs.writeFileSync(process.stdout.fd, msg + '\n')
}

function dim(text: string) {
  // cannot use `util.styleText` -- somehow, it triggers async_hooks by creating a TTY object
  return '\x1B[2m' + text + '\x1B[22m'
}

const AsyncResource$asyncId = AsyncResource.prototype.asyncId

export function getPromiseAsyncId(promise: Promise<any>): number {
  return AsyncResource$asyncId.call(promise)
}
