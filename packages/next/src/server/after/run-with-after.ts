import { DetachedPromise } from '../../lib/detached-promise'
import { CloseController } from '../web/web-on-close'
import type { AfterContextOpts } from './after-context'
import { AwaiterOnce } from './awaiter'

type Ctx = {
  waitUntil: NonNullable<AfterContextOpts['waitUntil']>
  onClose: NonNullable<AfterContextOpts['onClose']>
  onTaskError: NonNullable<AfterContextOpts['onTaskError']>
}

export class AfterRunner {
  private awaiter = new AwaiterOnce()

  private close:
    | {
        type: 'external'
        onClose: Ctx['onClose']
      }
    | {
        type: 'internal'
        controller: CloseController
      }

  private finishedWithoutErrors = new DetachedPromise<void>()
  readonly context: Ctx

  constructor(options: { onClose?: Ctx['onClose'] } = {}) {
    let onClose: Ctx['onClose']
    if (options.onClose) {
      onClose = options.onClose
      this.close = { type: 'external', onClose }
    } else {
      const controller = new CloseController()
      onClose = controller.onClose.bind(controller)
      this.close = { type: 'internal', controller: controller }
    }
    this.context = {
      waitUntil: this.awaiter.waitUntil.bind(this.awaiter),
      onClose,
      onTaskError: (error) => this.finishedWithoutErrors.reject(error),
    }
  }

  public async executeAfter() {
    if (this.close.type === 'internal') {
      this.close.controller.dispatchClose()
    }
    await this.awaiter.awaiting()

    // if we got an error while running the callbacks,
    // thenthis is a noop, because the promise is already rejected
    this.finishedWithoutErrors.resolve()

    return this.finishedWithoutErrors.promise
  }
}
