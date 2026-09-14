import * as RspackCore from '@rspack/core'
import { NapiNextExternalsPluginOptions } from '@next/rspack-binding'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare class NextExternalsPlugin {
  /**
   * The banner text to be added to the output file.
   */
  constructor(options: NapiNextExternalsPluginOptions)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare class ForceCompleteRuntimePlugin {
  constructor()
}

declare const core: typeof RspackCore & {
  NextExternalsPlugin: typeof NextExternalsPlugin
  ForceCompleteRuntimePlugin: typeof ForceCompleteRuntimePlugin
}

export = core
