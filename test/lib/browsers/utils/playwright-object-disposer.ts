import { Page, BrowserContext } from 'playwright'
import {
  addSyncCloseListener,
  patchBrowserContextRemoveAllListeners,
} from './patch-remove-all-listeners'
import { createPromiseWithResolvers } from './promise-with-resolvers'
import { debugConsole } from './common'

type CloseBehavior = 'wait' | 'ignoreErrors' | 'default'
type ClosablePlaywrightObject = Page | BrowserContext

type ForceableDisposer = (force: boolean) => Promise<void>
type Disposers = {
  unrouteAll: ForceableDisposer
  removeAllListeners: ForceableDisposer
}

type DisposerKey = 'close' | keyof Disposers

const MapImpl = debugConsole ? Map : WeakMap

export class PlaywrightObjectDisposer {
  constructor(context: BrowserContext) {
    patchBrowserContextRemoveAllListeners(context)

    // There's no easy way to know if a context was closed externally, without going through the disposer,
    // so we rely on `context.on('close')` to track that.
    addSyncCloseListener(context, () => {
      this.markExternallyClosed(context)
    })
  }

  private statuses = new MapImpl<
    ClosablePlaywrightObject,
    Map<
      DisposerKey,
      | { status: 'pending'; promise: Promise<void> }
      | { status: 'fulfilled' }
      | { status: 'rejected'; reason: unknown }
    >
  >()
  private closePromises = new MapImpl<
    ClosablePlaywrightObject,
    Map<DisposerKey, Promise<void>>
  >()

  isClosed(object: ClosablePlaywrightObject): boolean {
    const key = 'close'
    const status = this.statuses.get(object)?.get(key)?.status
    return !!status && (status === 'fulfilled' || status === 'rejected')
  }

  close(object: ClosablePlaywrightObject) {
    const key = 'close'
    return this.dispose(object, key, (object) => object.close())
  }

  private markExternallyClosed(object: ClosablePlaywrightObject) {
    const key = 'close'
    const { statuses, promisesByKey } = this.getObjectState(object)
    const existingPromise = promisesByKey.get(key)
    if (!existingPromise) {
      const promise = Promise.resolve()
      promisesByKey.set(key, promise)
      statuses.set(key, { status: 'fulfilled' })
    }
  }

  private methodCache = new WeakMap<ClosablePlaywrightObject, Disposers>()
  getForceableDisposers(object: ClosablePlaywrightObject) {
    let disposers = this.methodCache.get(object)
    if (!disposers) {
      disposers = {
        removeAllListeners: this.createForcableDisposer(
          object,
          'removeAllListeners',
          async (behavior) => {
            // NOTE: for BrowserContext, this uses the patched version installed in `patchBrowserContextRemoveAllListeners`
            await object.removeAllListeners(undefined, { behavior })
          }
        ),
        unrouteAll: this.createForcableDisposer(
          object,
          'unrouteAll',
          async (behavior) => {
            await object.unrouteAll({ behavior })
          }
        ),
      }
    }
    return disposers
  }

  private dispose<TObject extends ClosablePlaywrightObject>(
    object: TObject,
    key: DisposerKey,
    closeFn: (object: TObject) => Promise<void>
  ) {
    const { statuses, promisesByKey } = this.getObjectState(object)
    const existingPromise = promisesByKey.get(key)
    if (existingPromise) {
      return existingPromise
    }

    const promise = closeFn(object)

    promisesByKey.set(key, promise)
    statuses.set(key, { status: 'pending', promise })
    promise.then(
      () => {
        statuses.set(key, { status: 'fulfilled' })
      },
      (error) => {
        statuses.set(key, { status: 'rejected', reason: error })
      }
    )

    return promise
  }

  private createForcableDisposer<TObject extends ClosablePlaywrightObject>(
    object: TObject,
    key: DisposerKey,
    closeFn: (behavior: CloseBehavior) => Promise<void>
  ): (force: boolean) => Promise<void> {
    const { statuses, promisesByKey } = this.getObjectState(object)

    let didCreatePromise = false
    // this will be invoked twice, once with `false`, and then adain with `true`.
    return (force: boolean): Promise<void> => {
      let existingPromise = promisesByKey.get(key)
      if (existingPromise && !didCreatePromise) {
        // we've seen this object + key combo before, dedupe the call.
        return existingPromise
      }

      const resolver = createPromiseWithResolvers<void>()
      promisesByKey.set(key, resolver.promise)
      didCreatePromise = true

      const rejectObject = (error: unknown) => {
        statuses.set(key, {
          status: 'rejected',
          reason: error,
        })
        resolver.reject(error)
      }
      const throwError = (error: Error) => {
        rejectObject(error)
        throw error
      }

      const fulfillObject = () => {
        statuses.set(key, {
          status: 'fulfilled',
        })
        resolver.resolve()
      }

      let state = statuses.get(key)
      if (!force) {
        if (state) {
          throwError(
            new Error(
              `Invariant: Did not expect to have existing state for ${object.constructor.name} during the first ${key} call`
            )
          )
        }

        // try to destroy the object in 'wait' mode, which might hang.
        const promise = closeFn('wait')
        statuses.set(key, {
          status: 'pending',
          promise,
        })
        promise.then(
          () => {
            fulfillObject()
          },
          (error) => {
            rejectObject(error)
          }
        )
        return promise
      } else {
        if (!state) {
          return throwError(
            new Error(
              `Invariant: Expected to have state for ${object.constructor.name} during the second ${key} call`
            )
          )
        }

        // if we settled during the first call, then we've already settled the main promise,
        // so we just return it again.
        // (but we shouldn't get called a second time if that happens)
        if (state.status !== 'pending') {
          return resolver.promise
        }

        // we're ignoring the pending call which is likely hanging, so prevent unhandled rejections.
        state.promise.catch(() => {})

        // destroy without waiting.
        const promise = closeFn('default')
        statuses.set(key, {
          status: 'pending',
          promise,
        })

        promise.then(
          () => {
            fulfillObject()
          },
          (error) => {
            rejectObject(error)
          }
        )
        return resolver.promise
      }
    }
  }

  private getObjectState(object: ClosablePlaywrightObject) {
    let promisesByKey = this.closePromises.get(object)
    if (!promisesByKey) {
      promisesByKey = new Map()
      this.closePromises.set(object, promisesByKey)
    }

    let statuses = this.statuses.get(object)
    if (!statuses) {
      statuses = new Map()
      this.statuses.set(object, statuses)
    }
    return { promisesByKey, statuses }
  }
}
