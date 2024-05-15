import {
  requestAsyncStorage,
  type RequestStore,
} from '../../client/components/request-async-storage.external'
import { ResponseCookies } from '../web/spec-extension/cookies'
import type { RequestLifecycleOpts } from '../base-server'
import type { AfterCallback, AfterTask } from './after'
import { InvariantError } from '../../shared/lib/invariant-error'

export interface AfterContext {
  run<T>(requestStore: RequestStore, callback: () => T): T
  after(task: AfterTask): void
}

export type AfterContextOpts = {
  waitUntil: RequestLifecycleOpts['waitUntil'] | undefined
  onClose: RequestLifecycleOpts['onClose'] | undefined
}

export function createAfterContext(opts: AfterContextOpts): AfterContext {
  return new AfterContextImpl(opts)
}

export class AfterContextImpl implements AfterContext {
  private waitUntil: RequestLifecycleOpts['waitUntil'] | undefined
  private onClose: RequestLifecycleOpts['onClose'] | undefined

  private requestStore: RequestStore | undefined

  private afterCallbacks: AfterCallback[] = []

  constructor({ waitUntil, onClose }: AfterContextOpts) {
    this.waitUntil = waitUntil
    this.onClose = onClose
  }

  public run<T>(requestStore: RequestStore, callback: () => T): T {
    this.requestStore = requestStore
    return callback()
  }

  public after(task: AfterTask): void {
    if (isPromise(task)) {
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
      throw new InvariantError(
        'unstable_after: Expected `AfterContext.requestStore` to be initialized'
      )
    }
    if (!this.onClose) {
      throw new InvariantError(
        'unstable_after: Missing `onClose` implementation'
      )
    }
    if (this.afterCallbacks.length === 0) {
      this.waitUntil(this.runCallbacksOnClose())
    }
    this.afterCallbacks.push(callback)
  }

  private async runCallbacksOnClose() {
    await new Promise<void>((resolve) => this.onClose!(resolve))
    return this.runCallbacks(this.requestStore!)
  }

  private async runCallbacks(requestStore: RequestStore): Promise<void> {
    if (this.afterCallbacks.length === 0) return

    const runCallbacksImpl = async () => {
      // TODO(after): we should consider limiting the parallelism here via something like `p-queue`.
      // (having a queue will also be needed for after-within-after, so this'd solve two problems at once).
      await Promise.all(
        this.afterCallbacks.map(async (afterCallback) => {
          try {
            await afterCallback()
          } catch (err) {
            // TODO(after): this is fine for now, but will need better intergration with our error reporting.
            console.error(
              'An error occurred in a function passed to `unstable_after()`:',
              err
            )
          }
        })
      )
    }

    const readonlyRequestStore: RequestStore =
      wrapRequestStoreForAfterCallbacks(requestStore)

    return requestAsyncStorage.run(readonlyRequestStore, () => {
      return runCallbacksImpl()
    })
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
          'Calling `unstable_after()` from within `unstable_after()` is not supported yet.'
        )
      },
      run: () => {
        throw new InvariantError(
          'unstable_after: Cannot call `AfterContext.run()` from within an `unstable_after()` callback'
        )
      },
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
