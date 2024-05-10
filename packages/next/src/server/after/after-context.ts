import { DetachedPromise } from '../../lib/detached-promise'
import {
  requestAsyncStorage,
  type RequestStore,
} from '../../client/components/request-async-storage.external'
import { BaseServerSpan } from '../lib/trace/constants'
import { getTracer } from '../lib/trace/tracer'
import type { CacheScope } from './react-cache-scope'
import { ResponseCookies } from '../web/spec-extension/cookies'
import type { RequestLifecycleOpts } from '../base-server'
import type { AfterCallback, AfterTask, WaitUntilFn } from './shared'

// export type AfterContext = {
//   after: (task: AfterTask) => void
//   run: <T>(requestStore: RequestStore, callback: () => T) => Promise<T>
// }

export function createAfterContext(opts: {
  waitUntil: WaitUntilFn | undefined
  onClose: RequestLifecycleOpts['onClose'] | undefined
  cacheScope: CacheScope | undefined
}): AfterContext {
  return new AfterContext(opts)
}

class AfterContext {
  private waitUntil: WaitUntilFn
  private onClose: NonNullable<RequestLifecycleOpts['onClose']>
  private cacheScope: CacheScope | undefined

  private keepAliveLock: KeepAliveLock

  private afterCallbacks: AfterCallback[] = []
  private firstCallbackAdded = createTrigger()

  constructor({
    waitUntil: _waitUntil,
    onClose: _onClose,
    cacheScope,
  }: {
    waitUntil: WaitUntilFn | undefined
    onClose: RequestLifecycleOpts['onClose'] | undefined
    cacheScope: CacheScope | undefined
  }) {
    this.waitUntil = _waitUntil ?? waitUntilNotAvailable
    this.onClose = _onClose ?? onCloseNotAvailable
    this.cacheScope = cacheScope

    this.keepAliveLock = createKeepAliveLock(this.waitUntil)
  }

  public async run<T>(requestStore: RequestStore, callback: () => T) {
    try {
      if (this.cacheScope) {
        return await this.cacheScope.run(() => callback())
      } else {
        return await callback()
      }
    } finally {
      // NOTE: it's likely that the callback is doing streaming rendering,
      // which means that nothing actually happened yet,
      // and we have to wait until the request closes to do anything.
      // (this also means that this outer try-finally may not catch much).

      // don't await -- it may never resolve if no callbacks are passed.
      this.onCloseLazy(() => this.runCallbacks(requestStore)).catch(
        (err: unknown) => {
          console.error(err)
          // as a last resort -- if something fails here, something's probably broken really badly,
          // so make sure we release the lock -- at least we'll avoid hanging a `waitUntil` forever.
          this.keepAliveLock.release()
        }
      )
    }
  }

  public after(task: AfterTask): void {
    if (isPromise(task)) {
      task.catch(() => {}) // avoid unhandled rejection crashes
      this.waitUntil(task)
    } else if (typeof task === 'function') {
      // TODO(after): will this trace correctly?
      this.addCallback(() =>
        getTracer().trace(BaseServerSpan.after, () => task())
      )
    } else {
      throw new Error('after() must receive a promise or a function')
    }
  }

  private addCallback(callback: AfterCallback) {
    if (this.afterCallbacks.length === 0) {
      this.keepAliveLock.acquire()
      this.firstCallbackAdded.trigger()
    }
    this.afterCallbacks.push(callback)
  }

  private onCloseLazy(callback: () => void): Promise<void> {
    // `onClose` has some overhead in WebNextResponse, so we don't want to call it unless necessary.
    // we also have to avoid calling it if we're in static generation (because it doesn't exist there).
    //   (the ordering is a bit convoluted -- in static generation, calling after() will cause a bailout and fail anyway,
    //    but we can't know that at the point where we call `onClose`.)
    // this trick means that we'll only ever try to call `onClose` if an `after()` call successfully went through.

    const result = new DetachedPromise<void>()
    const register = () => {
      try {
        this.onClose(callback)
        result.resolve()
      } catch (err) {
        result.reject(err)
      }
    }

    if (this.firstCallbackAdded.wasTriggered) {
      register()
    } else {
      // callbacks may be added later (or never, in which case this'll never run)
      this.firstCallbackAdded.onTrigger(register)
    }
    return result.promise
  }

  private runCallbacks(requestStore: RequestStore) {
    if (this.afterCallbacks.length === 0) return

    const runCallbacksImpl = () => {
      while (this.afterCallbacks.length) {
        const afterCallback = this.afterCallbacks.shift()!

        const onError = (err: unknown) => {
          // TODO(after): how do we properly report errors here?
          console.error(
            'An error occurred in a function passed to `unstable_after()`:',
            err
          )
        }

        // try-catch in case the callback throws synchronously or does not return a promise.
        try {
          const ret = afterCallback()
          if (isPromise(ret)) {
            this.waitUntil(ret.catch(onError))
          }
        } catch (err) {
          onError(err)
        }
      }

      this.keepAliveLock.release()
    }

    const readonlyRequestStore: RequestStore =
      wrapRequestStoreForAfterCallbacks(requestStore)

    return requestAsyncStorage.run(readonlyRequestStore, () => {
      if (this.cacheScope) {
        return this.cacheScope.run(runCallbacksImpl)
      } else {
        return runCallbacksImpl()
      }
    })
  }
}

function waitUntilNotAvailable() {
  throw new Error('`waitUntil` is not implemented for the current environment.')
}

function onCloseNotAvailable() {
  throw new Error('`onClose` is not implemented for the current environment.')
}

/** Disable mutations of `requestStore` within `after()` and disallow nested after calls.  */
function wrapRequestStoreForAfterCallbacks(
  requestStore: RequestStore
): RequestStore {
  return {
    get headers() {
      return requestStore.headers
    },
    get cookies() {
      return requestStore.cookies
    },
    get draftMode() {
      return requestStore.draftMode
    },
    // TODO(after): calling a `cookies.set()` in an after() that's in an action doesn't currently error.
    mutableCookies: new ResponseCookies(new Headers()),
    assetPrefix: requestStore.assetPrefix,
    reactLoadableManifest: requestStore.reactLoadableManifest,
    afterContext: {
      after: () => {
        throw new Error(
          'Cannot call unstable_after() from within unstable_after()'
        )
      },
      run: () => {
        throw new Error(
          'Cannot call run() from within an unstable_after() callback'
        )
      },
    },
  }
}

function createTrigger() {
  let wasTriggered = false
  const emitter = new EventTarget()

  const onTrigger = (callback: () => void) =>
    emitter.addEventListener('trigger', callback)

  const trigger = () => {
    emitter.dispatchEvent(new Event('trigger'))
    wasTriggered = true
  }
  return {
    get wasTriggered() {
      return wasTriggered
    },
    onTrigger,
    trigger,
  }
}

type KeepAliveLock = ReturnType<typeof createKeepAliveLock>

function createKeepAliveLock(waitUntil: WaitUntilFn) {
  // callbacks can't go directly into waitUntil,
  // and we don't want a function invocation to get stopped *before* we execute the callbacks,
  // so block with a dummy promise that we'll resolve when we're done.
  let keepAlivePromise: DetachedPromise<void> | undefined
  return {
    isLocked() {
      return !!keepAlivePromise
    },
    acquire() {
      if (!keepAlivePromise) {
        keepAlivePromise = new DetachedPromise<void>()
        waitUntil(keepAlivePromise.promise)
      }
    },
    release() {
      if (keepAlivePromise) {
        keepAlivePromise.resolve(undefined)
        keepAlivePromise = undefined
      }
    },
  }
}

function isPromise(p: unknown): p is Promise<unknown> {
  return (
    p !== null &&
    typeof p === 'object' &&
    'then' in p &&
    typeof p.then === 'function'
  )
}
