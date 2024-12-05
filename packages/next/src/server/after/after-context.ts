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
import {
  afterTaskAsyncStorage,
  type AfterTaskStore,
} from '../app-render/after-task-async-storage.external'
import isError from '../../lib/is-error'
import {
  stitchAfterCallstack,
  AFTER_CALLBACK_MARKER_FRAME,
  AFTER_PROMISE_MARKER_FRAME,
  type AfterTaskStackInfo,
  type CaptureStackTrace,
} from './stitch-after-callstack'

export type AfterContextOpts = {
  waitUntil: RequestLifecycleOpts['waitUntil'] | undefined
  onClose: RequestLifecycleOpts['onClose']
  onTaskError: RequestLifecycleOpts['onAfterTaskError'] | undefined
}

type TaskCallerInfo = {
  callerStack: CaptureStackTrace
  reactOwnerStack: string | null
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

  public after(task: AfterTask, callerInfo: TaskCallerInfo): void {
    if (isThenable(task)) {
      if (!this.waitUntil) {
        errorWaitUntilNotAvailable()
      }

      const wrapper = {
        [AFTER_PROMISE_MARKER_FRAME]: async () => {
          try {
            await task
          } catch (error) {
            let stackInfo: AfterTaskStackInfo
            const afterTaskStore = afterTaskAsyncStorage.getStore()
            if (!afterTaskStore) {
              // topmost after
              stackInfo = {
                rootTaskReactOwnerStack: callerInfo.reactOwnerStack,
                rootTaskCallerStack: callerInfo.callerStack,
                nestedTaskCallerStacks: undefined,
              }
            } else {
              // nested after
              stackInfo = {
                ...afterTaskStore,
                nestedTaskCallerStacks: [
                  callerInfo.callerStack,
                  ...(afterTaskStore.nestedTaskCallerStacks ?? []),
                ],
              }
            }
            this.reportTaskError('promise', error, stackInfo)
          }
        },
      }[AFTER_PROMISE_MARKER_FRAME]

      this.waitUntil(wrapper())
    } else if (typeof task === 'function') {
      // TODO(after): implement tracing
      this.addCallback(task, callerInfo)
    } else {
      throw new Error('`after()`: Argument must be a promise or a function')
    }
  }

  private addCallback(callback: AfterCallback, callerInfo: TaskCallerInfo) {
    // if something is wrong, throw synchronously, bubbling up to the `after` callsite.
    if (!this.waitUntil) {
      errorWaitUntilNotAvailable()
    }

    const workUnitStore = workUnitAsyncStorage.getStore()
    if (workUnitStore) {
      this.workUnitStores.add(workUnitStore)
    }

    const outerAfterTaskStore = afterTaskAsyncStorage.getStore()

    // This is used for checking if request APIs can be called inside `after`.
    // Note that we need to check the phase in which the *topmost* `after` was called (which should be "action"),
    // not the current phase (which might be "after" if we're in a nested after).
    // Otherwise, we might allow `after(() => headers())`, but not `after(() => after(() => headers()))`.

    let newAfterTaskStore: AfterTaskStore
    if (!outerAfterTaskStore) {
      // topmost after
      newAfterTaskStore = {
        rootTaskSpawnPhase: workUnitStore?.phase,
        rootTaskReactOwnerStack: callerInfo.reactOwnerStack,
        rootTaskCallerStack: callerInfo.callerStack,
        nestedTaskCallerStacks: undefined,
      }
    } else {
      // nested after
      newAfterTaskStore = {
        ...outerAfterTaskStore,
        nestedTaskCallerStacks: [
          callerInfo.callerStack,
          ...(outerAfterTaskStore.nestedTaskCallerStacks ?? []),
        ],
      }
    }

    // NOTE: the `await` is load-bearing, otherwise the frame might get omitted.
    const callbackWithStackMarker = {
      [AFTER_CALLBACK_MARKER_FRAME]: async () => await callback(),
    }[AFTER_CALLBACK_MARKER_FRAME]

    // Bind the callback to the current execution context (i.e. preserve all currently available ALS-es).
    // We do this because we want all of these to be equivalent in every regard except timing:
    //   after(() => x())
    //   after(x())
    //   await x()
    const wrappedCallback = bindSnapshot(async () => {
      try {
        await afterTaskAsyncStorage.run(
          newAfterTaskStore,
          callbackWithStackMarker
        )
      } catch (error) {
        this.reportTaskError('function', error, newAfterTaskStore)
      }
    })

    this.callbackQueue.add(wrappedCallback)

    // this should only happen once.
    if (!this.runCallbacksOnClosePromise) {
      this.runCallbacksOnClosePromise = this.runCallbacksOnClose()
      this.waitUntil(this.runCallbacksOnClosePromise)
    }
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

  private reportTaskError(
    taskKind: 'promise' | 'function',
    error: unknown,
    stackInfo: AfterTaskStackInfo
  ) {
    if (stackInfo && isError(error)) {
      try {
        error = stitchAfterCallstack(error, stackInfo)
      } catch (stitchError) {
        // if something goes wrong here, we just want to log it
        console.error(
          new InvariantError('Could not stitch callstack for after callback', {
            cause: stitchError,
          })
        )
      }
    }

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
