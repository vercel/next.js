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
import type React from 'react'
import { DetachedPromise } from '../../lib/detached-promise'
import { AwaiterOnce } from './awaiter'
import { Suspense } from 'react'

const USE_REACT_QUEUE = !!(process.env.NEXT_AFTER_USE_REACT_QUEUE ?? '1')

export type AfterContextOpts = {
  waitUntil: RequestLifecycleOpts['waitUntil'] | undefined
  onClose: RequestLifecycleOpts['onClose']
  onTaskError: RequestLifecycleOpts['onAfterTaskError'] | undefined
  renderToReadableStream: RenderToReadableStream | undefined
}

export class AfterContext {
  private waitUntil: RequestLifecycleOpts['waitUntil'] | undefined
  private onClose: RequestLifecycleOpts['onClose']
  private onTaskError: RequestLifecycleOpts['onAfterTaskError'] | undefined

  private runCallbacksOnClosePromise: Promise<void> | undefined
  private callbackQueue: PromiseQueue | ReactCallbackQueue
  private workUnitStores = new Set<WorkUnitStore>()

  constructor({
    waitUntil,
    onClose,
    onTaskError,
    renderToReadableStream,
  }: AfterContextOpts) {
    this.waitUntil = waitUntil
    this.onClose = onClose
    this.onTaskError = onTaskError

    this.callbackQueue = (() => {
      if (USE_REACT_QUEUE && renderToReadableStream) {
        console.debug('AfterContext :: using ReactCallbackQueue')
        return new ReactCallbackQueue(renderToReadableStream)
      } else {
        console.debug('AfterContext :: using PromiseQueue', {
          USE_REACT_QUEUE,
          renderToReadableStream,
        })
        return new PromiseQueue()
      }
    })()

    // this.callbackQueue =
    //   USE_REACT_QUEUE && renderToReadableStream
    //     ? new ReactCallbackQueue(renderToReadableStream)
    //     : new PromiseQueue()

    this.callbackQueue.pause()
  }

  public after(task: AfterTask): void {
    if (isThenable(task)) {
      if (!this.waitUntil) {
        errorWaitUntilNotAvailable()
      }
      this.waitUntil(
        task.catch((error) => this.reportTaskError('promise', error))
      )
    } else if (typeof task === 'function') {
      // TODO(after): implement tracing
      this.addCallback(task)
    } else {
      throw new Error('`after()`: Argument must be a promise or a function')
    }
  }

  private addCallback(callback: AfterCallback) {
    // if something is wrong, throw synchronously, bubbling up to the `after` callsite.
    if (!this.waitUntil) {
      errorWaitUntilNotAvailable()
    }

    const workUnitStore = workUnitAsyncStorage.getStore()
    if (workUnitStore) {
      this.workUnitStores.add(workUnitStore)
    }

    const afterTaskStore = afterTaskAsyncStorage.getStore()

    // This is used for checking if request APIs can be called inside `after`.
    // Note that we need to check the phase in which the *topmost* `after` was called (which should be "action"),
    // not the current phase (which might be "after" if we're in a nested after).
    // Otherwise, we might allow `after(() => headers())`, but not `after(() => after(() => headers()))`.
    const rootTaskSpawnPhase = afterTaskStore
      ? afterTaskStore.rootTaskSpawnPhase // nested after
      : workUnitStore?.phase // topmost after

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
      // try {
      await afterTaskAsyncStorage.run({ rootTaskSpawnPhase }, () => callback())
      // } catch (error) {
      //   this.reportTaskError('function', error)
      // }
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

type RenderToReadableStream =
  typeof import('react-server-dom-webpack/server.edge').renderToReadableStream

class ReactCallbackQueue {
  elementStream:
    | {
        count: number
        transformStream: TransformStream<React.JSX.Element>
        writer: WritableStreamDefaultWriter<React.JSX.Element>
      }
    | undefined

  awaiter = new AwaiterOnce()
  running: Promise<void> | undefined

  constructor(private renderToReadableStream: RenderToReadableStream) {}

  public add(callback: () => Promise<void>) {
    if (!this.elementStream) {
      const transformStream = new TransformStream<React.JSX.Element>()
      const writer = transformStream.writable.getWriter()
      this.elementStream = {
        count: 0,
        transformStream,
        writer,
      }
    }

    const settled = new DetachedPromise<void>()

    const id = this.elementStream.count++
    const Component = async function after() {
      try {
        await callback()
      } finally {
        settled.resolve()
      }
      return id
    }

    this.awaiter.waitUntil(settled.promise)

    // this captures the callback stack
    this.elementStream.writer.write(<Component />)
  }

  get size() {
    // TODO: track actual size
    return this.elementStream ? this.elementStream.count : 0
  }

  public pause() {}

  public start() {
    if (!this.running) {
      this.running = this.startImpl()
    }
    return this.running
  }

  private async startImpl() {
    const elementStream = this.elementStream
    if (!elementStream) {
      // nothing has been queued
      return
    }

    // stop the stream when we know nothing is running and no new callbacks can be added
    this.awaiter.awaiting().then(() => {
      elementStream.writer.releaseLock()
      return elementStream.transformStream.writable.close()
    })

    const resultStream = this.renderToReadableStream(
      elementStream.transformStream.readable,
      {},
      { environmentName: 'After' }
    )

    const root = await createFromReadableStream<
      typeof elementStream.transformStream.readable
    >(resultStream, {
      serverConsumerManifest: {
        moduleLoading: null,
        moduleMap: {},
        serverModuleMap: {},
      },
      environmentName: 'AfterDecode',
      replayConsoleLogs: true,
    })

    const ReactDOMServer =
      require('react-dom/server.edge') as typeof import('react-dom/server.edge')

    const elements: React.JSX.Element[] = []
    for await (const element of root) {
      elements.push(element)
    }

    try {
      const fizzStream = await ReactDOMServer.renderToReadableStream(
        <>
          {elements.map((el, i) => (
            <Suspense key={i}>{el}</Suspense>
          ))}
        </>,
        {}
      )

      for await (const _ of fizzStream) {
      }
    } catch (err) {
      console.error('caught error while deserializing stream', err)
    }

    this.elementStream = undefined
  }

  public async onIdle() {
    if (!this.elementStream) {
      // nothing has been queued
      return
    }
    if (this.running) {
      return this.running
    }
    throw new Error(
      "Not implemented: onIdle() on a queue that hasn't been started"
    )
  }
}

function errorWaitUntilNotAvailable(): never {
  throw new Error(
    '`after()` will not work correctly, because `waitUntil` is not available in the current environment.'
  )
}

type CreateFromReadableStream =
  typeof import('react-server-dom-webpack/client.edge').createFromReadableStream

const createFromReadableStream = (() => {
  // @TODO: investigate why the aliasing for turbopack doesn't pick this up, requiring this runtime check
  if (process.env.TURBOPACK) {
    // eslint-disable-next-line import/no-extraneous-dependencies
    return require('react-server-dom-turbopack/client.edge')
      .createFromReadableStream as CreateFromReadableStream
  } else {
    // eslint-disable-next-line import/no-extraneous-dependencies
    return require('react-server-dom-webpack/client.edge')
      .createFromReadableStream as CreateFromReadableStream
  }
})()
