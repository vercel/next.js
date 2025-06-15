import PromiseQueue from 'next/dist/compiled/p-queue'
import type { RequestLifecycleOpts } from '../base-server'
import type { AfterCallback, AfterTask } from './after'
import { InvariantError } from '../../shared/lib/invariant-error'
import { isThenable } from '../../shared/lib/is-thenable'
import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { withExecuteRevalidates } from '../revalidation-utils'
import { bindSnapshot } from '../app-render/async-local-storage'
import {
  workUnitAsyncStorage,
  type WorkUnitStore,
} from '../app-render/work-unit-async-storage.external'
import { afterTaskAsyncStorage } from '../app-render/after-task-async-storage.external'

export type AfterContextOpts = {
  waitUntil: RequestLifecycleOpts['waitUntil'] | undefined
  onClose: RequestLifecycleOpts['onClose']
  onTaskError: RequestLifecycleOpts['onAfterTaskError'] | undefined
}

export class AfterContext {
  private waitUntil: RequestLifecycleOpts['waitUntil'] | undefined
  private onClose: RequestLifecycleOpts['onClose']
  private onTaskError: RequestLifecycleOpts['onAfterTaskError'] | undefined

  private runCallbacksOnClosePromise: Promise<void> | undefined
  private callbackQueue: PromiseQueue
  private workUnitStores = new Set<WorkUnitStore>()

  constructor({ waitUntil, onClose, onTaskError }: AfterContextOpts) {
    this.waitUntil = waitUntil
    this.onClose = onClose
    this.onTaskError = onTaskError

    this.callbackQueue = new PromiseQueue()
    this.callbackQueue.pause()
  }

  public after(task: AfterTask): void {
    // if we're missing `waitUntil` we can't reliably execute.
    // Throw synchronously, bubbling the error up to the `after` callsite.
    if (!this.waitUntil) {
      errorWaitUntilNotAvailable()
    }

    if (isThenable(task)) {
      this.addPromise(task)
    } else if (typeof task === 'function') {
      // TODO(after): implement tracing
      this.addCallback(task)
    } else {
      throw new Error('`after()`: Argument must be a promise or a function')
    }
  }

  private addPromise(promise: Promise<unknown>) {
    // Catch rejections immediately so they don't become unhandled.
    // Also, drop the return value so that we're not preventing it from being GC'd.
    let safePromise: Promise<void> | undefined = promise.then(NOOP, (err) => {
      this.reportTaskError('promise', err)
    })

    // Something inside the promise might call `after(callback)` sometime in the future:
    //
    //   const promise = (async () => {
    //     await slow()
    //     after(callback)
    //   })();
    //   after(promise);
    //
    // If this call happens after the response closed, and no other callbacks were scheduled before,
    // we would never start the callback queue, so the callback would never be executed.
    // To avoid this, we wrap the promise in a callback and queue it.
    //
    // This also has the fortunate side effects of making sure that we
    // - execute revalidates issued from promises, (because `runCallbacks` runs all the callbacks in `withExecuteRevalidates`).
    // - switch the workUnitStore phase after `onClose`
    // (TODO: that's a bit convoluted, we should find a clearer solution)
    this.queueCallback(() => safePromise)

    // If the promise finishes before the queue starts running, we can release our references related to it --
    // they're no longer needed for anything, at least by us.
    // We do it this way partially because `p-queue` doesn't have an API for removing a queued callback.
    // But even if it did, we wouldn't want to remove it, because we're currently relying on side-effects
    // from running the callbacks as outlined above.
    safePromise.finally(() => {
      promise = undefined!
      safePromise = undefined
    })
  }

  private addCallback(callback: AfterCallback) {
    const workUnitStore = workUnitAsyncStorage.getStore()
    const afterTaskStore = afterTaskAsyncStorage.getStore()

    // This is used for checking if request APIs can be called inside `after`.
    // Note that we need to check the phase in which the *topmost* `after` was called (which should be "action"),
    // not the current phase (which might be "after" if we're in a nested after).
    // Otherwise, we might allow `after(() => headers())`, but not `after(() => after(() => headers()))`.
    const rootTaskSpawnPhase = afterTaskStore
      ? afterTaskStore.rootTaskSpawnPhase // nested after
      : workUnitStore?.phase // topmost after

    // Bind the callback to the current execution context (i.e. preserve all currently available ALS-es).
    // We do this because we want all of these to be equivalent in every regard except timing:
    //   after(() => x())
    //   after(x())
    //   await x()
    const wrappedCallback = bindSnapshot(async () => {
      try {
        await afterTaskAsyncStorage.run({ rootTaskSpawnPhase }, () =>
          callback()
        )
      } catch (error) {
        this.reportTaskError('function', error)
      }
    })

    this.queueCallback(wrappedCallback)
  }

  private queueCallback(callback: () => void | Promise<void>) {
    if (!this.waitUntil) {
      errorWaitUntilNotAvailable()
    }

    // Save the workUnitStore so we can switch its phase when we run the callbacks.
    const workUnitStore = workUnitAsyncStorage.getStore()
    if (workUnitStore) {
      this.workUnitStores.add(workUnitStore)
    }

    this.callbackQueue.add(callback)

    // This should only happen once.
    if (!this.runCallbacksOnClosePromise) {
      this.runCallbacksOnClosePromise = this.runCallbacksOnClose()
      this.waitUntil(this.runCallbacksOnClosePromise)
    }
  }

  private async runCallbacksOnClose() {
    await new Promise<void>((resolve) => this.onClose(resolve))
    return this.runCallbacks()
  }

  private async runCallbacks(): Promise<void> {
    if (this.callbackQueue.size === 0) return

    for (const workUnitStore of this.workUnitStores) {
      workUnitStore.phase = 'after'
    }

    const workStore = workAsyncStorage.getStore()
    if (!workStore) {
      throw new InvariantError('Missing workStore in AfterContext.runCallbacks')
    }

    // TODO: This unnecessarily delays running revalidates until all callbacks are finished.
    // We should be able to execute them incrementally, without waiting for all the callbacks.
    // (especially because one of them my might hang forever and prevent us from executing the revalidates at all)
    return withExecuteRevalidates(workStore, () => {
      this.callbackQueue.start()
      return this.callbackQueue.onIdle()
    })
  }

  private reportTaskError(taskKind: 'promise' | 'function', error: unknown) {
    // TODO(after): this is fine for now, but will need better intergration with our error reporting.
    // TODO(after): should we log this if we have a onTaskError callback?
    console.error(
      taskKind === 'promise'
        ? `A promise passed to \`after()\` rejected:`
        : `An error occurred in a function passed to \`after()\`:`,
      error
    )
    if (this.onTaskError) {
      // this is very defensive, but we really don't want anything to blow up in an error handler
      try {
        this.onTaskError?.(error)
      } catch (handlerError) {
        console.error(
          new InvariantError(
            '`onTaskError` threw while handling an error thrown from an `after` task',
            {
              cause: handlerError,
            }
          )
        )
      }
    }
  }
}

const NOOP = () => {}

function errorWaitUntilNotAvailable(): never {
  throw new Error(
    '`after()` will not work correctly, because `waitUntil` is not available in the current environment.'
  )
}
