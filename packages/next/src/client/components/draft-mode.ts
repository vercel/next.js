import { RequestStore } from './request-async-storage'
import { staticGenerationBailout } from './static-generation-bailout'

export class DraftMode {
  #requestStore: RequestStore
  constructor(requestStore: RequestStore) {
    this.#requestStore = requestStore
  }
  get isEnabled() {
    return this.#requestStore.draftMode.isEnabled
  }
  public enable() {
    if (staticGenerationBailout('draftMode().enable()')) {
      return
    }
    return this.#requestStore.draftMode.enable()
  }
  public disable() {
    if (staticGenerationBailout('draftMode().disable()')) {
      return
    }
    return this.#requestStore.draftMode.disable()
  }
}
