/**
 * Polyfills `FormData` and `Blob` in the Node.js runtime.
 */

if (!(global as any).FormData) {
  Object.defineProperty(global, 'FormData', {
    get() {
      const { FormData } =
        require('next/dist/compiled/@edge-runtime/ponyfill') as typeof import('next/dist/compiled/@edge-runtime/ponyfill')
      return FormData
    },
  })
}

if (!(global as any).Blob) {
  Object.defineProperty(global, 'Blob', {
    get() {
      const { Blob } =
        require('next/dist/compiled/@edge-runtime/ponyfill') as typeof import('next/dist/compiled/@edge-runtime/ponyfill')
      return Blob
    },
  })
}
