import { createPromiseWithResolvers } from '../../shared/lib/promise-with-resolvers'
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
  private closeController = new CloseController()
  private finishedWithoutErrors = createPromiseWithResolvers<void>()

  readonly context: Ctx = {
    waitUntil: this.awaiter.waitUntil.bind(this.awaiter),
    onClose: this.closeController.onClose.bind(this.closeController),
    onTaskError: (error) => this.finishedWithoutErrors.reject(error),
  }

  public async executeAfter() {
    this.closeController.dispatchClose()
    await this.awaiter.awaiting()

    // if we got an error while running the callbacks,
    // thenthis is a noop, because the promise is already rejected
    this.finishedWithoutErrors.resolve()

    return this.finishedWithoutErrors.promise
  }
}
