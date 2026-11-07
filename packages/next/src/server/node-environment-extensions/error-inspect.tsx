import * as module from 'module'
import * as process from 'process'

const sourceMappingEnabled =
  // @ts-expect-error Node.js 22+ only
  typeof module.getSourceMapsSupport === 'function'
    ? // @ts-expect-error Node.js 22+ only
      module.getSourceMapsSupport().enabled
    : process.env.NODE_OPTIONS?.includes('--enable-source-maps') ||
      process.execArgv.includes('--enable-source-maps')

if (sourceMappingEnabled) {
  // Loaded on demand: the patch pulls in the source map consumer and stack
  // parser, which a server without source maps never uses.
  const { patchErrorInspectNodeJS } =
    require('../patch-error-inspect') as typeof import('../patch-error-inspect')
  patchErrorInspectNodeJS(globalThis.Error)
} else {
  // leave Errors untouched if source maps are disabled.
  // We're likely in a prod server where sourcemapping is done lazily when logs
  // are inspected so ignore-listing would permanently hide these frames.
}
