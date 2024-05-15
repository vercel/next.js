import type { RequestLifecycleOpts } from '../base-server'

export interface AfterContext {}

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

  constructor({ waitUntil, onClose }: AfterContextOpts) {
    this.waitUntil = waitUntil
    this.onClose = onClose
  }
}
