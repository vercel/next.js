import * as module from 'module'
import * as process from 'process'
import { patchErrorInspectNodeJS } from '../patch-error-inspect'

const sourceMappingEnabled =
  // `next build` workers with `enablePrerenderSourceMaps` source-map errors
  // without Node.js source maps: they read source maps when an error is first
  // formatted (see `enableLazySourceMaps`).
  process.env.__NEXT_PRERENDER_SOURCE_MAPS === '1' ||
  // @ts-expect-error Node.js 22+ only
  (typeof module.getSourceMapsSupport === 'function'
    ? // @ts-expect-error Node.js 22+ only
      module.getSourceMapsSupport().enabled
    : process.env.NODE_OPTIONS?.includes('--enable-source-maps') ||
      process.execArgv.includes('--enable-source-maps'))

if (sourceMappingEnabled) {
  patchErrorInspectNodeJS(globalThis.Error)
} else {
  // leave Errors untouched if source maps are disabled.
  // We're likely in a prod server where sourcemapping is done lazily when logs
  // are inspected so ignore-listing would permanently hide these frames.
}
