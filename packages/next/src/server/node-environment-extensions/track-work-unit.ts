import {
  AsyncLocalStorage,
  AsyncResource,
  createHook,
  executionAsyncId,
  triggerAsyncId,
} from 'node:async_hooks'
import * as util from 'node:util'
import * as fs from 'node:fs'

type StoreId = string
type WorkUnitStore = { id: StoreId }
export const workUnitAsyncStorage = new AsyncLocalStorage<WorkUnitStore>()

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
  onStoreMismatch: (expected: StoreId, actual: StoreId) => void
) {
  const nodesById = new Map<number, AsyncResourceNode>()

  const getInfo = (id: number) => {
    if (id === 0) return 'main'
    const node = nodesById.get(id)
    if (!node) return '<missing>'
    return `${node.type}@${node.status}, ${node.originStore?.id ?? '<no store>'}`
  }

  const hook = createHook({
    // called when the async resource is created
    init(id, type, triggerId, _resource) {
      debug('---------')
      debug(
        `# init ${id} (${type}), trigger: ${triggerId} (${getInfo(triggerId)}), eid: ${executionAsyncId()}, tid: ${triggerAsyncId()} store: ${workUnitAsyncStorage.getStore()?.id ?? '<no store>'}`
      )

      const triggerStore: WorkUnitStore | null =
        nodesById.get(triggerId)?.originStore ?? null

      const currentStore = workUnitAsyncStorage.getStore() ?? null
      // Note: we don't always get one promise that acts like a root for the store transition,
      // there can be multiple
      const node: AsyncResourceNode = {
        type,
        status: 'pending',
        originStore: currentStore,
      }
      nodesById.set(id, node)

      if (currentStore && triggerStore && currentStore.id !== triggerStore.id) {
        debug(
          '#'.repeat(40) +
            '\n' +
            `store mismatch for ${id}, ${currentStore.id} != ${triggerStore.id}`,
          '\n' + '#'.repeat(40)
        )
        debug(new Error().stack)
        onStoreMismatch(triggerStore.id, currentStore.id)
      }
    },

    // before() is called after init(), just before the resource's callback is called. It can be
    // called 0-N times for handles (such as TCPWrap), and will be called exactly 1
    // time for requests (such as FSReqCallback).
    before(id) {
      debug(`before ${id} (${getInfo(id)})`)
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
      debug(`promiseResolve ${id} (${getInfo(id)}), tid: ${triggerAsyncId()}`)
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
      logIndent -= 1
      debug(`after ${id} (${getInfo(id)})`)
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
      debug(`destroy ${id} (${getInfo(id)})`)
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
  debug('rootTask')
  logIndent += 1
  const rootPromise = Promise.resolve()
  const taskPromise = rootPromise.then(cb)
  logIndent -= 1
  debug(
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

function debug(...args: any[]) {
  logImpl(dim(formatLog(args)))
}

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
