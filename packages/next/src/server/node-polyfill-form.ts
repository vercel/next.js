/**
 * Polyfills `FormData` and `Blob` in the Node.js runtime.
 */

if (!global.FormData || !global.Blob) {
  let installedFormData: any
  let installedBlob: any
  Object.defineProperty(global, 'FormData', {
    get() {
      if (!installedFormData) {
        const polyfills = require('next/dist/compiled/@edge-runtime/ponyfill')
        installedFormData = polyfills.FormData
        installedBlob = polyfills.Blob
        return installedFormData
      }
      return installedFormData
    },
  })

  Object.defineProperty(global, 'Blob', {
    get() {
      if (installedBlob) {
        return installedBlob
      }
      const polyfills = require('next/dist/compiled/@edge-runtime/ponyfill')
      installedFormData = polyfills.FormData
      installedBlob = polyfills.Blob
      return installedBlob
    },
  })
}
