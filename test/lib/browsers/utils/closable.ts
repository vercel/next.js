import { debugConsole } from './common'

export interface Closable {
  closer: Closer
  close(): Promise<void>
}

export class Closer {
  private object: Closable | null = null
  private closeListeners: Set<() => void | Promise<void>> | null = null

  private state: 'initial' | 'closing' | 'closed' | 'close-error' = 'initial'

  constructor(object: Closable, owner?: Closable) {
    this.attach(object)
    if (owner) {
      this.closeWhen(owner)
    }
  }

  closeWhen(owner: Closable) {
    if (this.object === null) {
      throw new Error('Cannot attach a Closer to multiple objects')
    }
    const owned = this.object
    if (owner === owned) {
      throw new Error('A closable object cannot be attached to itself')
    }

    debugConsole?.log(
      `[closer] ${owned.constructor.name} will close when ${owner.constructor.name} does`
    )

    if (this.state !== 'initial') {
      throw new Error('Cannot call onClose after Closer has been closed')
    }
    const ownerCloser = owner instanceof Closer ? owner : owner.closer
    if (ownerCloser.state !== 'initial') {
      throw new Error('Cannot call onClose after parent Closer has been closed')
    }

    // we bind it when defining it in `attach()`.
    const destructor = owned.close

    ownerCloser.onClose(destructor)
    this.onClose(ownerCloser.offClose.bind(ownerCloser, destructor))
  }

  private attach(object: Closable) {
    if (this.object !== null) {
      throw new Error('Cannot attach a Closer to multiple objects')
    }
    this.object = object

    // make `object.close()` executable only once.
    const closeOnce = this.createOneTimeDestructor(object)

    Object.defineProperty(object, 'close', {
      value: closeOnce,
      writable: false,
    })
  }

  private createOneTimeDestructor(object: Closable) {
    const originalClose = object.close
    return once(async (): Promise<void> => {
      debugConsole?.log(`[closer] ${object.constructor.name}.close()`)
      this.state = 'closing'
      try {
        // close any dependent objects before closing this one.
        await this.notifyListeners()

        await originalClose.call(object)

        this.state = 'closed'
      } catch (err) {
        this.state = 'close-error'
        throw err
      }
    })
  }

  isClosed() {
    return this.state === 'closed' || this.state === 'close-error'
  }

  onClose(listener: () => void | Promise<void>) {
    if (this.state !== 'initial') {
      throw new Error('Cannot call onClose after Closer has been closed')
    }
    this.closeListeners ??= new Set()
    this.closeListeners.add(listener)
  }

  offClose(listener: () => void | Promise<void>) {
    if (!this.closeListeners) {
      return
    }
    this.closeListeners.delete(listener)
  }

  private notifyListeners = once(async () => {
    if (!this.closeListeners) {
      return
    }
    const closeListeners = this.closeListeners
    this.closeListeners = null
    // TODO: maybe this should be an allSettled?
    await Promise.all(Array.from(closeListeners).map((listener) => listener()))
  })
}

function once<T>(run: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null
  return async () => {
    if (!promise) {
      try {
        promise = run()
      } catch (err) {
        promise = Promise.reject(err)
      }
    }
    return promise
  }
}
