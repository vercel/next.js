import type { DraftModeProvider } from '../../server/async-storage/draft-mode-provider'

import { staticGenerationBailout } from './static-generation-bailout'

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
    if (staticGenerationBailout('draftMode().enable()')) {
      return
    }
    return this._provider.enable()
  }
  public disable() {
    if (staticGenerationBailout('draftMode().disable()')) {
      return
    }
    return this._provider.disable()
  }
}
