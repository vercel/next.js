// Override chunk URL mapping in the webpack runtime
// https://github.com/webpack/webpack/blob/2738eebc7880835d88c727d364ad37f3ec557593/lib/RuntimeGlobals.js#L204

import { getDeploymentIdQueryOrEmptyString } from '../build/deployment-id'

declare const __webpack_require__: any

// If we have a deployment ID, we need to append it to the webpack chunk names
// I am keeping the process check explicit so this can be statically optimized
if (process.env.NEXT_DEPLOYMENT_ID) {
  const suffix = getDeploymentIdQueryOrEmptyString()
  // eslint-disable-next-line no-undef
  const getChunkScriptFilename = __webpack_require__.u
  // eslint-disable-next-line no-undef
  __webpack_require__.u = (...args: any[]) =>
    // We enode the chunk filename because our static server matches against and encoded
    // filename path.
    encodeURI(getChunkScriptFilename(...args) + suffix)

  // eslint-disable-next-line no-undef
  const getChunkCssFilename = __webpack_require__.k
  // eslint-disable-next-line no-undef
  __webpack_require__.k = (...args: any[]) =>
    getChunkCssFilename(...args) + suffix

  // eslint-disable-next-line no-undef
  const getMiniCssFilename = __webpack_require__.miniCssF
  // eslint-disable-next-line no-undef
  __webpack_require__.miniCssF = (...args: any[]) =>
    getMiniCssFilename(...args) + suffix
} else {
  // eslint-disable-next-line no-undef
  const getChunkScriptFilename = __webpack_require__.u
  // eslint-disable-next-line no-undef
  __webpack_require__.u = (...args: any[]) =>
    // We enode the chunk filename because our static server matches against and encoded
    // filename path.
    encodeURI(getChunkScriptFilename(...args))

  // We don't need to override __webpack_require__.k because we don't modify
  // the css chunk name when not using deployment id suffixes

  // WE don't need to override __webpack_require__.miniCssF because we don't modify
  // the mini css chunk name when not using deployment id suffixes
}

export {}
