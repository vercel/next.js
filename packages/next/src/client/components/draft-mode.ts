import type { DraftModeProvider } from '../../server/async-storage/draft-mode-provider'

import { staticGenerationAsyncStorage } from './static-generation-async-storage.external'
import { trackDynamicDataAccessed } from '../../server/app-render/dynamic-rendering'

export class DraftMode {
  /**
   * @internal - this declaration is stripped via `tsc --stripInternal`
   */
  private readonly _provider: DraftModeProvider

  constructor(provider: DraftModeProvider) {
    this._provider = provider
  }
  get isEnabled() {
    return this._provider.isEnabled
  }
  public enable() {
    const store = staticGenerationAsyncStorage.getStore()
    if (store) {
      // We we have a store we want to track dynamic data access to ensure we
      // don't statically generate routes that manipulate draft mode.
      trackDynamicDataAccessed(store, 'draftMode().enable()')
    }
    return this._provider.enable()
  }
  public disable() {
    const store = staticGenerationAsyncStorage.getStore()
    if (store) {
      // We we have a store we want to track dynamic data access to ensure we
      // don't statically generate routes that manipulate draft mode.
      trackDynamicDataAccessed(store, 'draftMode().disable()')
    }
    return this._provider.disable()
  }
}
