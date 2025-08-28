import * as RspackCore from '@rspack/core';
import { NapiNextExternalsPluginOptions } from '@next-rspack/binding';

declare class NextExternalsPlugin {
  /**
   * The banner text to be added to the output file.
   */
  constructor(options: NapiNextExternalsPluginOptions);
}

declare const core: typeof RspackCore & {
  NextExternalsPlugin: typeof NextExternalsPlugin;
};

export = core;
