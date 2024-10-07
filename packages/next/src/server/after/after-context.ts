import PromiseQueue from 'next/dist/compiled/p-queue'
import {
  requestAsyncStorage,
  type RequestStore,
} from '../../client/components/request-async-storage.external'
import { ResponseCookies } from '../web/spec-extension/cookies'
import type { RequestLifecycleOpts } from '../base-server'
import type { AfterCallback, AfterTask } from './after'
import { InvariantError } from '../../shared/lib/invariant-error'
import { isThenable } from '../../shared/lib/is-thenable'
import { workAsyncStorage } from '../../client/components/work-async-storage.external'
import { withExecuteRevalidates } from './revalidation-utils'

export type AfterContextOpts = {
  waitUntil: RequestLifecycleOpts['waitUntil'] | undefined
  onClose: RequestLifecycleOpts['onClose'] | undefined
}

export class AfterContext {
  private waitUntil: RequestLifecycleOpts['waitUntil'] | undefined
  private onClose: RequestLifecycleOpts['onClose'] | undefined

  private requestStore: RequestStore | undefined

  private runCallbacksOnClosePromise: Promise<void> | undefined
  private callbackQueue: PromiseQueue

  constructor({ waitUntil, onClose }: AfterContextOpts) {
    this.waitUntil = waitUntil
    this.onClose = onClose

    this.callbackQueue = new PromiseQueue()
    this.callbackQueue.pause()
  }

  public after(task: AfterTask): void {
    if (isThenable(task)) {
      task.catch(() => {}) // avoid unhandled rejection crashes
      if (!this.waitUntil) {
        errorWaitUntilNotAvailable()
      }
      this.waitUntil(task)
    } else if (typeof task === 'function') {
      // TODO(after): implement tracing
      this.addCallback(task)
    } else {
      throw new Error(
        '`unstable_after()`: Argument must be a promise or a function'
      )
    }
  }

  private addCallback(callback: AfterCallback) {
    // if something is wrong, throw synchronously, bubbling up to the `unstable_after` callsite.
    if (!this.waitUntil) {
      errorWaitUntilNotAvailable()
    }
    if (!this.requestStore) {
      // We just stash the first request store we have but this is not sufficient.
      // TODO: We should store a request store per callback since each callback might
      // be inside a different store. E.g. inside different batched actions, prerenders or caches.
      this.requestStore = requestAsyncStorage.getStore()
    }
    if (!this.onClose) {
      throw new InvariantError(
        'unstable_after: Missing `onClose` implementation'
      )
    }

    // this should only happen once.
    if (!this.runCallbacksOnClosePromise) {
      // NOTE: We're creating a promise here, which means that
      // we will propagate any AsyncLocalStorage contexts we're currently in
      // to the callbacks that'll execute later.
      // This includes e.g. `requestAsyncStorage` and React's `requestStorage` (which backs `React.cache()`).
      this.runCallbacksOnClosePromise = this.runCallbacksOnClose()
      this.waitUntil(this.runCallbacksOnClosePromise)
    }

    const wrappedCallback = async () => {
      try {
        await callback()
      } catch (err) {
        // TODO(after): this is fine for now, but will need better intergration with our error reporting.
        console.error(
          'An error occurred in a function passed to `unstable_after()`:',
          err
        )
      }
    }

    this.callbackQueue.add(wrappedCallback)
  }

  private async runCallbacksOnClose() {
    await new Promise<void>((resolve) => this.onClose!(resolve))
    return this.runCallbacks(this.requestStore)
  }

  private async runCallbacks(
    requestStore: undefined | RequestStore
  ): Promise<void> {
    if (this.callbackQueue.size === 0) return

    const readonlyRequestStore: undefined | RequestStore =
      requestStore === undefined
        ? undefined
        : // TODO: This is not sufficient. It should just be the same store that mutates.
          wrapRequestStoreForAfterCallbacks(requestStore)

    const workStore = workAsyncStorage.getStore()

    return withExecuteRevalidates(workStore, () =>
      // Clearing it out or running the first request store.
      // TODO: This needs to be the request store that was active at the time the
      // callback was scheduled but p-queue makes this hard so need further refactoring.
      requestAsyncStorage.run(readonlyRequestStore as any, async () => {
        this.callbackQueue.start()
        await this.callbackQueue.onIdle()
      })
    )
  }
}

function errorWaitUntilNotAvailable(): never {
  throw new Error(
    '`unstable_after()` will not work correctly, because `waitUntil` is not available in the current environment.'
  )
}

/** Disable mutations of `requestStore` within `after()` and disallow nested after calls.  */
function wrapRequestStoreForAfterCallbacks(
  requestStore: RequestStore
): RequestStore {
  return {
    url: requestStore.url,
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
    isHmrRefresh: requestStore.isHmrRefresh,
    serverComponentsHmrCache: requestStore.serverComponentsHmrCache,
  }
}
