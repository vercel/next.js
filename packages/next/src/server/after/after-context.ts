import PromiseQueue from 'next/dist/compiled/p-queue'
import type { RequestLifecycleOpts } from '../base-server'
import type { AfterCallback, AfterTask } from './after'
import { InvariantError } from '../../shared/lib/invariant-error'
import { isThenable } from '../../shared/lib/is-thenable'
import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { withExecuteRevalidates } from '../revalidation-utils'
import { bindSnapshot } from '../app-render/async-local-storage'
import type { WorkUnitStore } from '../app-render/work-unit-async-storage.external'
import { afterTaskAsyncStorage } from '../app-render/after-task-async-storage.external'
import { scheduleImmediate } from '../../lib/scheduler'

export type AfterContextOpts = {
  waitUntil: RequestLifecycleOpts['waitUntil'] | undefined
  onClose: RequestLifecycleOpts['onClose']
  onTaskError: RequestLifecycleOpts['onAfterTaskError'] | undefined
}

export class AfterContext {
  private waitUntil: RequestLifecycleOpts['waitUntil'] | undefined
  private onClose: RequestLifecycleOpts['onClose']
  private onTaskError: RequestLifecycleOpts['onAfterTaskError'] | undefined

  private isRequestClosed: boolean = false
  private initialOnCloseError: null | { error: unknown } = null

  private runCallbacksOnClosePromise: Promise<void> | undefined
  private callbackQueue: PromiseQueue
  private workUnitStores = new Set<WorkUnitStore>()

  constructor({ waitUntil, onClose, onTaskError }: AfterContextOpts) {
    this.waitUntil = waitUntil
    this.onClose = onClose
    this.onTaskError = onTaskError

    this.callbackQueue = new PromiseQueue()
    this.callbackQueue.pause()

    try {
      onClose(() => {
        this.isRequestClosed = true

        // TODO(after): it's not ideal that we'll only switch the `phase` of a WorkUnitStore
        // if `after()` was called inside it. We should probably track this whenever a store is created
        for (const workUnitStore of this.workUnitStores) {
          workUnitStore.phase = 'after'
        }
      })
    } catch (err) {
      // If onClose is broken, report errors lazily, when after() is called.
      this.initialOnCloseError = { error: err }
    }
  }

  public after(task: AfterTask, workUnitStore: WorkUnitStore): void {
    if (this.initialOnCloseError) {
      throw new InvariantError(
        `An onClose call failed, which means after() can't work correctly.`,
        { cause: this.initialOnCloseError.error }
      )
    }

    // Save the workUnitStore so we can switch its phase later.
    this.workUnitStores.add(workUnitStore)

    if (isThenable(task)) {
      this.addThenable(task)
    } else if (typeof task === 'function') {
      // TODO(after): implement tracing
      this.addCallback(task, workUnitStore)
    } else {
      throw new Error('`after()`: Argument must be a promise or a function')
    }
  }

  private addThenable(thenable: PromiseLike<any>) {
    if (!this.waitUntil) {
      errorWaitUntilNotAvailable()
    }
    this.waitUntil(
      new Promise<void>((resolve) => {
        thenable.then(
          () => {
            resolve()
          },
          (error) => {
            resolve()
            this.reportTaskError('promise', error)
          }
        )
      })
    )
  }

  private addCallback(callback: AfterCallback, workUnitStore: WorkUnitStore) {
    // if something is wrong, throw synchronously, bubbling up to the `after` callsite.
    if (!this.waitUntil) {
      errorWaitUntilNotAvailable()
    }

    const afterTaskStore = afterTaskAsyncStorage.getStore()

    // This is used for checking if request APIs can be called inside `after`.
    // Note that we need to check the phase in which the *topmost* `after` was called (which should be "action"),
    // not the current phase (which might be "after" if we're in a nested after).
    // Otherwise, we might allow `after(() => headers())`, but not `after(() => after(() => headers()))`.
    const rootTaskSpawnPhase = afterTaskStore
      ? afterTaskStore.rootTaskSpawnPhase // nested after
      : workUnitStore.phase // topmost after

    // this should only happen once.
    if (!this.runCallbacksOnClosePromise) {
      this.runCallbacksOnClosePromise = this.runCallbacksOnClose()
      this.waitUntil(this.runCallbacksOnClosePromise)
    }

    // Bind the callback to the current execution context (i.e. preserve all currently available ALS-es).
    // We do this because we want all of these to be equivalent in every regard except timing:
    //   after(() => x())
    //   after(x())
    //   await x()
    const wrappedCallback = bindSnapshot(
      // WARNING: Don't make this a named function. It must be anonymous.
      // See: https://github.com/facebook/react/pull/34911
      async () => {
        try {
          await afterTaskAsyncStorage.run({ rootTaskSpawnPhase }, () =>
            callback()
          )
        } catch (error) {
          this.reportTaskError('function', error)
        }
      }
    )

    this.callbackQueue.add(wrappedCallback)
  }

  private async runCallbacksOnClose() {
    if (!this.isRequestClosed) {
      await new Promise<void>((resolve) => this.onClose(resolve))
    } else {
      // The request is already closed.
      // Avoid running the callbacks too quickly to prevent userspace from
      // e.g. relying on `after` being microtasky somewhere.
      await new Promise<void>((resolve) => scheduleImmediate(resolve))
    }
    return this.runCallbacks()
  }

  private async runCallbacks(): Promise<void> {
    if (this.callbackQueue.size === 0) return

    const workStore = workAsyncStorage.getStore()
    if (!workStore) {
      throw new InvariantError('Missing workStore in AfterContext.runCallbacks')
    }

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

function errorWaitUntilNotAvailable(): never {
  throw new Error(
    '`after()` will not work correctly, because `waitUntil` is not available in the current environment.'
  )
}
