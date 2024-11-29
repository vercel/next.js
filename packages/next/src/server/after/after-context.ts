import PromiseQueue from 'next/dist/compiled/p-queue'
import type { RequestLifecycleOpts } from '../base-server'
import type { AfterCallback, AfterTask } from './after'
import { InvariantError } from '../../shared/lib/invariant-error'
import { isThenable } from '../../shared/lib/is-thenable'
import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { withExecuteRevalidates } from './revalidation-utils'
import { bindSnapshot } from '../app-render/async-local-storage'
import {
  workUnitAsyncStorage,
  type WorkUnitStore,
} from '../app-render/work-unit-async-storage.external'
import { afterTaskAsyncStorage } from '../app-render/after-task-async-storage.external'

export type AfterContextOpts = {
  isEnabled: boolean
  waitUntil: RequestLifecycleOpts['waitUntil'] | undefined
  onClose: RequestLifecycleOpts['onClose']
  onTaskError: RequestLifecycleOpts['onAfterTaskError'] | undefined
}

export class AfterContext {
  private waitUntil: RequestLifecycleOpts['waitUntil'] | undefined
  private onClose: RequestLifecycleOpts['onClose']
  private onTaskError: RequestLifecycleOpts['onAfterTaskError'] | undefined
  public readonly isEnabled: boolean

  private runCallbacksOnClosePromise: Promise<void> | undefined
  private callbackQueue: PromiseQueue
  private workUnitStores = new Set<WorkUnitStore>()

  constructor({
    waitUntil,
    onClose,
    onTaskError,
    isEnabled,
  }: AfterContextOpts) {
    this.waitUntil = waitUntil
    this.onClose = onClose
    this.onTaskError = onTaskError
    this.isEnabled = isEnabled

    this.callbackQueue = new PromiseQueue()
    this.callbackQueue.pause()
  }

  public after(task: AfterTask): void {
    if (isThenable(task)) {
      if (!this.waitUntil) {
        errorWaitUntilNotAvailable()
      }
      this.waitUntil(task.catch((error) => this.reportTaskError(error)))
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

    const workUnitStore = workUnitAsyncStorage.getStore()
    if (workUnitStore) {
      this.workUnitStores.add(workUnitStore)
    }

    const originalPhase = workUnitStore?.phase

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
    const wrappedCallback = bindSnapshot(async () => {
      try {
        if (!originalPhase) {
          await callback()
        } else {
          await afterTaskAsyncStorage.run({ phase: originalPhase }, () =>
            callback()
          )
        }
      } catch (error) {
        this.reportTaskError(error)
      }
    })

    this.callbackQueue.add(wrappedCallback)
  }

  private async runCallbacksOnClose() {
    await new Promise<void>((resolve) => this.onClose!(resolve))
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

    return withExecuteRevalidates(workStore, () => {
      this.callbackQueue.start()
      return this.callbackQueue.onIdle()
    })
  }

  private reportTaskError(error: unknown) {
    // TODO(after): this is fine for now, but will need better intergration with our error reporting.
    // TODO(after): should we log this if we have a onTaskError callback?
    console.error(
      'An error occurred in a function passed to `unstable_after()`:',
      error
    )
    if (this.onTaskError) {
      // this is very defensive, but we really don't want anything to blow up in an error handler
      try {
        this.onTaskError?.(error)
      } catch (handlerError) {
        console.error(
          new InvariantError(
            '`onTaskError` threw while handling an error thrown from an `unstable_after` task',
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
    '`unstable_after()` will not work correctly, because `waitUntil` is not available in the current environment.'
  )
}
