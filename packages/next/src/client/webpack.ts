declare const __webpack_require__: any
declare let __webpack_public_path__: string

import { getDeploymentIdQueryOrEmptyString } from '../build/deployment-id'

// If we have a deployment ID, we need to append it to the webpack chunk names
// I am keeping the process check explicit so this can be statically optimized
if (process.env.NEXT_DEPLOYMENT_ID) {
  const suffix = getDeploymentIdQueryOrEmptyString()
  const getChunkScriptFilename = __webpack_require__.u
  __webpack_require__.u = (...args: any[]) =>
    // We enode the chunk filename because our static server matches against and encoded
    // filename path.
    getChunkScriptFilename(...args) + suffix

  const getChunkCssFilename = __webpack_require__.k
  __webpack_require__.k = (...args: any[]) =>
    getChunkCssFilename(...args) + suffix

  const getMiniCssFilename = __webpack_require__.miniCssF
  __webpack_require__.miniCssF = (...args: any[]) =>
    getMiniCssFilename(...args) + suffix
}

// Ignore the module ID transform in client.
;(self as any).__next_set_public_path__ = (path: string) => {
  __webpack_public_path__ = path
}

export {}
