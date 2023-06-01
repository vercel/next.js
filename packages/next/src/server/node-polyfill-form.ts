/**
 * Polyfills `FormData` and `Blob` in the Node.js runtime.
 */

if (!(global as any).FormData) {
  const { FormData } =
    require('next/dist/compiled/@edge-runtime/ponyfill') as typeof import('next/dist/compiled/@edge-runtime/ponyfill')
  ;(global as any).FormData = FormData
}

if (!(global as any).Blob) {
  const { Blob } =
    require('next/dist/compiled/@edge-runtime/ponyfill') as typeof import('next/dist/compiled/@edge-runtime/ponyfill')
  ;(global as any).Blob = Blob
}
